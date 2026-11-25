import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { getServerDao, getVaultEntryDao } from '../dao/DaoFactory.js';
import { credentialEncryptionKey } from './credentialBindingService.js';
import { vaultEvents, type VaultTokensChanged } from './vaultEvents.js';
import {
  hasVaultReference,
  isWellFormedVaultValue,
  listVaultReferences,
  replaceVaultReferences,
  vaultReferencesIn,
  type VaultReference,
} from '../utils/vaultReferences.js';
import type {
  StoredVaultEntry,
  VaultAccount,
  VaultAccountInput,
  VaultAccountLink,
  VaultAccountSummary,
  VaultEntryInput,
  VaultEntrySummary,
  VaultSecrets,
  VaultToken,
  VaultTokenInput,
} from '../types/index.js';

export class VaultError extends Error {}

export class VaultNotFoundError extends VaultError {}

export const VAULT_LIMITS = {
  name: 128,
  description: 2000,
  tags: 32,
  tag: 64,
  url: 2048,
  host: 255,
  accounts: 50,
  username: 255,
  tokens: 50,
  tokenName: 128,
  secret: 8192,
  image: 400_000,
} as const;

const IMAGE_PATTERN = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/;
const URL_PATTERN = /^[a-z][a-z0-9+.-]*:\/\/\S+$/i;
const HOST_PATTERN = /^[A-Za-z0-9._:[\]%-]+$/;
const LEGACY_TOKEN_ID = 'bearer';

const storedTokens = (entry: StoredVaultEntry): VaultToken[] =>
  entry.tokens ?? (entry.hasBearerToken ? [{ id: LEGACY_TOKEN_ID, name: '' }] : []);

const optionalText = (value: unknown, field: string, max: number): string | null => {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new VaultError(`${field} must be a string`);
  const trimmed = value.trim();
  if (trimmed.length > max) throw new VaultError(`${field} must be at most ${max} characters`);
  return trimmed || null;
};

const normalizeTags = (value: unknown): string[] => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new VaultError('tags must be an array of strings');
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') throw new VaultError('tags must be an array of strings');
    const tag = item.trim().replace(/\s+/g, ' ');
    if (!tag) continue;
    if (tag.length > VAULT_LIMITS.tag)
      throw new VaultError(`Each tag must be at most ${VAULT_LIMITS.tag} characters`);
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  if (tags.length > VAULT_LIMITS.tags)
    throw new VaultError(`At most ${VAULT_LIMITS.tags} tags are allowed`);
  return tags;
};

const normalizeUrl = (value: unknown): string | null => {
  const url = optionalText(value, 'url', VAULT_LIMITS.url);
  if (url && !URL_PATTERN.test(url))
    throw new VaultError('url must include a scheme, e.g. https://');
  return url;
};

const normalizeHost = (value: unknown): string | null => {
  const host = optionalText(value, 'host', VAULT_LIMITS.host);
  if (host && !HOST_PATTERN.test(host))
    throw new VaultError('host must be a hostname or IP address');
  return host;
};

const normalizePort = (value: unknown): number | null => {
  if (value === undefined || value === null || value === '') return null;
  const port = typeof value === 'string' ? Number(value.trim()) : value;
  if (typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535)
    throw new VaultError('port must be an integer between 1 and 65535');
  return port;
};

const normalizeImage = (value: unknown): string | null => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !IMAGE_PATTERN.test(value))
    throw new VaultError('image must be a PNG, JPEG, WebP or GIF data URL');
  if (value.length > VAULT_LIMITS.image) throw new VaultError('image is too large');
  return value;
};

const normalizeSecret = (value: unknown, field: string): string | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw new VaultError(`${field} must be a string`);
  if (value.length > VAULT_LIMITS.secret)
    throw new VaultError(`${field} must be at most ${VAULT_LIMITS.secret} characters`);
  return value;
};

const entryIdentity = (id: string, owner: string): Buffer =>
  Buffer.from(JSON.stringify([id, owner]));

