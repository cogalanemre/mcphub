import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

jest.mock('../../src/services/oauthService.js', () => ({
  initializeAllOAuthClients: jest.fn(),
}));

jest.mock('../../src/services/mcpOAuthProvider.js', () => ({
  createOAuthProvider: jest.fn(async () => undefined),
}));

jest.mock('../../src/services/groupService.js', () => ({
  getServersInGroup: jest.fn(),
  getServerConfigInGroup: jest.fn(),
}));

jest.mock('../../src/services/sseService.js', () => ({
  getGroup: jest.fn(() => ''),
}));

jest.mock('../../src/services/vectorSearchService.js', () => ({
  removeServerToolEmbeddings: jest.fn(),
  saveToolsAsVectorEmbeddings: jest.fn(),
}));

jest.mock('../../src/services/services.js', () => ({
  getDataService: jest.fn(() => ({
    filterData: (data: any) => data,
  })),
}));

jest.mock('../../src/services/smartRoutingService.js', () => ({
  initSmartRoutingService: jest.fn(),
  getSmartRoutingTools: jest.fn(),
  handleSearchToolsRequest: jest.fn(),
  handleDescribeToolRequest: jest.fn(),
  isSmartRoutingGroup: jest.fn(() => false),
}));

jest.mock('../../src/services/activityLoggingService.js', () => ({
  getActivityLoggingService: jest.fn(() => ({
    logToolCall: jest.fn(),
  })),
}));

jest.mock('../../src/services/keepAliveService.js', () => ({
  setupClientKeepAlive: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/services/proxy.js', () => ({
  createFetchWithProxy: jest.fn(() => jest.fn()),
  getProxyConfigFromEnv: jest.fn(() => undefined),
}));

jest.mock('../../src/dao/index.js', () => ({
  getServerDao: jest.fn(() => ({
    findAll: jest.fn(async () => []),
    findById: jest.fn(async () => null),
  })),
  getSystemConfigDao: jest.fn(() => ({
    get: jest.fn(async () => ({})),
  })),
  getBuiltinPromptDao: jest.fn(() => ({
    findEnabled: jest.fn(async () => []),
  })),
  getUserDao: jest.fn(() => ({
    findByUsername: jest.fn(async (username: string) => ({ isAdmin: username === 'admin' })),
  })),
}));

jest.mock('../../src/services/vaultService.js', () => ({
  resolveVaultHeaderReferences: jest.fn(),
  findServersUsingVaultEntry: jest.fn(async () => []),
}));

jest.mock('@modelcontextprotocol/client', () => ({
  ...jest.requireActual('@modelcontextprotocol/client'),
  StreamableHTTPClientTransport: jest.fn(),
  SSEClientTransport: jest.fn(),
}));

import {
  findServersUsingVaultEntry,
  resolveVaultHeaderReferences,
} from '../../src/services/vaultService.js';
import { vaultEvents } from '../../src/services/vaultEvents.js';
import { createTransportFromConfig } from '../../src/services/mcpService.js';

const mockedResolve = jest.mocked(resolveVaultHeaderReferences);
const reference = 'Bearer {{vault:entry-1/token-1}}';

describe('MCP Service - vault references in server headers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedResolve.mockImplementation(async (headers) => ({
      ...headers,
      Authorization: 'Bearer real-token',
    }));
  });

  it('fills references from the server owner vault before connecting', async () => {
    await createTransportFromConfig('github', {
      type: 'streamable-http',
      url: 'https://example.com/mcp',
      owner: 'admin',
      headers: { Authorization: reference },
    });

    expect(mockedResolve).toHaveBeenCalledWith({ Authorization: reference }, 'admin');
    const options = (StreamableHTTPClientTransport as jest.Mock).mock.calls[0][1];
    expect(options.requestInit.headers).toEqual({ Authorization: 'Bearer real-token' });
  });

  it('never fills references for per-user credential servers', async () => {
    await createTransportFromConfig('personal', {
      type: 'streamable-http',
      url: 'https://example.com/mcp',
      owner: 'admin',
      credentialTemplate: [{ target: 'headers', name: 'Authorization' }],
      headers: { Authorization: reference },
    });

    expect(mockedResolve).not.toHaveBeenCalled();
  });

  it('does not connect when a reference cannot be filled', async () => {
    mockedResolve.mockRejectedValue(
      new Error('A vault token referenced by this server no longer exists'),
    );

    await expect(
      createTransportFromConfig('github', {
        type: 'streamable-http',
        url: 'https://example.com/mcp',
        owner: 'admin',
        headers: { Authorization: reference },
      }),
    ).rejects.toThrow(/no longer exists/);
    expect(StreamableHTTPClientTransport).not.toHaveBeenCalled();
  });

  it('looks up the servers to reconnect when a vault token changes', async () => {
    vaultEvents.emit('tokensChanged', { owner: 'admin', entryId: 'entry-1' });
    await new Promise((resolve) => setImmediate(resolve));

    expect(findServersUsingVaultEntry).toHaveBeenCalledWith('admin', 'entry-1');
  });
});
