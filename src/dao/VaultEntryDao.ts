import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getSettingsPath } from '../config/index.js';
import type { StoredVaultEntry } from '../types/index.js';

export interface VaultEntryDao {
  hasEntries(): Promise<boolean>;
  findById(id: string): Promise<StoredVaultEntry | null>;
  findByOwner(owner: string): Promise<StoredVaultEntry[]>;
  save(entry: StoredVaultEntry): Promise<void>;
  delete(id: string): Promise<void>;
  deleteByOwner(owner: string): Promise<void>;
}

export const getVaultStorePath = (): string => `${getSettingsPath()}.vault.json`;

export class VaultEntryDaoImpl implements VaultEntryDao {
  private read(): StoredVaultEntry[] {
    try {
      const rows = JSON.parse(fs.readFileSync(getVaultStorePath(), 'utf8'));
      if (!Array.isArray(rows)) throw new Error('Invalid vault store');
      return rows;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  }

  private write(rows: StoredVaultEntry[]): void {
    const file = getVaultStorePath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temporary, JSON.stringify(rows), { mode: 0o600, flag: 'wx' });
      fs.renameSync(temporary, file);
    } finally {
      fs.rmSync(temporary, { force: true });
    }
  }

  async hasEntries(): Promise<boolean> {
    return this.read().length > 0;
  }

  async findById(id: string): Promise<StoredVaultEntry | null> {
    return this.read().find((row) => row.id === id) ?? null;
  }

  async findByOwner(owner: string): Promise<StoredVaultEntry[]> {
    return this.read().filter((row) => row.owner === owner);
  }

  async save(entry: StoredVaultEntry): Promise<void> {
    this.write([...this.read().filter((row) => row.id !== entry.id), entry]);
  }

  async delete(id: string): Promise<void> {
    this.write(this.read().filter((row) => row.id !== id));
  }

  async deleteByOwner(owner: string): Promise<void> {
    this.write(this.read().filter((row) => row.owner !== owner));
  }
}
