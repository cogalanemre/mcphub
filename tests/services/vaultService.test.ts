import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCipheriv, randomBytes, randomUUID } from 'node:crypto';
import { CredentialBindingDaoImpl } from '../../src/dao/CredentialBindingDao.js';
import { VaultEntryDaoImpl, getVaultStorePath } from '../../src/dao/VaultEntryDao.js';
import { credentialEncryptionKey } from '../../src/services/credentialBindingService.js';
import { vaultEvents } from '../../src/services/vaultEvents.js';
import {
  createVaultEntry,
  deleteVaultEntriesForOwner,
  deleteVaultEntry,
  getVaultEntry,
  listVaultEntries,
  findServersUsingVaultEntry,
  resolveVaultHeaderReferences,
  revealVaultSecrets,
  setVaultEntryStarred,
  updateVaultEntry,
  VaultError,
  VaultNotFoundError,
} from '../../src/services/vaultService.js';

jest.mock('../../src/dao/DaoFactory.js', () => ({
  getCredentialBindingDao: () => new CredentialBindingDaoImpl(),
  getVaultEntryDao: () => new VaultEntryDaoImpl(),
  getServerDao: () => ({ findAll: async () => mockServers }),
}));

let mockServers: Array<{ name: string; owner?: string; headers?: Record<string, string> }> = [];

let directory: string;
const originalPath = process.env.MCPHUB_SETTING_PATH;
const originalKey = process.env.MCPHUB_CREDENTIAL_ENCRYPTION_KEY;
const originalUseDb = process.env.USE_DB;

beforeEach(() => {
  mockServers = [];
  process.env.USE_DB = 'false';
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mcphub-vault-'));
  process.env.MCPHUB_SETTING_PATH = path.join(directory, 'settings.json');
  process.env.MCPHUB_CREDENTIAL_ENCRYPTION_KEY = randomBytes(32).toString('base64');
});

afterEach(() => {
  fs.rmSync(directory, { recursive: true, force: true });
  if (originalUseDb === undefined) delete process.env.USE_DB;
  else process.env.USE_DB = originalUseDb;
  if (originalPath === undefined) delete process.env.MCPHUB_SETTING_PATH;
  else process.env.MCPHUB_SETTING_PATH = originalPath;
  if (originalKey === undefined) delete process.env.MCPHUB_CREDENTIAL_ENCRYPTION_KEY;
  else process.env.MCPHUB_CREDENTIAL_ENCRYPTION_KEY = originalKey;
});

const mongo = {
  name: 'Orders MongoDB',
  description: 'Primary cluster',
  tags: ['mongo', ' Orders ', 'MONGO'],
  url: 'mongodb://db.example.com:27017',
  host: '10.0.0.12',
  port: '27017',
  accounts: [
    { username: 'app', password: 'app-secret' },
    { username: 'readonly', password: 'ro-secret' },
  ],
  tokens: [
    { name: 'CI', token: 'token-secret' },
    { name: 'Ops', token: 'ops-secret' },
  ],
};

const legacyCiphertext = async (id: string, owner: string, secrets: object) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', await credentialEncryptionKey(), iv);
  cipher.setAAD(Buffer.from(JSON.stringify([id, owner])));
  const body = Buffer.concat([cipher.update(JSON.stringify(secrets), 'utf8'), cipher.final()]);
  return [
    'v1',
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    body.toString('base64'),
  ].join('.');
};