const encryptSecrets = async (
  id: string,
  owner: string,
  secrets: VaultSecrets,
): Promise<string> => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', await credentialEncryptionKey(true), iv);
  cipher.setAAD(entryIdentity(id, owner));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(secrets), 'utf8'),
    cipher.final(),
  ]);
  return [
    'v1',
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    ciphertext.toString('base64'),
  ].join('.');
};

const decryptSecrets = async (entry: StoredVaultEntry): Promise<VaultSecrets> => {
  const key = await credentialEncryptionKey();
  try {
    const [version, iv, tag, ciphertext] = entry.encryptedSecrets.split('.');
    if (version !== 'v1') throw new Error('Unsupported version');
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
    decipher.setAAD(entryIdentity(entry.id, entry.owner));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    const parsed = JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(ciphertext, 'base64')),
        decipher.final(),
      ]).toString('utf8'),
    );
    return {
      passwords: parsed?.passwords ?? {},
      tokens:
        parsed?.tokens ?? (parsed?.bearerToken ? { [LEGACY_TOKEN_ID]: parsed.bearerToken } : {}),
    };
  } catch {
    throw new VaultError(
      'Unable to unlock vault secrets; check the credential encryption key used when they were saved',
    );
  }
};

const summarizeAccount = (
  account: VaultAccount,
  sources: ReadonlyMap<string, StoredVaultEntry>,
): VaultAccountSummary => {
  const { id, username, hasPassword, link } = account;
  if (!link) return { id, username, hasPassword };
  const source = sources.get(link.entryId);
  const target = source?.accounts.find((item) => item.id === link.accountId && !item.link);
  return {
    id,
    username: target?.username ?? '',
    hasPassword: target?.hasPassword ?? false,
    link: { entryId: link.entryId, accountId: link.accountId, entryName: source?.name ?? null },
  };
};

export const toVaultSummary = (
  entry: StoredVaultEntry,
  sources: ReadonlyMap<string, StoredVaultEntry> = new Map(),
): VaultEntrySummary => ({
  id: entry.id,
  name: entry.name,
  description: entry.description ?? null,
  tags: entry.tags ?? [],
  url: entry.url ?? null,
  host: entry.host ?? null,
  port: entry.port ?? null,
  image: entry.image ?? null,
  accounts: entry.accounts.map((account) => summarizeAccount(account, sources)),
  tokens: storedTokens(entry).map(({ id, name }) => ({ id, name })),
  starred: entry.starred === true,
  createdAt: entry.createdAt,
  updatedAt: entry.updatedAt,
});

const validateLink = async (
  owner: string,
  entryId: string | undefined,
  raw: unknown,
): Promise<VaultAccountLink> => {
  const link = raw as Partial<VaultAccountLink>;
  if (
    !link ||
    typeof link !== 'object' ||
    typeof link.entryId !== 'string' ||
    typeof link.accountId !== 'string'
  )
    throw new VaultError('An account link needs an entryId and an accountId');
  if (link.entryId === entryId) throw new VaultError('An account cannot link to its own entry');
  const source = await getVaultEntryDao().findById(link.entryId);
  if (!source || source.owner !== owner)
    throw new VaultError('The linked vault entry was not found');
  const target = source.accounts.find((account) => account.id === link.accountId);
  if (!target) throw new VaultError('The linked account was not found');
  if (target.link) throw new VaultError('Link to the original account, not to another link');
  return { entryId: link.entryId, accountId: link.accountId };
};

