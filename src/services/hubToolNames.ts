import { isReservedStagingName, STAGING_TOOL_DEFINITIONS } from './fileStaging/tools.js';
import { isReservedVaultName, VAULT_TOOL_DEFINITIONS } from './vaultToolDefinitions.js';

export const HUB_TOOL_DEFINITIONS = [...STAGING_TOOL_DEFINITIONS, ...VAULT_TOOL_DEFINITIONS];

export const isReservedHubToolName = (name: unknown): boolean =>
  isReservedStagingName(name) || isReservedVaultName(name);
