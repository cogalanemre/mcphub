import type { VaultEntry, VaultEntryInput, VaultSecrets } from '../types';
import { apiDelete, apiGet, apiPost, apiPut, type ApiResponse } from '../utils/fetchInterceptor';

const unwrap = <T>(result: ApiResponse<T>, fallback: string): T => {
  if (!result.success || result.data === undefined) throw new Error(result.message || fallback);
  return result.data;
};

export const listVaultEntries = async (): Promise<VaultEntry[]> =>
  unwrap(await apiGet<ApiResponse<VaultEntry[]>>('/vault'), 'Unable to load vault entries');

export const createVaultEntry = async (input: VaultEntryInput): Promise<VaultEntry> =>
  unwrap(await apiPost<ApiResponse<VaultEntry>>('/vault', input), 'Unable to save vault entry');

export const updateVaultEntry = async (id: string, input: VaultEntryInput): Promise<VaultEntry> =>
  unwrap(
    await apiPut<ApiResponse<VaultEntry>>(`/vault/${encodeURIComponent(id)}`, input),
    'Unable to save vault entry',
  );

export const setVaultEntryStarred = async (id: string, starred: boolean): Promise<VaultEntry> =>
  unwrap(
    await apiPut<ApiResponse<VaultEntry>>(`/vault/${encodeURIComponent(id)}/star`, { starred }),
    'Unable to update star',
  );

export const deleteVaultEntry = async (id: string): Promise<void> => {
  const result = await apiDelete<ApiResponse>(`/vault/${encodeURIComponent(id)}`);
  if (!result.success) throw new Error(result.message || 'Unable to delete vault entry');
};

export const revealVaultSecrets = async (id: string): Promise<VaultSecrets> =>
  unwrap(
    await apiGet<ApiResponse<VaultSecrets>>(`/vault/${encodeURIComponent(id)}/secrets`),
    'Unable to unlock vault secrets',
  );
