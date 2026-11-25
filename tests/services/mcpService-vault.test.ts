import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockGetSystemConfig = jest.fn(async () => ({ normalizeToolNames: true }));
let mockKeyKind = 'user';
const mockExecuteVaultTool = jest.fn(async () => ({
  content: [{ type: 'text', text: JSON.stringify({ entries: [], total: 0 }) }],
}));
const mockAliceUser = {
  username: 'alice',
  isAdmin: false,
  id: '11111111-1111-1111-1111-111111111111',
};
const mockCallTool = jest.fn().mockResolvedValue({ content: [{ type: 'text', text: 'upstream' }] });
const mockGetFileStagingSettings = jest.fn(async () => ({ enabled: false }));
const mockGetStagingStateStore = jest.fn(async () => ({}));

jest.mock('../../src/dao/index.js', () => ({
  getGroupDao: jest.fn(() => ({
    findByName: jest.fn(async () => undefined),
    findById: jest.fn(async () => undefined),
  })),
  getServerDao: jest.fn(() => ({
    findAll: jest.fn(async () => []),
    findById: jest.fn(async () => undefined),
  })),
  getSystemConfigDao: jest.fn(() => ({ get: mockGetSystemConfig })),
  getBuiltinPromptDao: jest.fn(() => ({ findEnabled: jest.fn(async () => []) })),
  getBuiltinResourceDao: jest.fn(() => ({ findEnabled: jest.fn(async () => []) })),
  getUserDao: jest.fn(() => ({
    findByUsername: jest.fn(async () => mockAliceUser),
  })),
}));

jest.mock('../../src/dao/DaoFactory.js', () => ({
  getUserDao: jest.fn(() => ({
    findByUsername: jest.fn(async () => mockAliceUser),
  })),
  getServerDao: jest.fn(() => ({
    findAll: jest.fn(async () => []),
    findById: jest.fn(async () => undefined),
  })),
  getSystemConfigDao: jest.fn(() => ({ get: jest.fn(async () => ({})) })),
}));

jest.mock('../../src/services/fileStaging/settings.js', () => ({
  getFileStagingSettings: (...args: unknown[]) => mockGetFileStagingSettings(...(args as [])),
  getStagingStateStore: (...args: unknown[]) => mockGetStagingStateStore(...(args as [])),
  isStagingRuntimeSupported: () => true,
}));

jest.mock('../../src/services/services.js', () => ({
  getDataService: jest.fn(() => ({ filterData: (data: any) => data })),
}));

jest.mock('../../src/services/userContextService.js', () => ({
  UserContextService: {
    getInstance: jest.fn(() => ({
      getCurrentUser: jest.fn(() => ({ username: 'alice', isAdmin: false })),
      hasUser: jest.fn(() => true),
      isAdmin: jest.fn(() => false),
      setCurrentUser: jest.fn(),
      clearCurrentUser: jest.fn(),
      runWithContext: jest.fn((action: () => unknown) => action()),
    })),
  },
}));

jest.mock('../../src/services/requestContextService.js', () => ({
  RequestContextService: {
    getInstance: jest.fn(() => ({
      getHostedAuthContext: jest.fn(() => null),
      getBearerKeyContext: jest.fn(() => ({})),
      getGroupContext: jest.fn(),
      getUsernameContext: jest.fn(() => 'alice'),
      getKeyKindContext: jest.fn(() => mockKeyKind),
      getRequestContext: jest.fn(() => ({})),
      getBearerKeyExclusions: jest.fn(() => undefined),
      getSessionId: jest.fn(),
      getHeaders: jest.fn(() => undefined),
    })),
  },
}));

jest.mock('../../src/services/vaultTools.js', () => ({
  executeVaultTool: (...args: unknown[]) => mockExecuteVaultTool(...(args as [])),
}));

