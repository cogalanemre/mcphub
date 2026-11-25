import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import type { StoredVaultEntry, VaultAccount, VaultToken } from '../../types/index.js';

@Entity({ name: 'vault_entries' })
export class VaultEntry implements StoredVaultEntry {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Index('IDX_vault_entries_owner')
  @Column({ type: 'varchar', length: 255 })
  owner: string;

  @Column({ type: 'varchar', length: 128 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ type: 'simple-json', nullable: true })
  tags?: string[] | null;

  @Column({ type: 'text', nullable: true })
  url?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  host?: string | null;

  @Column({ type: 'integer', nullable: true })
  port?: number | null;

  @Column({ type: 'text', nullable: true })
  image?: string | null;

  @Column({ type: 'simple-json' })
  accounts: VaultAccount[];

  @Column({ type: 'simple-json', nullable: true })
  tokens?: VaultToken[] | null;

  @Column({ type: 'boolean', default: false })
  starred?: boolean;

  @Column({ type: 'text' })
  encryptedSecrets: string;

  @Column({ type: 'varchar', length: 30 })
  createdAt: string;

  @Column({ type: 'varchar', length: 30 })
  updatedAt: string;
}
