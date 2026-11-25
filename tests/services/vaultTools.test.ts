import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { CredentialBindingDaoImpl } from '../../src/dao/CredentialBindingDao.js';
import { VaultEntryDaoImpl } from '../../src/dao/VaultEntryDao.js';
import { executeVaultTool } from '../../src/services/vaultTools.js';
import { isReservedVaultName, isVaultToolName } from '../../src/services/vaultToolDefinitions.js';
import { isReservedHubToolName } from '../../src/services/hubToolNames.js';
import { compatibleToolNames } from '../../src/utils/compatibleToolNames.js';
import { revealVaultSecrets } from '../../src/services/vaultService.js';

jest.mock('../../src/dao/DaoFactory.js', () => ({
  getCredentialBindingDao: () => new CredentialBindingDaoImpl(),
  getVaultEntryDao: () => new VaultEntryDaoImpl(),
}));

let directory: string;
const originalPath = process.env.MCPHUB_SETTING_PATH;
const originalKey = process.env.MCPHUB_CREDENTIAL_ENCRYPTION_KEY;

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mcphub-vault-tools-'));
  process.env.MCPHUB_SETTING_PATH = path.join(directory, 'settings.json');
  process.env.MCPHUB_CREDENTIAL_ENCRYPTION_KEY = randomBytes(32).toString('base64');
});

afterEach(() => {
  fs.rmSync(directory, { recursive: true, force: true });
  if (originalPath === undefined) delete process.env.MCPHUB_SETTING_PATH;
  else process.env.MCPHUB_SETTING_PATH = originalPath;
  if (originalKey === undefined) delete process.env.MCPHUB_CREDENTIAL_ENCRYPTION_KEY;
  else process.env.MCPHUB_CREDENTIAL_ENCRYPTION_KEY = originalKey;
});

const payload = (result: { content: Array<{ text: string }> }) =>
  JSON.parse(result.content[0].text);

describe('vault hub tools', () => {
  it('reserves the mcphub_vault_ namespace', () => {
    expect(isVaultToolName('mcphub_vault_list')).toBe(true);
    expect(isVaultToolName('mcphub_vault_anything')).toBe(false);
    expect(isReservedVaultName('mcphub_vault_anything')).toBe(true);
    expect(isReservedHubToolName('mcphub_vault_list')).toBe(true);
    expect(isReservedHubToolName('mcphub_file_upload')).toBe(true);
    expect(isReservedHubToolName('mcphub_tool')).toBe(false);
    const aliases = compatibleToolNames([{ name: 'mcphub_vault_list.v2' }] as any);
    expect(aliases.get('mcphub_vault_list.v2')).toMatch(/^tool_mcphub_vault_list/);
  });

  it('creates an entry with passwords but never returns them', async () => {
    const created = await executeVaultTool(
      'mcphub_vault_create',
      {
        name: 'Orders MongoDB',
        tags: ['mongo'],
        host: '10.0.0.12',
        port: 27017,
        accounts: [{ username: 'app', password: 'app-secret' }],
        tokens: [{ name: 'CI', token: 'token-secret' }],
      },
      'alice',
    );

    expect(created.isError).toBeUndefined();
    expect(created.content[0].text).not.toMatch(/app-secret|token-secret/);
    const { entry } = payload(created);
    expect(entry).toMatchObject({
      name: 'Orders MongoDB',
      tokens: [{ name: 'CI' }],
      accounts: [{ username: 'app', hasPassword: true }],
    });
    expect(Object.values((await revealVaultSecrets('alice', entry.id)).tokens)).toEqual([
      'token-secret',
    ]);

    const listed = await executeVaultTool('mcphub_vault_list', {}, 'alice');
    expect(listed.content[0].text).not.toMatch(/app-secret|token-secret/);
    expect(payload(listed).total).toBe(1);
  });

  it('filters by tag and query and scopes to the caller', async () => {
    await executeVaultTool(
      'mcphub_vault_create',
      { name: 'Orders DB', tags: ['mongo', 'prod'] },
      'alice',
    );
    await executeVaultTool(
      'mcphub_vault_create',
      { name: 'Reports DB', tags: ['mongo', 'dev'] },
      'alice',
    );
    await executeVaultTool(
      'mcphub_vault_create',
      { name: 'Cache', tags: ['redis', 'prod'] },
      'alice',
    );
    await executeVaultTool('mcphub_vault_create', { name: 'Bob DB', tags: ['prod'] }, 'bob');

    const names = async (args: Record<string, unknown>) =>
      payload(await executeVaultTool('mcphub_vault_list', args, 'alice')).entries.map(
        (entry: any) => entry.name,
      );

    expect(await names({ tag: 'PROD' })).toEqual(['Cache', 'Orders DB']);
    expect(await names({ tag: 'Mongo' })).toEqual(['Orders DB', 'Reports DB']);
    expect(await names({ query: 'cache' })).toEqual(['Cache']);
  });

  it('reports validation errors as tool errors', async () => {
    const result = await executeVaultTool('mcphub_vault_create', { name: 'x', port: 0 }, 'alice');
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/port/);
  });
});