const buildEntry = async (
  owner: string,
  input: unknown,
  current?: StoredVaultEntry,
): Promise<StoredVaultEntry> => {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new VaultError('Request body must be an object');
  const body = input as Partial<VaultEntryInput>;
  const name = optionalText(body.name, 'name', VAULT_LIMITS.name);
  if (!name) throw new VaultError('name is required');

  const rawAccounts =
    body.accounts === undefined && current
      ? current.accounts.map(({ id, username, link }) => ({ id, username, link }))
      : (body.accounts ?? []);
  if (!Array.isArray(rawAccounts)) throw new VaultError('accounts must be an array');
  if (rawAccounts.length > VAULT_LIMITS.accounts)
    throw new VaultError(`At most ${VAULT_LIMITS.accounts} accounts are allowed`);

  const previous: VaultSecrets = current
    ? await decryptSecrets(current)
    : { passwords: {}, tokens: {} };
  const knownAccounts = new Set(current?.accounts.map((account) => account.id) ?? []);
  const passwords: Record<string, string> = {};
  const accounts: VaultAccount[] = [];
  const usedIds = new Set<string>();
  for (const raw of rawAccounts as VaultAccountInput[]) {
    if (!raw || typeof raw !== 'object') throw new VaultError('Each account must be an object');
    if (raw.link) {
      const link = await validateLink(owner, current?.id, raw.link);
      const linkedId =
        typeof raw.id === 'string' && knownAccounts.has(raw.id) && !usedIds.has(raw.id)
          ? raw.id
          : randomUUID();
      usedIds.add(linkedId);
      accounts.push({ id: linkedId, username: '', hasPassword: false, link });
      continue;
    }
    const username = optionalText(raw.username, 'username', VAULT_LIMITS.username);
    const password = normalizeSecret(raw.password, 'password');
    if (!username && !password && !(typeof raw.id === 'string' && knownAccounts.has(raw.id)))
      continue;
    const id =
      typeof raw.id === 'string' && knownAccounts.has(raw.id) && !usedIds.has(raw.id)
        ? raw.id
        : randomUUID();
    usedIds.add(id);
    const stored = password ?? previous.passwords[id];
    if (stored) passwords[id] = stored;
    if (!username && !stored) continue;
    accounts.push({ id, username: username ?? '', hasPassword: Boolean(stored) });
  }

  const currentTokens = current ? storedTokens(current) : [];
  const rawTokens =
    body.tokens === undefined ? currentTokens.map(({ id, name }) => ({ id, name })) : body.tokens;
  if (!Array.isArray(rawTokens)) throw new VaultError('tokens must be an array');
  if (rawTokens.length > VAULT_LIMITS.tokens)
    throw new VaultError(`At most ${VAULT_LIMITS.tokens} bearer tokens are allowed`);

  const knownTokens = new Set(currentTokens.map((token) => token.id));
  const tokenValues: Record<string, string> = {};
  const tokens: VaultToken[] = [];
  const usedTokenIds = new Set<string>();
  for (const raw of rawTokens as VaultTokenInput[]) {
    if (!raw || typeof raw !== 'object') throw new VaultError('Each token must be an object');
    const tokenName = optionalText(raw.name, 'token name', VAULT_LIMITS.tokenName);
    const value = normalizeSecret(raw.token, 'token');
    const known =
      typeof raw.id === 'string' && knownTokens.has(raw.id) && !usedTokenIds.has(raw.id);
    if (!tokenName && !value && !known) continue;
    const tokenId = known ? (raw.id as string) : randomUUID();
    usedTokenIds.add(tokenId);
    const stored = value ?? previous.tokens[tokenId];
    if (!stored) throw new VaultError('Each new bearer token needs a value');
    tokenValues[tokenId] = stored;
    tokens.push({ id: tokenId, name: tokenName ?? '' });
  }

  const id = current?.id ?? randomUUID();
  const now = new Date().toISOString();
  return {
    id,
    owner,
    name,
    description: optionalText(body.description, 'description', VAULT_LIMITS.description),
    tags: normalizeTags(body.tags),
    url: normalizeUrl(body.url),
    host: normalizeHost(body.host),
    port: normalizePort(body.port),
    image:
      body.image === undefined && current ? (current.image ?? null) : normalizeImage(body.image),
    accounts,
    tokens,
    starred: current?.starred === true,
    encryptedSecrets: await encryptSecrets(id, owner, { passwords, tokens: tokenValues }),
    createdAt: current?.createdAt ?? now,
    updatedAt: now,
  };
};

const findOwned = async (owner: string, id: string): Promise<StoredVaultEntry> => {
  const entry = await getVaultEntryDao().findById(id);
  if (!entry || entry.owner !== owner) throw new VaultNotFoundError('Vault entry not found');
  return entry;
};

