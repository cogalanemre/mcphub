import type { VaultEntry } from '../../frontend/src/types';
import {
  filterVaultEntries,
  getVaultTagOptions,
  parseVaultHeaderValue,
  rankVaultTags,
  sortVaultEntries,
  vaultHeaderValue,
  vaultTagColor,
} from '../../frontend/src/utils/vaultFilters';

const entry = (name: string, tags: string[] = [], starred = false) =>
  ({ id: name, name, tags, starred, accounts: [] }) as unknown as VaultEntry;

describe('vaultFilters', () => {
  it('puts starred entries first, then sorts by name', () => {
    const entries = [
      entry('beta'),
      entry('Zulu', [], true),
      entry('Alpha'),
      entry('Mike', [], true),
    ];

    expect(sortVaultEntries(entries).map((item) => item.name)).toEqual([
      'Mike',
      'Zulu',
      'Alpha',
      'beta',
    ]);
    expect(entries[0].name).toBe('beta');
  });

  it('orders tag options from the most used to the least used', () => {
    const options = getVaultTagOptions([
      entry('a', ['redis', 'prod']),
      entry('b', ['Mongo', 'prod']),
      entry('c', ['mongo', 'PROD']),
      entry('d', ['kafka']),
    ]);

    expect(options.map(({ value, count }) => `${value}:${count}`)).toEqual([
      'prod:3',
      'mongo:2',
      'kafka:1',
      'redis:1',
    ]);
  });

  it('orders an entry tags by how often each tag is used', () => {
    const rank = new Map([
      ['prod', 0],
      ['mongo', 1],
      ['kafka', 2],
    ]);

    expect(rankVaultTags(['orders', 'Mongo', 'kafka', 'PROD'], rank)).toEqual([
      'PROD',
      'Mongo',
      'kafka',
      'orders',
    ]);
  });

  it('shows every entry without a selection and any selected tag otherwise', () => {
    const entries = [
      entry('Orders', ['mongo', 'prod']),
      entry('Cache', ['redis', 'prod']),
      entry('Reports', ['mongo', 'dev']),
      entry('Untagged'),
    ];
    const names = (tags: string[], search = '') =>
      filterVaultEntries(entries, { tags, search }).map((item) => item.name);

    expect(names([])).toEqual(['Orders', 'Cache', 'Reports', 'Untagged']);
    expect(names(['redis', 'dev'])).toEqual(['Cache', 'Reports']);
    expect(names(['prod'], 'cache')).toEqual(['Cache']);
  });

  it('keeps the familiar environment colors and gives other tags a stable color', () => {
    expect(vaultTagColor('PROD')).toBe('var(--hub-err)');
    expect(vaultTagColor('dev')).toBe('var(--hub-ok)');
    expect(vaultTagColor('Mongo')).toBe(vaultTagColor('mongo'));
    expect(vaultTagColor('mongo')).toMatch(/^oklch\(/);
    expect(vaultTagColor('mongo')).not.toBe(vaultTagColor('redis'));
  });

  it('builds and reads vault references in header values', () => {
    expect(vaultHeaderValue('Authorization', 'entry-1', 'token-1')).toBe(
      'Bearer {{vault:entry-1/token-1}}',
    );
    expect(vaultHeaderValue('X-API-Key', 'entry-1', 'token-1')).toBe('{{vault:entry-1/token-1}}');
    expect(parseVaultHeaderValue('Bearer {{vault:entry-1/token-1}}')).toEqual({
      prefix: 'Bearer ',
      entryId: 'entry-1',
      tokenId: 'token-1',
      suffix: '',
    });
    expect(parseVaultHeaderValue('Bearer ghp_plain')).toBeNull();
  });
});
