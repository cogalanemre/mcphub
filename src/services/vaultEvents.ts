import { EventEmitter } from 'node:events';

export interface VaultTokensChanged {
  owner: string;
  entryId: string;
}

export const vaultEvents = new EventEmitter();