describe('vaultService', () => {
  it('stores secrets encrypted and returns summaries without them', async () => {
    const created = await createVaultEntry('alice', mongo);

    expect(created).toMatchObject({
      name: 'Orders MongoDB',
      tags: ['mongo', 'Orders'],
      port: 27017,
      tokens: [
        { id: expect.any(String), name: 'CI' },
        { id: expect.any(String), name: 'Ops' },
      ],
    });
    expect(created.accounts.map((account) => [account.username, account.hasPassword])).toEqual([
      ['app', true],
      ['readonly', true],
    ]);
    expect(JSON.stringify(created)).not.toMatch(/secret/);

    const raw = fs.readFileSync(getVaultStorePath(), 'utf8');
    expect(raw).not.toMatch(/app-secret|ro-secret|token-secret|ops-secret/);
    expect(fs.statSync(getVaultStorePath()).mode & 0o777).toBe(0o600);

    const secrets = await revealVaultSecrets('alice', created.id);
    expect(Object.values(secrets.tokens).sort()).toEqual(['ops-secret', 'token-secret']);
    expect(Object.values(secrets.passwords).sort()).toEqual(['app-secret', 'ro-secret']);
  });

  it('keeps stored secrets that an update leaves empty and replaces typed ones', async () => {
    const created = await createVaultEntry('alice', mongo);
    const [app, readonly] = created.accounts;
    const [ci, ops] = created.tokens;

    const updated = await updateVaultEntry('alice', created.id, {
      ...mongo,
      accounts: [
        { id: app.id, username: 'app-renamed' },
        { id: readonly.id, username: 'readonly', password: 'ro-rotated' },
        { username: 'new-user', password: 'new-secret' },
      ],
      tokens: [
        { id: ci.id, name: 'CI renamed' },
        { id: ops.id, name: 'Ops', token: 'ops-rotated' },
        { name: 'Grafana', token: 'grafana-secret' },
      ],
    });

    expect(updated.accounts.map((account) => account.username)).toEqual([
      'app-renamed',
      'readonly',
      'new-user',
    ]);
    const secrets = await revealVaultSecrets('alice', created.id);
    expect(secrets.passwords[app.id]).toBe('app-secret');
    expect(secrets.passwords[readonly.id]).toBe('ro-rotated');
    expect(updated.tokens.map((token) => token.name)).toEqual(['CI renamed', 'Ops', 'Grafana']);
    expect(secrets.tokens[ci.id]).toBe('token-secret');
    expect(secrets.tokens[ops.id]).toBe('ops-rotated');
    expect(secrets.tokens[updated.tokens[2].id]).toBe('grafana-secret');
  });

  it('keeps accounts and tokens when an update omits them', async () => {
    const created = await createVaultEntry('alice', mongo);

    const updated = await updateVaultEntry('alice', created.id, { name: 'Orders MongoDB' });

    expect(updated.accounts).toEqual(created.accounts);
    expect(updated.tokens).toEqual(created.tokens);
    const secrets = await revealVaultSecrets('alice', created.id);
    expect(Object.values(secrets.tokens).sort()).toEqual(['ops-secret', 'token-secret']);
  });

  it('drops removed accounts and tokens', async () => {
    const created = await createVaultEntry('alice', mongo);
    const [app] = created.accounts;

    const updated = await updateVaultEntry('alice', created.id, {
      ...mongo,
      accounts: [{ id: app.id, username: 'app' }],
      tokens: [],
    });

    expect(updated.tokens).toEqual([]);
    expect(updated.accounts).toHaveLength(1);
    const secrets = await revealVaultSecrets('alice', created.id);
    expect(secrets).toEqual({ passwords: { [app.id]: 'app-secret' }, tokens: {} });
  });

  it('reads a legacy single bearer token as an unnamed token and migrates it on save', async () => {
    const id = randomUUID();
    const stamp = '2026-11-25T00:00:00.000Z';
    fs.writeFileSync(
      getVaultStorePath(),
      JSON.stringify([
        {
          id,
          owner: 'alice',
          name: 'Legacy',
          accounts: [],
          hasBearerToken: true,
          encryptedSecrets: await legacyCiphertext(id, 'alice', {
            passwords: {},
            bearerToken: 'legacy-secret',
          }),
          createdAt: stamp,
          updatedAt: stamp,
        },
      ]),
    );

    const [entry] = await listVaultEntries('alice');
    const [legacy] = entry.tokens;
    expect(entry.tokens).toEqual([{ id: expect.any(String), name: '' }]);
    expect(await revealVaultSecrets('alice', id)).toEqual({
      passwords: {},
      tokens: { [legacy.id]: 'legacy-secret' },
    });

    await updateVaultEntry('alice', id, {
      name: 'Legacy',
      tokens: [{ id: legacy.id, name: 'Old token' }],
    });
    const [raw] = JSON.parse(fs.readFileSync(getVaultStorePath(), 'utf8'));
    expect(raw.hasBearerToken).toBeUndefined();
    expect(raw.tokens).toEqual([{ id: legacy.id, name: 'Old token' }]);
    expect((await revealVaultSecrets('alice', id)).tokens[legacy.id]).toBe('legacy-secret');
  });

  it('ignores account ids that do not belong to the entry', async () => {
    const other = await createVaultEntry('alice', mongo);
    const created = await createVaultEntry('alice', { name: 'Redis' });

    const updated = await updateVaultEntry('alice', created.id, {
      name: 'Redis',
      accounts: [{ id: other.accounts[0].id, username: 'stolen' }],
    });

    expect(updated.accounts[0].id).not.toBe(other.accounts[0].id);
    expect(updated.accounts[0].hasPassword).toBe(false);
  });

  it('stars entries without touching updatedAt and lists them first', async () => {
    const zulu = await createVaultEntry('alice', { name: 'Zulu' });
    await createVaultEntry('alice', { name: 'Alpha' });
    expect(zulu.starred).toBe(false);

    const starred = await setVaultEntryStarred('alice', zulu.id, true);

    expect(starred.starred).toBe(true);
    expect(starred.updatedAt).toBe(zulu.updatedAt);
    expect((await listVaultEntries('alice')).map((entry) => entry.name)).toEqual(['Zulu', 'Alpha']);
    expect((await updateVaultEntry('alice', zulu.id, { name: 'Zulu' })).starred).toBe(true);

    await setVaultEntryStarred('alice', zulu.id, false);
    expect((await listVaultEntries('alice')).map((entry) => entry.name)).toEqual(['Alpha', 'Zulu']);
    await expect(setVaultEntryStarred('alice', zulu.id, 'yes')).rejects.toThrow(/boolean/);
    await expect(setVaultEntryStarred('bob', zulu.id, true)).rejects.toBeInstanceOf(
      VaultNotFoundError,
    );
  });

  it('isolates entries per owner', async () => {
    const created = await createVaultEntry('alice', mongo);

    expect(await listVaultEntries('bob')).toEqual([]);
    await expect(getVaultEntry('bob', created.id)).rejects.toBeInstanceOf(VaultNotFoundError);
    await expect(revealVaultSecrets('bob', created.id)).rejects.toBeInstanceOf(VaultNotFoundError);
    await expect(updateVaultEntry('bob', created.id, mongo)).rejects.toBeInstanceOf(
      VaultNotFoundError,
    );
    await expect(deleteVaultEntry('bob', created.id)).rejects.toBeInstanceOf(VaultNotFoundError);
    expect(await listVaultEntries('alice')).toHaveLength(1);
  });

  it('refuses ciphertext moved to another owner', async () => {
    const created = await createVaultEntry('alice', mongo);
    const rows = JSON.parse(fs.readFileSync(getVaultStorePath(), 'utf8'));
    rows[0].owner = 'mallory';
    fs.writeFileSync(getVaultStorePath(), JSON.stringify(rows));

    await expect(revealVaultSecrets('mallory', created.id)).rejects.toBeInstanceOf(VaultError);
  });

  it('deletes entries and every entry of an offboarded owner', async () => {
    const first = await createVaultEntry('alice', mongo);
    await createVaultEntry('alice', { name: 'Redis' });
    await createVaultEntry('bob', { name: 'Kafka' });

    await deleteVaultEntry('alice', first.id);
    expect((await listVaultEntries('alice')).map((entry) => entry.name)).toEqual(['Redis']);

    await deleteVaultEntriesForOwner('alice');
    expect(await listVaultEntries('alice')).toEqual([]);
    expect(await listVaultEntries('bob')).toHaveLength(1);
  });

  it.each([
    [{ name: '' }, /name is required/],
    [{ name: 'x', port: 70000 }, /port/],
    [{ name: 'x', port: 'abc' }, /port/],
    [{ name: 'x', url: 'db.example.com' }, /scheme/],
    [{ name: 'x', host: 'bad host' }, /host/],
    [{ name: 'x', image: 'data:image/svg+xml;base64,PHN2Zz4=' }, /image/],
    [{ name: 'x', tags: 'prod' }, /tags/],
    [{ name: 'x', accounts: {} }, /accounts/],
    [{ name: 'x', tokens: {} }, /tokens/],
    [{ name: 'x', tokens: [{ name: 'CI' }] }, /needs a value/],
  ])('rejects invalid input %#', async (input, message) => {
    await expect(createVaultEntry('alice', input)).rejects.toThrow(message);
  });

  it('accepts a password-only account and a small PNG image', async () => {
    const image =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    const created = await createVaultEntry('alice', {
      name: 'Redis',
      image,
      accounts: [{ username: '', password: 'redis-secret' }, { username: '' }],
    });

    expect(created.image).toBe(image);
    expect(created.accounts).toEqual([{ id: expect.any(String), username: '', hasPassword: true }]);
  });

  describe('vault references in server headers', () => {
    const reference = (entryId: string, tokenId: string) => `{{vault:${entryId}/${tokenId}}}`;

    it('fills references from the owner vault and leaves other headers alone', async () => {
      const created = await createVaultEntry('alice', mongo);
      const [ci, ops] = created.tokens;
      const headers = {
        Authorization: `Bearer ${reference(created.id, ci.id)}`,
        'X-Pair': `${reference(created.id, ci.id)}:${reference(created.id, ops.id)}`,
        'X-Plain': 'value',
      };

      expect(await resolveVaultHeaderReferences(headers, 'alice')).toEqual({
        Authorization: 'Bearer token-secret',
        'X-Pair': 'token-secret:ops-secret',
        'X-Plain': 'value',
      });
      const plain = { 'X-Plain': 'value' };
      expect(await resolveVaultHeaderReferences(plain, undefined)).toBe(plain);
    });

    it('refuses references it cannot fill safely', async () => {
      const created = await createVaultEntry('alice', mongo);
      const [ci] = created.tokens;
      const broken = await createVaultEntry('alice', {
        name: 'Broken',
        tokens: [{ name: 'multi', token: 'line\nbreak' }],
      });
      const header = (value: string) => ({ Authorization: value });

      await expect(
        resolveVaultHeaderReferences(header(reference(created.id, ci.id)), 'bob'),
      ).rejects.toBeInstanceOf(VaultNotFoundError);
      await expect(
        resolveVaultHeaderReferences(header(reference(created.id, 'missing')), 'alice'),
      ).rejects.toBeInstanceOf(VaultNotFoundError);
      await expect(
        resolveVaultHeaderReferences(header(reference(created.id, ci.id)), undefined),
      ).rejects.toThrow(/owner/);
      await expect(
        resolveVaultHeaderReferences(header('Bearer {{vault:oops}}'), 'alice'),
      ).rejects.toThrow(/invalid vault reference/);
      await expect(
        resolveVaultHeaderReferences(header(reference(broken.id, broken.tokens[0].id)), 'alice'),
      ).rejects.toThrow(/line break/);
    });

    it('keeps entries and tokens that the owner servers still reference', async () => {
      const created = await createVaultEntry('alice', mongo);
      const [ci, ops] = created.tokens;
      mockServers = [
        {
          name: 'github',
          owner: 'alice',
          headers: { Authorization: `Bearer ${reference(created.id, ci.id)}` },
        },
        {
          name: 'foreign',
          owner: 'bob',
          headers: { Authorization: reference(created.id, ops.id) },
        },
      ];

      expect(await findServersUsingVaultEntry('alice', created.id)).toEqual(['github']);
      await expect(deleteVaultEntry('alice', created.id)).rejects.toThrow(/github/);
      await expect(
        updateVaultEntry('alice', created.id, { name: 'Orders MongoDB', tokens: [{ id: ops.id }] }),
      ).rejects.toThrow(/github/);

      const updated = await updateVaultEntry('alice', created.id, {
        name: 'Orders MongoDB',
        tokens: [{ id: ci.id, name: 'CI' }],
      });
      expect(updated.tokens.map((token) => token.id)).toEqual([ci.id]);
    });

    it('announces token value changes only', async () => {
      const created = await createVaultEntry('alice', mongo);
      const [ci, ops] = created.tokens;
      const listener = jest.fn();
      vaultEvents.on('tokensChanged', listener);
      try {
        await updateVaultEntry('alice', created.id, { name: 'Renamed', description: 'x' });
        expect(listener).not.toHaveBeenCalled();

        await updateVaultEntry('alice', created.id, {
          name: 'Renamed',
          tokens: [
            { id: ci.id, name: 'CI', token: 'rotated' },
            { id: ops.id, name: 'Ops' },
          ],
        });
        expect(listener).toHaveBeenCalledWith({ owner: 'alice', entryId: created.id });
      } finally {
        vaultEvents.off('tokensChanged', listener);
      }
    });
  });

  describe('linked accounts', () => {
    const ldap = () =>
      createVaultEntry('alice', {
        name: 'LDAP',
        accounts: [{ username: 'emre', password: 'ldap-secret' }],
      });

    it('reads the username and password from the source account', async () => {
      const source = await ldap();
      const [account] = source.accounts;
      const jenkins = await createVaultEntry('alice', {
        name: 'Jenkins',
        accounts: [
          {
            username: 'ignored',
            password: 'ignored',
            link: { entryId: source.id, accountId: account.id },
          },
          { username: 'local', password: 'local-secret' },
        ],
      });

      expect(jenkins.accounts[0]).toEqual({
        id: expect.any(String),
        username: 'emre',
        hasPassword: true,
        link: { entryId: source.id, accountId: account.id, entryName: 'LDAP' },
      });
      expect(await revealVaultSecrets('alice', jenkins.id)).toEqual({
        passwords: {
          [jenkins.accounts[0].id]: 'ldap-secret',
          [jenkins.accounts[1].id]: 'local-secret',
        },
        tokens: {},
      });
      const raw = JSON.parse(fs.readFileSync(getVaultStorePath(), 'utf8'));
      expect(JSON.stringify(raw)).not.toMatch(/ignored/);
    });

    it('follows changes made to the source account', async () => {
      const source = await ldap();
      const [account] = source.accounts;
      const jenkins = await createVaultEntry('alice', {
        name: 'Jenkins',
        accounts: [{ link: { entryId: source.id, accountId: account.id } }],
      });

      await updateVaultEntry('alice', source.id, {
        name: 'LDAP',
        accounts: [{ id: account.id, username: 'emre.c', password: 'rotated' }],
      });

      const listed = (await listVaultEntries('alice')).find((entry) => entry.id === jenkins.id)!;
      expect(listed.accounts[0].username).toBe('emre.c');
      expect((await revealVaultSecrets('alice', jenkins.id)).passwords[listed.accounts[0].id]).toBe(
        'rotated',
      );
      const kept = await updateVaultEntry('alice', jenkins.id, { name: 'Jenkins prod' });
      expect(kept.accounts[0].link?.accountId).toBe(account.id);
    });

    it('rejects links it cannot keep consistent', async () => {
      const source = await ldap();
      const [account] = source.accounts;
      const linked = await createVaultEntry('alice', {
        name: 'Jenkins',
        accounts: [{ link: { entryId: source.id, accountId: account.id } }],
      });
      const create = (link: unknown) =>
        createVaultEntry('alice', { name: 'x', accounts: [{ link }] });

      await expect(create({ entryId: source.id })).rejects.toThrow(/entryId and an accountId/);
      await expect(create({ entryId: source.id, accountId: 'missing' })).rejects.toThrow(
        /account was not found/,
      );
      await expect(
        create({ entryId: linked.id, accountId: linked.accounts[0].id }),
      ).rejects.toThrow(/original account/);
      await expect(
        createVaultEntry('bob', {
          name: 'x',
          accounts: [{ link: { entryId: source.id, accountId: account.id } }],
        }),
      ).rejects.toThrow(/entry was not found/);
      await expect(
        updateVaultEntry('alice', source.id, {
          name: 'LDAP',
          accounts: [
            { id: account.id, username: 'emre' },
            { link: { entryId: source.id, accountId: account.id } },
          ],
        }),
      ).rejects.toThrow(/own entry/);
    });

    it('keeps source accounts that other entries link to', async () => {
      const source = await ldap();
      const [account] = source.accounts;
      const jenkins = await createVaultEntry('alice', {
        name: 'Jenkins',
        accounts: [{ link: { entryId: source.id, accountId: account.id } }],
      });

      await expect(deleteVaultEntry('alice', source.id)).rejects.toThrow(/Jenkins/);
      await expect(
        updateVaultEntry('alice', source.id, { name: 'LDAP', accounts: [] }),
      ).rejects.toThrow(/Jenkins/);

      await deleteVaultEntry('alice', jenkins.id);
      await deleteVaultEntry('alice', source.id);
      expect(await listVaultEntries('alice')).toEqual([]);
    });
  });
});