const linkSources = async (
  owner: string,
  entries: StoredVaultEntry[],
): Promise<Map<string, StoredVaultEntry>> => {
  const sources = new Map(entries.map((entry) => [entry.id, entry]));
  for (const entry of entries)
    for (const account of entry.accounts) {
      const sourceId = account.link?.entryId;
      if (!sourceId || sources.has(sourceId)) continue;
      const source = await getVaultEntryDao().findById(sourceId);
      if (source?.owner === owner) sources.set(sourceId, source);
    }
  return sources;
};

const summarize = async (owner: string, entry: StoredVaultEntry): Promise<VaultEntrySummary> =>
  toVaultSummary(entry, await linkSources(owner, [entry]));

const assertNotLinked = async (owner: string, entryId: string, kept?: StoredVaultEntry) => {
  const own = new Set(
    (kept?.accounts ?? []).filter((account) => !account.link).map((account) => account.id),
  );
  const blocked = (await getVaultEntryDao().findByOwner(owner))
    .filter((entry) => entry.id !== entryId)
    .flatMap((entry) =>
      entry.accounts
        .filter((account) => account.link?.entryId === entryId && !own.has(account.link.accountId))
        .map(() => entry.name),
    );
  if (blocked.length)
    throw new VaultError(
      `${kept ? 'A removed account' : 'This entry'} is linked from these vault entries: ${Array.from(new Set(blocked)).join(', ')}. Remove those links first`,
    );
};

export const findServersUsingVaultEntry = async (
  owner: string,
  entryId: string,
  tokenIds?: ReadonlySet<string>,
): Promise<string[]> =>
  (await getServerDao().findAll())
    .filter(
      (server) =>
        server.owner === owner &&
        listVaultReferences(server.headers).some(
          (reference) =>
            reference.entryId === entryId && (!tokenIds || tokenIds.has(reference.tokenId)),
        ),
    )
    .map((server) => server.name);

const assertUnused = async (owner: string, entryId: string, tokenIds?: ReadonlySet<string>) => {
  const servers = await findServersUsingVaultEntry(owner, entryId, tokenIds);
  if (servers.length)
    throw new VaultError(
      `${tokenIds ? 'A removed bearer token' : 'This entry'} is used by these servers: ${servers.join(', ')}. Pick another vault token in those servers first`,
    );
};

export const resolveVaultHeaderReferences = async (
  headers: Record<string, string>,
  owner: string | undefined,
): Promise<Record<string, string>> => {
  if (!Object.values(headers).some(hasVaultReference)) return headers;
  if (!owner) throw new VaultError('Vault references need a server owner');
  const loaded = new Map<string, Promise<{ tokens: VaultToken[]; secrets: VaultSecrets }>>();
  const tokenValue = async ({ entryId, tokenId }: VaultReference): Promise<string> => {
    if (!loaded.has(entryId))
      loaded.set(
        entryId,
        (async () => {
          const entry = await getVaultEntryDao().findById(entryId);
          if (!entry || entry.owner !== owner)
            throw new VaultNotFoundError(
              `A vault entry referenced by this server is not in ${owner}'s vault`,
            );
          return { tokens: storedTokens(entry), secrets: await decryptSecrets(entry) };
        })(),
      );
    const { tokens, secrets } = await loaded.get(entryId)!;
    const value = tokens.some((token) => token.id === tokenId)
      ? secrets.tokens[tokenId]
      : undefined;
    if (!value)
      throw new VaultNotFoundError('A vault token referenced by this server no longer exists');
    return value;
  };
  const resolved: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (!hasVaultReference(value)) {
      resolved[name] = value;
      continue;
    }
    if (!isWellFormedVaultValue(value))
      throw new VaultError(`Header "${name}" has an invalid vault reference`);
    const values: string[] = [];
    for (const reference of vaultReferencesIn(value)) values.push(await tokenValue(reference));
    const output = replaceVaultReferences(value, values);
    if (/[\r\n]/.test(output))
      throw new VaultError(`The vault token for header "${name}" contains a line break`);
    resolved[name] = output;
  }
  return resolved;
};