jest.mock('../../src/services/sseService.js', () => ({ getGroup: jest.fn() }));
jest.mock('../../src/services/vectorSearchService.js', () => ({
  removeServerToolEmbeddings: jest.fn(),
  saveToolsAsVectorEmbeddings: jest.fn(),
}));
const mockDescribeTool = jest.fn();
jest.mock('../../src/services/smartRoutingService.js', () => ({
  initSmartRoutingService: jest.fn(),
  getSmartRoutingTools: jest.fn(async () => ({ tools: [] })),
  handleSearchToolsRequest: jest.fn(async () => ({
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          tools: [{ name: 'ssh-upload', description: 'upload', serverName: 'ssh' }],
          metadata: { query: 'upload a file', totalResults: 1 },
        }),
      },
    ],
  })),
  handleDescribeToolRequest: (...args: unknown[]) => mockDescribeTool(...args),
  isSmartRoutingGroup: jest.fn(() => true),
}));
jest.mock('../../src/services/oauthService.js', () => ({ initializeAllOAuthClients: jest.fn() }));
jest.mock('../../src/services/mcpOAuthProvider.js', () => ({ createOAuthProvider: jest.fn() }));
jest.mock('../../src/services/hostedAuthService.js', () => ({
  assertHostedToolAllowed: jest.fn(),
  filterHostedTools: jest.fn((_ctx: any, _name: string, tools: any[]) => tools),
  reserveHostedToolCall: jest.fn(),
  settleHostedToolCall: jest.fn(),
}));
jest.mock('../../src/services/activityLoggingService.js', () => ({
  getActivityLoggingService: jest.fn(() => ({ logToolCall: jest.fn() })),
}));
jest.mock('../../src/services/toolResultCompressionService.js', () => ({
  maybeCompressToolResult: jest.fn((r: any) => r),
}));
jest.mock('../../src/services/keepAliveService.js', () => ({
  setupClientKeepAlive: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../src/services/groupService.js', () => ({
  getServerConfigsInGroup: jest.fn(async () => []),
  getServerConfigInGroup: jest.fn(async () => undefined),
  getServersInGroup: jest.fn(async () => []),
  normalizeGroupServers: jest.fn((servers: any[]) => servers),
  notifyToolChanged: jest.fn(),
}));
jest.mock('../../src/services/proxy.js', () => ({
  normalizeHeaders: jest.fn((h: any) => h),
  createFetchWithProxy: jest.fn(),
  getProxyConfigFromEnv: jest.fn(),
}));
jest.mock('../../src/config/index.js', () => ({
  __esModule: true,
  default: { mcpHubName: 'test', mcpHubVersion: '1.0.0', basePath: '' },
  expandEnvVars: jest.fn((v: string) => v),
  replaceEnvVars: jest.fn((v: any) => v),
  getNameSeparator: jest.fn(() => '-'),
  loadSettings: jest.fn(),
  getSettingsPath: jest.fn(),
}));
jest.mock('../../src/utils/mcpApps.js', () => ({
  MCP_APPS_CAPABILITIES: {},
  filterModelVisibleTools: jest.fn((_: any, tools: any[]) => tools),
  hasMcpAppsCapability: jest.fn(() => false),
  isAppOnlyTool: jest.fn(() => false),
  stripMcpAppsMetadata: jest.fn((t: any) => t),
}));
jest.mock('../../src/clients/openapi.js', () => ({ OpenAPIClient: jest.fn() }));
jest.mock('../../src/services/cloudService.js', () => ({
  getCloudService: jest.fn(() => ({ isEnabled: false })),
}));
jest.mock('../../src/services/changelogService.js', () => ({
  getChangelogService: jest.fn(() => ({ getChangelog: jest.fn() })),
}));
jest.mock('../../src/services/hostedMode.js', () => ({
  isHostedModeEnabled: jest.fn(() => false),
}));
jest.mock('../../src/services/hostedControlPlaneClient.js', () => ({
  getHostedControlPlaneClient: jest.fn(),
}));

