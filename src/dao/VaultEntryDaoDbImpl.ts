import { getAppDataSource } from '../db/connection.js';
import { VaultEntry } from '../db/entities/VaultEntry.js';
import type { StoredVaultEntry } from '../types/index.js';
import type { VaultEntryDao } from './VaultEntryDao.js';

export class VaultEntryDaoDbImpl implements VaultEntryDao {
  private get repository() {
    return getAppDataSource().getRepository(VaultEntry);
  }

  async hasEntries(): Promise<boolean> {
    return this.repository.exists();
  }

  async findById(id: string): Promise<StoredVaultEntry | null> {
    return this.repository.findOneBy({ id });
  }

  async findByOwner(owner: string): Promise<StoredVaultEntry[]> {
    return this.repository.find({ where: { owner }, order: { name: 'ASC' } });
  }

  async save(entry: StoredVaultEntry): Promise<void> {
    await this.repository.save(entry);
  }

  async delete(id: string): Promise<void> {
    await this.repository.delete({ id });
  }

  async deleteByOwner(owner: string): Promise<void> {
    await this.repository.delete({ owner });
  }
}
