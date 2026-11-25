import type { VaultEntry } from '../types';

export const VAULT_IMAGE_SIZE = 128;

const FIXED_TAG_COLORS: Record<string, string> = {
  prod: 'var(--hub-err)',
  uat: 'var(--hub-warn)',
  test: 'var(--hub-accent)',
  dev: 'var(--hub-ok)',
};

export const vaultTagKey = (tag: string): string => tag.trim().toLowerCase();

export const vaultTagColor = (tag: string): string => {
  const key = vaultTagKey(tag);
  const fixed = FIXED_TAG_COLORS[key];
  if (fixed) return fixed;
  let hash = 2166136261;
  for (const char of key) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return `oklch(0.7 0.14 ${hash % 360})`;
};

export interface VaultTagOption {
  value: string;
  label: string;
  count: number;
}

export const getVaultTagOptions = (entries: readonly VaultEntry[]): VaultTagOption[] => {
  const options = new Map<string, VaultTagOption>();
  for (const entry of entries) {
    for (const tag of entry.tags) {
      const key = vaultTagKey(tag);
      const existing = options.get(key);
      if (existing) existing.count += 1;
      else options.set(key, { value: key, label: tag, count: 1 });
    }
  }
  return Array.from(options.values()).sort(
    (a, b) =>
      b.count - a.count || a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }),
  );
};

export const rankVaultTags = (
  tags: readonly string[],
  rank: ReadonlyMap<string, number>,
): string[] =>
  [...tags].sort(
    (a, b) => (rank.get(vaultTagKey(a)) ?? rank.size) - (rank.get(vaultTagKey(b)) ?? rank.size),
  );

export interface VaultFilter {
  tags: readonly string[];
  search: string;
}

export const filterVaultEntries = (
  entries: readonly VaultEntry[],
  { tags, search }: VaultFilter,
): VaultEntry[] => {
  const query = search.trim().toLowerCase();
  const selected = new Set(tags);
  return entries.filter((entry) => {
    if (selected.size > 0 && !entry.tags.some((value) => selected.has(vaultTagKey(value))))
      return false;
    if (!query) return true;
    return [
      entry.name,
      entry.description,
      entry.url,
      entry.host,
      ...entry.tags,
      ...entry.accounts.map((account) => account.username),
    ].some((value) => typeof value === 'string' && value.toLowerCase().includes(query));
  });
};

export const sortVaultEntries = (entries: readonly VaultEntry[]): VaultEntry[] =>
  [...entries].sort(
    (a, b) =>
      Number(b.starred) - Number(a.starred) ||
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  );

const VAULT_REFERENCE = /\{\{vault:([A-Za-z0-9-]+)\/([A-Za-z0-9-]+)\}\}/;

export const parseVaultHeaderValue = (
  value: string,
): { prefix: string; entryId: string; tokenId: string; suffix: string } | null => {
  const match = VAULT_REFERENCE.exec(value);
  if (!match) return null;
  return {
    prefix: value.slice(0, match.index),
    entryId: match[1],
    tokenId: match[2],
    suffix: value.slice(match.index + match[0].length),
  };
};

export const vaultHeaderValue = (headerName: string, entryId: string, tokenId: string): string => {
  const reference = `{{vault:${entryId}/${tokenId}}}`;
  return headerName.trim().toLowerCase() === 'authorization' ? `Bearer ${reference}` : reference;
};

export const vaultEndpoint = (entry: Pick<VaultEntry, 'host' | 'port'>): string | null => {
  if (!entry.host) return entry.port ? `:${entry.port}` : null;
  return entry.port ? `${entry.host}:${entry.port}` : entry.host;
};

export const resizeImageToDataUrl = (file: File, size = VAULT_IMAGE_SIZE): Promise<string> =>
  new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) {
      reject(new Error('unsupported'));
      return;
    }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, size / Math.max(image.width, image.height));
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      URL.revokeObjectURL(url);
      if (!context) {
        reject(new Error('canvas'));
        return;
      }
      context.drawImage(image, 0, 0, width, height);
      resolve(canvas.toDataURL('image/png'));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('decode'));
    };
    image.src = url;
  });
