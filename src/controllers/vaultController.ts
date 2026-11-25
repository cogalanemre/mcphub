import type { Request, Response } from 'express';
import type { RequestPrincipal } from '../services/authorizationService.js';
import {
  createVaultEntry,
  deleteVaultEntry,
  listVaultEntries,
  revealVaultSecrets,
  setVaultEntryStarred,
  updateVaultEntry,
  VaultError,
  VaultNotFoundError,
} from '../services/vaultService.js';
import { CredentialBindingError } from '../utils/credentialTemplate.js';
import { logger } from '../utils/logger.js';

const owner = (req: Request, res: Response): string | undefined => {
  const actor = (req as Request & { user?: RequestPrincipal }).user;
  if (!actor?.username || actor.credentialEligible === false) {
    res.status(401).json({ success: false, message: 'A personal dashboard session is required' });
    return undefined;
  }
  return actor.username;
};

const respondError = (res: Response, error: unknown): void => {
  if (error instanceof VaultNotFoundError) {
    res.status(404).json({ success: false, message: error.message });
    return;
  }
  if (error instanceof VaultError || error instanceof CredentialBindingError) {
    res.status(400).json({ success: false, message: error.message });
    return;
  }
  logger.error('Vault request failed', error);
  res.status(500).json({ success: false, message: 'Unable to manage vault entries' });
};

export const listMyVaultEntries = async (req: Request, res: Response): Promise<void> => {
  const username = owner(req, res);
  if (!username) return;
  try {
    res.json({ success: true, data: await listVaultEntries(username) });
  } catch (error) {
    respondError(res, error);
  }
};

export const createMyVaultEntry = async (req: Request, res: Response): Promise<void> => {
  const username = owner(req, res);
  if (!username) return;
  try {
    res.status(201).json({ success: true, data: await createVaultEntry(username, req.body) });
  } catch (error) {
    respondError(res, error);
  }
};

export const updateMyVaultEntry = async (req: Request, res: Response): Promise<void> => {
  const username = owner(req, res);
  if (!username) return;
  try {
    res.json({ success: true, data: await updateVaultEntry(username, req.params.id, req.body) });
  } catch (error) {
    respondError(res, error);
  }
};

export const starMyVaultEntry = async (req: Request, res: Response): Promise<void> => {
  const username = owner(req, res);
  if (!username) return;
  try {
    res.json({
      success: true,
      data: await setVaultEntryStarred(username, req.params.id, req.body?.starred),
    });
  } catch (error) {
    respondError(res, error);
  }
};

export const deleteMyVaultEntry = async (req: Request, res: Response): Promise<void> => {
  const username = owner(req, res);
  if (!username) return;
  try {
    await deleteVaultEntry(username, req.params.id);
    res.json({ success: true });
  } catch (error) {
    respondError(res, error);
  }
};

export const revealMyVaultSecrets = async (req: Request, res: Response): Promise<void> => {
  const username = owner(req, res);
  if (!username) return;
  try {
    const secrets = await revealVaultSecrets(username, req.params.id);
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, data: secrets });
  } catch (error) {
    respondError(res, error);
  }
};
