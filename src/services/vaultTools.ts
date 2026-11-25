import { createVaultEntry, listVaultEntries, VaultError } from './vaultService.js';
import type { VaultEntryInput, VaultEntrySummary } from '../types/index.js';
import { CredentialBindingError } from '../utils/credentialTemplate.js';
import type { VaultToolName } from './vaultToolDefinitions.js';

const ok = (payload: Record<string, unknown>) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
});

const failure = (message: string) => ({
  isError: true,
  content: [{ type: 'text' as const, text: message }],
});

const optionalString = (value: unknown, field: string): string | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new VaultError(`${field} must be a string`);
  return value;
};

const presentEntry = ({ image, ...entry }: VaultEntrySummary) => ({
  ...entry,
  hasImage: Boolean(image),
});

export const matchesVaultFilter = (
  entry: VaultEntrySummary,
  filter: { tag?: string; query?: string },
): boolean => {
  const tag = filter.tag?.trim().toLowerCase();
  if (tag && !(entry.tags ?? []).some((value) => value.toLowerCase() === tag)) return false;
  const query = filter.query?.trim().toLowerCase();
  if (!query) return true;
  return [entry.name, entry.description, entry.url, entry.host, ...(entry.tags ?? [])].some(
    (value) => typeof value === 'string' && value.toLowerCase().includes(query),
  );
};

export const executeVaultTool = async (
  name: VaultToolName,
  rawArgs: unknown,
  owner: string,
): Promise<{ isError?: boolean; content: Array<{ type: 'text'; text: string }> }> => {
  try {
    const args =
      rawArgs && typeof rawArgs === 'object' && !Array.isArray(rawArgs)
        ? (rawArgs as Record<string, unknown>)
        : {};
    if (name === 'mcphub_vault_list') {
      const filter = {
        tag: optionalString(args.tag, 'tag'),
        query: optionalString(args.query, 'query'),
      };
      const entries = (await listVaultEntries(owner)).filter((entry) =>
        matchesVaultFilter(entry, filter),
      );
      return ok({ entries: entries.map(presentEntry), total: entries.length });
    }
    const input: VaultEntryInput = {
      name: args.name as string,
      description: args.description as string | undefined,
      tags: args.tags as string[] | undefined,
      url: args.url as string | undefined,
      host: args.host as string | undefined,
      port: args.port as number | undefined,
      accounts: args.accounts as VaultEntryInput['accounts'],
      tokens: args.tokens as VaultEntryInput['tokens'],
    };
    const entry = await createVaultEntry(owner, input);
    return ok({ created: true, entry: presentEntry(entry) });
  } catch (error) {
    if (error instanceof VaultError || error instanceof CredentialBindingError)
      return failure(error.message);
    return failure('Vault request failed');
  }
};
