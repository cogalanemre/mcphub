export const VAULT_TOOL_PREFIX = 'mcphub_vault_';

export const VAULT_TOOL_DEFINITIONS = [
  {
    name: 'mcphub_vault_list',
    title: 'List vault credentials',
    description:
      "List the caller's MCPHub vault entries: name, tags, URL, host, port, account usernames and bearer token names, starred entries first. Password and token values are never returned; hasPassword only reports whether a password is stored.",
    inputSchema: {
      type: 'object',
      properties: {
        tag: { type: 'string', description: 'Only entries carrying this tag.' },
        query: {
          type: 'string',
          description:
            'Case-insensitive text matched against name, description, tags, URL and host.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'mcphub_vault_create',
    title: 'Store a credential in the vault',
    description:
      "Create an entry in the caller's MCPHub vault. Passwords and the bearer token are encrypted at rest and no vault tool ever returns them.",
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Display name, for example "Orders MongoDB".' },
        description: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        url: { type: 'string', description: 'Connection or console URL including the scheme.' },
        host: { type: 'string', description: 'Hostname or IP address.' },
        port: { type: 'integer', minimum: 1, maximum: 65535 },
        accounts: {
          type: 'array',
          description: 'Username and password pairs.',
          items: {
            type: 'object',
            properties: {
              username: { type: 'string' },
              password: { type: 'string' },
            },
            additionalProperties: false,
          },
        },
        tokens: {
          type: 'array',
          description: 'Named bearer tokens to store encrypted.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Label, for example "CI deploy".' },
              token: { type: 'string' },
            },
            required: ['token'],
            additionalProperties: false,
          },
        },
      },
      required: ['name'],
      additionalProperties: false,
    },
  },
] as const;

export type VaultToolName = (typeof VAULT_TOOL_DEFINITIONS)[number]['name'];

const DEFINITION_NAMES = new Set<string>(VAULT_TOOL_DEFINITIONS.map((tool) => tool.name));

export const isVaultToolName = (name: unknown): name is VaultToolName =>
  typeof name === 'string' && DEFINITION_NAMES.has(name);

export const isReservedVaultName = (name: unknown): boolean =>
  typeof name === 'string' && name.startsWith(VAULT_TOOL_PREFIX);
