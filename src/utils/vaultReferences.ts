const VAULT_REFERENCE = /\{\{vault:([A-Za-z0-9-]+)\/([A-Za-z0-9-]+)\}\}/g;

export interface VaultReference {
  entryId: string;
  tokenId: string;
}

export const hasVaultReference = (value: unknown): value is string =>
  typeof value === 'string' && value.includes('{{vault:');

export const vaultReferencesIn = (value: string): VaultReference[] =>
  Array.from(value.matchAll(VAULT_REFERENCE), ([, entryId, tokenId]) => ({ entryId, tokenId }));

export const listVaultReferences = (headers?: Record<string, unknown> | null): VaultReference[] =>
  Object.values(headers ?? {}).flatMap((value) =>
    hasVaultReference(value) ? vaultReferencesIn(value) : [],
  );

export const isWellFormedVaultValue = (value: string): boolean =>
  !value.replace(VAULT_REFERENCE, '').includes('{{vault:');

export const replaceVaultReferences = (value: string, replacements: readonly string[]): string => {
  let index = 0;
  return value.replace(VAULT_REFERENCE, () => replacements[index++]);
};