const byName = (a: VaultEntrySummary, b: VaultEntrySummary) =>
  Number(b.starred) - Number(a.starred) ||
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

export const listVaultEntries = async (owner: string): Promise<VaultEntrySummary[]> => {
  const entries = await getVaultEntryDao().findByOwner(owner);
  const sources = await linkSources(owner, entries);
  return entries.map((entry) => toVaultSummary(entry, sources)).sort(byName);
};

export const getVaultEntry = async (owner: string, id: string): Promise<VaultEntrySummary> =>
  summarize(owner, await findOwned(owner, id));

export const createVaultEntry = async (
  owner: string,
  input: unknown,
): Promise<VaultEntrySummary> => {
  const entry = await buildEntry(owner, input);
  await getVaultEntryDao().save(entry);
  return summarize(owner, entry);
};

export const updateVaultEntry = async (
  owner: string,
  id: string,
  input: unknown,
): Promise<VaultEntrySummary> => {
  const current = await findOwned(owner, id);
  const entry = await buildEntry(owner, input, current);
  const kept = new Set((entry.tokens ?? []).map((token) => token.id));
  const removed = new Set(
    storedTokens(current)
      .map((token) => token.id)
      .filter((tokenId) => !kept.has(tokenId)),
  );
  if (removed.size) await assertUnused(owner, id, removed);
  await assertNotLinked(owner, id, entry);
  const [before, after] = await Promise.all([decryptSecrets(current), decryptSecrets(entry)]);
  await getVaultEntryDao().save(entry);
  if (JSON.stringify(before.tokens) !== JSON.stringify(after.tokens))
    vaultEvents.emit('tokensChanged', { owner, entryId: id } satisfies VaultTokensChanged);
  return summarize(owner, entry);
};

export const setVaultEntryStarred = async (
  owner: string,
  id: string,
  starred: unknown,
): Promise<VaultEntrySummary> => {
  if (typeof starred !== 'boolean') throw new VaultError('starred must be a boolean');
  const entry = { ...(await findOwned(owner, id)), starred };
  await getVaultEntryDao().save(entry);
  return summarize(owner, entry);
};

export const deleteVaultEntry = async (owner: string, id: string): Promise<void> => {
  await findOwned(owner, id);
  await assertUnused(owner, id);
  await assertNotLinked(owner, id);
  await getVaultEntryDao().delete(id);
};

export const revealVaultSecrets = async (owner: string, id: string): Promise<VaultSecrets> => {
  const entry = await findOwned(owner, id);
  const secrets = await decryptSecrets(entry);
  const passwords: Record<string, string> = {};
  const sources = new Map<
    string,
    Promise<{ entry: StoredVaultEntry; secrets: VaultSecrets } | null>
  >();
  const sourceOf = (entryId: string) => {
    if (!sources.has(entryId))
      sources.set(
        entryId,
        (async () => {
          const source = await getVaultEntryDao().findById(entryId);
          return source && source.owner === owner
            ? { entry: source, secrets: await decryptSecrets(source) }
            : null;
        })(),
      );
    return sources.get(entryId)!;
  };
  for (const account of entry.accounts) {
    const link = account.link;
    if (link) {
      const source = await sourceOf(link.entryId);
      const target = source?.entry.accounts.find(
        (item) => item.id === link.accountId && !item.link,
      );
      const password = target ? source?.secrets.passwords[target.id] : undefined;
      if (password) passwords[account.id] = password;
      continue;
    }
    const password = secrets.passwords[account.id];
    if (password) passwords[account.id] = password;
  }
  const tokens: Record<string, string> = {};
  for (const token of storedTokens(entry)) {
    const value = secrets.tokens[token.id];
    if (value) tokens[token.id] = value;
  }
  return { passwords, tokens };
};

export const deleteVaultEntriesForOwner = async (owner: string): Promise<void> => {
  await getVaultEntryDao().deleteByOwner(owner);
};
