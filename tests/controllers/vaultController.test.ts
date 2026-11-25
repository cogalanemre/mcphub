import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { CredentialBindingDaoImpl } from '../../src/dao/CredentialBindingDao.js';
import { VaultEntryDaoImpl } from '../../src/dao/VaultEntryDao.js';
import {
  createMyVaultEntry,
  deleteMyVaultEntry,
  listMyVaultEntries,
  revealMyVaultSecrets,
  starMyVaultEntry,
  updateMyVaultEntry,
} from '../../src/controllers/vaultController.js';

jest.mock('../../src/dao/DaoFactory.js', () => ({
  getCredentialBindingDao: () => new CredentialBindingDaoImpl(),
  getVaultEntryDao: () => new VaultEntryDaoImpl(),
  getServerDao: () => ({ findAll: async () => [] }),
}));

let directory: string;
const originalPath = process.env.MCPHUB_SETTING_PATH;
const originalKey = process.env.MCPHUB_CREDENTIAL_ENCRYPTION_KEY;

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mcphub-vault-controller-'));
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

const request = (user: Record<string, unknown> | undefined, extra: Partial<Request> = {}) =>
  ({ user, params: {}, body: {}, ...extra }) as unknown as Request;

const response = () => {
  const res = {
    statusCode: 200,
    body: undefined as any,
    headers: {} as Record<string, string>,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
    set(name: string, value: string) {
      res.headers[name] = value;
      return res;
    },
  };
  return res;
};

const alice = { username: 'alice', isAdmin: false };

describe('vaultController', () => {
  it.each([
    ['no session', undefined],
    [
      'a bearer key or skip-auth principal',
      { username: 'guest', isAdmin: true, credentialEligible: false },
    ],
  ])('rejects %s', async (_label, user) => {
    const res = response();
    await listMyVaultEntries(request(user), res as unknown as Response);
    expect(res.statusCode).toBe(401);
  });

  it('creates, lists, reveals, updates and deletes an entry for its owner', async () => {
    const created = response();
    await createMyVaultEntry(
      request(alice, {
        body: { name: 'Mongo', accounts: [{ username: 'app', password: 'app-secret' }] },
      }),
      created as unknown as Response,
    );
    expect(created.statusCode).toBe(201);
    expect(JSON.stringify(created.body)).not.toMatch(/app-secret/);
    const id = created.body.data.id;

    const listed = response();
    await listMyVaultEntries(request(alice), listed as unknown as Response);
    expect(listed.body.data).toHaveLength(1);

    const revealed = response();
    await revealMyVaultSecrets(
      request(alice, { params: { id } as any }),
      revealed as unknown as Response,
    );
    expect(revealed.headers['Cache-Control']).toBe('no-store');
    expect(Object.values(revealed.body.data.passwords)).toEqual(['app-secret']);

    const updated = response();
    await updateMyVaultEntry(
      request(alice, { params: { id } as any, body: { name: 'Mongo', port: 'nope' } }),
      updated as unknown as Response,
    );
    expect(updated.statusCode).toBe(400);

    const starred = response();
    await starMyVaultEntry(
      request(alice, { params: { id } as any, body: { starred: true } }),
      starred as unknown as Response,
    );
    expect(starred.body.data.starred).toBe(true);

    const badStar = response();
    await starMyVaultEntry(
      request(alice, { params: { id } as any, body: { starred: 'yes' } }),
      badStar as unknown as Response,
    );
    expect(badStar.statusCode).toBe(400);

    const deleted = response();
    await deleteMyVaultEntry(
      request(alice, { params: { id } as any }),
      deleted as unknown as Response,
    );
    expect(deleted.body).toEqual({ success: true });
  });

  it('answers 404 for another user entry', async () => {
    const created = response();
    await createMyVaultEntry(
      request(alice, { body: { name: 'Mongo' } }),
      created as unknown as Response,
    );
    const id = created.body.data.id;
    const bob = { username: 'bob', isAdmin: true };

    for (const handler of [
      revealMyVaultSecrets,
      deleteMyVaultEntry,
      updateMyVaultEntry,
      starMyVaultEntry,
    ]) {
      const res = response();
      await handler(
        request(bob, { params: { id } as any, body: { name: 'x', starred: true } }),
        res as unknown as Response,
      );
      expect(res.statusCode).toBe(404);
    }
  });
});