import * as mcpService from '../../src/services/mcpService.js';

const textOf = (result: any): string => result?.content?.[0]?.text ?? '';

describe('hub vault tools at the public MCP entry points', () => {
  const enableVault = () =>
    mockGetSystemConfig.mockResolvedValue({ normalizeToolNames: true, vaultMcpTools: true } as any);

  beforeEach(() => {
    jest.clearAllMocks();
    mockKeyKind = 'user';
    mockGetSystemConfig.mockResolvedValue({ normalizeToolNames: true } as any);
    mockGetFileStagingSettings.mockResolvedValue({ enabled: false } as any);
  });

  afterEach(() => {
    mcpService.setServerInfosForTest([]);
  });

  it('does not list or run the vault tools while the setting is off', async () => {
    const listed = await mcpService.handleListToolsRequest({}, { sessionId: 's1' });
    expect(listed.tools.some((tool: any) => tool.name.startsWith('mcphub_vault_'))).toBe(false);

    const result = await mcpService.handleCallToolRequest(
      { params: { name: 'mcphub_vault_list', arguments: {} } },
      { sessionId: 's1' },
    );
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/not enabled/i);
    expect(mockExecuteVaultTool).not.toHaveBeenCalled();
    expect(mockCallTool).not.toHaveBeenCalled();
  });

  it('lists the vault tools for a signed-in caller once enabled', async () => {
    enableVault();
    const listed = await mcpService.handleListToolsRequest({}, { sessionId: 's1' });
    const names = listed.tools.map((tool: any) => tool.name);
    expect(names).toEqual(expect.arrayContaining(['mcphub_vault_list', 'mcphub_vault_create']));
  });

  it('does not list the vault tools for a system key', async () => {
    enableVault();
    mockKeyKind = 'system';
    const listed = await mcpService.handleListToolsRequest({}, { sessionId: 's1' });
    expect(listed.tools.some((tool: any) => tool.name.startsWith('mcphub_vault_'))).toBe(false);
  });

  it('dispatches a vault call for the caller without touching upstream servers', async () => {
    enableVault();
    const result = await mcpService.handleCallToolRequest(
      { params: { name: 'mcphub_vault_list', arguments: { tag: 'prod' } } },
      { sessionId: 's1' },
    );
    expect(result.isError).toBeFalsy();
    expect(mockExecuteVaultTool).toHaveBeenCalledWith(
      'mcphub_vault_list',
      { tag: 'prod' },
      'alice',
    );
    expect(mockCallTool).not.toHaveBeenCalled();
  });

  it('refuses a vault call from a system key', async () => {
    enableVault();
    mockKeyKind = 'system';
    const result = await mcpService.handleCallToolRequest(
      { params: { name: 'mcphub_vault_create', arguments: { name: 'x' } } },
      { sessionId: 's1' },
    );
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/signed-in user/i);
    expect(mockExecuteVaultTool).not.toHaveBeenCalled();
  });

  it('rejects an unknown name in the reserved vault namespace', async () => {
    enableVault();
    const result = await mcpService.handleCallToolRequest(
      { params: { name: 'mcphub_vault_reveal', arguments: {} } },
      { sessionId: 's1' },
    );
    expect(result.isError).toBe(true);
    expect(mockExecuteVaultTool).not.toHaveBeenCalled();
    expect(mockCallTool).not.toHaveBeenCalled();
  });

  it('rejects a vault name smuggled through a nested call_tool', async () => {
    enableVault();
    const result = await mcpService.handleCallToolRequest(
      {
        params: {
          name: 'call_tool',
          arguments: { toolName: 'mcphub_vault_create', arguments: { name: 'x' } },
        },
      },
      { sessionId: 's1' },
    );
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/cannot be called through call_tool/i);
    expect(mockExecuteVaultTool).not.toHaveBeenCalled();
  });
});
