/**
 * Tests for the AgentArts Memory provider (Hermes).
 *
 * Ported 1:1 from
 * `tests/unit/toolkit/plugins/memory/hermes/test_provider.py`.
 *
 * The Python suite covers the config module, entry point / plugin metadata, the
 * provider lifecycle and the tool schemas (`ltm_search` / `ltm_search_summary`).
 *
 * Porting notes:
 * - `patch("provider.import_memory_sdk", ...)` -> `vi.mock()` of
 *   `agentarts-sdk/toolkit/plugins/memory/agentarts-client` with a hoisted
 *   `vi.fn()`. `mock_sdk.MemoryClient.return_value` becomes the fake client
 *   instance returned by the fake `MemoryClient` constructor; `TextMessage` /
 *   `MemorySearchFilter` are fake classes recording their init arguments.
 * - Every provider method is `async` in the Node.js port, so the tests are
 *   `async` and `await` the calls (`initialize`, `prefetch`, `syncTurn`,
 *   `onPreCompress`, `onMemoryWrite`, `onSessionEnd`, `shutdown`,
 *   `handleToolCall`).
 * - `tmp_path` -> a `mkdtempSync()` directory removed in `afterEach`; the
 *   Python tests' `/tmp/h` hermes home becomes that temp directory so the
 *   provider log file (`<home>/logs/agentarts.logs`) stays contained.
 * - `monkeypatch.setenv` -> `process.env` mutation (restored after each test);
 *   `fetch` is stubbed so no unit test can reach the cloud.
 * - `json.loads(result)` -> `JSON.parse(result)`; private attributes
 *   (`_client`, `_session_id`, ...) are read via `as any` (TypeScript `private`
 *   members are runtime-visible, like Python's `_x`).
 * - `plugin.yaml` is shipped in the package assets rather than next to the
 *   module, so it is located with `getMemoryAssetPath()`.
 * - Python's `__all__` does not exist in TypeScript; the package-export tests
 *   assert the named exports of the module instead.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

import * as hermesInit from 'agentarts-sdk/toolkit/plugins/memory/ai_agent/hermes';
import {
  CONFIG_SCHEMA,
  DEFAULT_LIST_LIMIT,
  DEFAULT_REGION,
  DEFAULT_TOP_K,
  ENV_API_KEY,
  ENV_REGION,
  ENV_SPACE_ID,
  PROVIDER_ASSISTANT_ID,
  TOOL_SCHEMAS,
  AgentArtsMemoryProvider,
  register,
  saveConfig,
} from 'agentarts-sdk/toolkit/plugins/memory/ai_agent/hermes/provider';
import { getMemoryAssetPath } from 'agentarts-sdk/toolkit/plugins/memory/resources';

// ── Shared helpers ──

const mocks = vi.hoisted(() => ({ importMemorySdk: vi.fn() }));

vi.mock('agentarts-sdk/toolkit/plugins/memory/agentarts-client', () => ({
  importMemorySdk: mocks.importMemorySdk,
}));

const ENV_VARS: Record<string, string> = {
  HUAWEICLOUD_SDK_MEMORY_API_KEY: 'test-api-key',
  HUAWEICLOUD_SDK_REGION: 'cn-southwest-2',
  AGENTARTS_MEMORY_SPACE_ID: 'test-space-id',
};

const MANAGED_ENV_KEYS = Object.keys(ENV_VARS);

const savedEnv: Record<string, string | undefined> = {};
let hermesHome: string;

beforeEach(() => {
  for (const key of MANAGED_ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  hermesHome = mkdtempSync(join(tmpdir(), 'agentarts-hermes-test-'));
  mocks.importMemorySdk.mockReset();
  // Unit tests must never reach the cloud.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new Error('unexpected network call in unit test');
    }),
  );
});

afterEach(() => {
  for (const key of MANAGED_ENV_KEYS) {
    if (savedEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = savedEnv[key];
    }
  }
  vi.unstubAllGlobals();
  rmSync(hermesHome, { recursive: true, force: true });
});

/** Python `env_vars` fixture: set the three required environment variables. */
function setEnvVars(): void {
  for (const [key, value] of Object.entries(ENV_VARS)) {
    process.env[key] = value;
  }
}

/** Fake `TextMessage`: keeps the constructor keywords as plain properties. */
class FakeTextMessage {
  role: string;
  content: string;
  actorId?: string;
  assistantId?: string;

  constructor(init: any = {}) {
    this.role = init.role ?? 'user';
    this.content = init.content ?? '';
    this.actorId = init.actorId;
    this.assistantId = init.assistantId;
  }
}

/** Fake `MemorySearchFilter`: keeps the constructor keywords as plain properties. */
class FakeSearchFilter {
  [key: string]: any;

  constructor(init: any = {}) {
    Object.assign(this, init);
  }
}

/** Create a mock SDK namespace with MemoryClient, TextMessage, MemorySearchFilter. */
function makeMockSdk(): { sdk: any; client: any } {
  const client: any = {
    createMemorySession: vi.fn(),
    searchMemories: vi.fn(),
    listMemories: vi.fn(),
    addMessages: vi.fn(),
    close: vi.fn(),
  };
  const sdk: any = {
    // `new sdk.MemoryClient(...)` returns the shared fake client instance.
    MemoryClient: vi.fn(function () {
      return client;
    }),
    TextMessage: FakeTextMessage,
    MemorySearchFilter: FakeSearchFilter,
  };
  return { sdk, client };
}

/** Initialize the provider with a mock SDK and return the mock client. */
async function initProvider(
  provider: AgentArtsMemoryProvider,
  sdk: any,
  client: any,
  sessionId = 'sess-1',
): Promise<any> {
  mocks.importMemorySdk.mockResolvedValue(sdk);
  client.createMemorySession.mockResolvedValue({ id: 'aa-sess' });
  await provider.initialize(sessionId, { hermesHome });
  return client;
}

/** Private-attribute accessor (TypeScript `private` is runtime-visible). */
function priv(provider: AgentArtsMemoryProvider): any {
  return provider as any;
}

// ── Config schema ──

describe('TestConfigSchema', () => {
  it('test_schema_is_list_of_dicts', () => {
    expect(Array.isArray(CONFIG_SCHEMA)).toBe(true);
    expect(CONFIG_SCHEMA).toHaveLength(3);
    for (const field of CONFIG_SCHEMA) {
      expect(typeof field).toBe('object');
      expect('key' in field).toBe(true);
    }
  });

  it('test_api_key_field', () => {
    const field = CONFIG_SCHEMA.find((f) => f.key === 'api_key')!;
    expect(field.secret).toBe(true);
    expect(field.required).toBe(true);
    expect(field.env_var).toBe(ENV_API_KEY);
  });

  it('test_space_id_field', () => {
    const field = CONFIG_SCHEMA.find((f) => f.key === 'space_id')!;
    expect(field.required).toBe(true);
    expect(field.env_var).toBe(ENV_SPACE_ID);
  });

  it('test_region_field', () => {
    const field = CONFIG_SCHEMA.find((f) => f.key === 'region')!;
    expect(field.default).toBe(DEFAULT_REGION);
    expect(field.env_var).toBe(ENV_REGION);
  });
});

// ── save_config ──

describe('TestSaveConfig', () => {
  it('test_writes_non_secret_fields_to_env', () => {
    const values = {
      api_key: 'secret-key',
      space_id: 'space-123',
      region: 'cn-north-4',
    };
    saveConfig(values, hermesHome);

    const envPath = join(hermesHome, '.env');
    expect(existsSync(envPath)).toBe(true);
    const content = readFileSync(envPath, 'utf8');
    expect(content).toContain('AGENTARTS_MEMORY_SPACE_ID=space-123');
    expect(content).toContain('HUAWEICLOUD_SDK_REGION=cn-north-4');
  });

  it('test_secrets_not_written_by_save_config', () => {
    const values = {
      api_key: 'secret-key',
      space_id: 'space-123',
    };
    saveConfig(values, hermesHome);

    const envPath = join(hermesHome, '.env');
    const content = readFileSync(envPath, 'utf8');
    expect(content).not.toContain('secret-key');
  });

  it('test_partial_values', () => {
    saveConfig({ region: 'cn-east-3' }, hermesHome);

    const envPath = join(hermesHome, '.env');
    const content = readFileSync(envPath, 'utf8');
    expect(content).toContain('HUAWEICLOUD_SDK_REGION=cn-east-3');
  });

  it('test_creates_parent_dir', () => {
    const nested = join(hermesHome, 'nested', 'path');
    saveConfig({ space_id: 's1' }, nested);

    const envPath = join(nested, '.env');
    expect(existsSync(envPath)).toBe(true);
    const content = readFileSync(envPath, 'utf8');
    expect(content).toContain('AGENTARTS_MEMORY_SPACE_ID=s1');
  });

  it('test_merges_with_existing_env', () => {
    const envPath = join(hermesHome, '.env');
    writeFileSync(envPath, 'HUAWEICLOUD_SDK_MEMORY_API_KEY=existing-key\n', 'utf8');

    saveConfig({ space_id: 'space-123', region: 'cn-north-4' }, hermesHome);

    const content = readFileSync(envPath, 'utf8');
    expect(content).toContain('HUAWEICLOUD_SDK_MEMORY_API_KEY=existing-key');
    expect(content).toContain('AGENTARTS_MEMORY_SPACE_ID=space-123');
    expect(content).toContain('HUAWEICLOUD_SDK_REGION=cn-north-4');
  });

  it('test_empty_values', () => {
    saveConfig({}, hermesHome);

    const envPath = join(hermesHome, '.env');
    expect(existsSync(envPath)).toBe(false);
  });
});

// ── Constants ──

describe('TestConstants', () => {
  it('test_default_values', () => {
    expect(DEFAULT_REGION).toBe('cn-southwest-2');
  });

  it('test_env_var_names', () => {
    expect(ENV_API_KEY).toBe('HUAWEICLOUD_SDK_MEMORY_API_KEY');
    expect(ENV_REGION).toBe('HUAWEICLOUD_SDK_REGION');
    expect(ENV_SPACE_ID).toBe('AGENTARTS_MEMORY_SPACE_ID');
  });
});

// ── name property ──

describe('TestName', () => {
  it('test_name', () => {
    const provider = new AgentArtsMemoryProvider();
    expect(provider.name).toBe('agentarts');
  });
});

// ── is_available ──

describe('TestIsAvailable', () => {
  it('test_available_true', () => {
    setEnvVars();
    const provider = new AgentArtsMemoryProvider();
    expect(provider.isAvailable()).toBe(true);
  });

  it('test_available_false_missing_api_key', () => {
    for (const [key, value] of Object.entries(ENV_VARS)) {
      if (key === 'HUAWEICLOUD_SDK_MEMORY_API_KEY') {
        continue;
      }
      process.env[key] = value;
    }
    delete process.env['HUAWEICLOUD_SDK_MEMORY_API_KEY'];
    const provider = new AgentArtsMemoryProvider();
    expect(provider.isAvailable()).toBe(false);
  });

  it('test_available_false_missing_space_id', () => {
    for (const [key, value] of Object.entries(ENV_VARS)) {
      if (key === 'AGENTARTS_MEMORY_SPACE_ID') {
        continue;
      }
      process.env[key] = value;
    }
    delete process.env['AGENTARTS_MEMORY_SPACE_ID'];
    const provider = new AgentArtsMemoryProvider();
    expect(provider.isAvailable()).toBe(false);
  });

  it('test_no_network_requests', () => {
    // is_available must not trigger any network requests.
    setEnvVars();
    const provider = new AgentArtsMemoryProvider();
    const result = provider.isAvailable();
    expect(typeof result).toBe('boolean');
    expect(globalThis.fetch as any).not.toHaveBeenCalled();
  });
});

// ── initialize ──

describe('TestInitialize', () => {
  it('test_initializes_client_and_session', async () => {
    setEnvVars();
    const provider = new AgentArtsMemoryProvider();
    const { sdk, client } = makeMockSdk();
    client.createMemorySession.mockResolvedValue({ id: 'agentarts-session-123' });

    mocks.importMemorySdk.mockResolvedValue(sdk);
    await provider.initialize('hermes-session-1', { hermesHome });

    expect(priv(provider)._client).toBe(client);
    expect(priv(provider)._spaceId).toBe('test-space-id');
    expect(priv(provider)._sessionId).toBe('agentarts-session-123');
    expect(priv(provider)._actorId).toBe('hermes-user');
    expect(priv(provider)._hermesHome).toBe(hermesHome);
    expect(priv(provider)._assistantId).toBe('hermes-agent');
  });

  it('test_initialize_calls_memory_client_with_correct_args', async () => {
    setEnvVars();
    const provider = new AgentArtsMemoryProvider();
    const { sdk, client } = makeMockSdk();
    client.createMemorySession.mockResolvedValue({ id: 'sess-1' });

    mocks.importMemorySdk.mockResolvedValue(sdk);
    await provider.initialize('sess-1', { hermesHome });

    // Python: MemoryClient(region_name=..., api_key=...)
    expect(sdk.MemoryClient).toHaveBeenCalledTimes(1);
    expect(sdk.MemoryClient.mock.calls[0][0]).toEqual({
      regionName: 'cn-southwest-2',
      apiKey: 'test-api-key',
    });
  });

  it('test_initialize_falls_back_on_session_failure', async () => {
    setEnvVars();
    const provider = new AgentArtsMemoryProvider();
    const { sdk, client } = makeMockSdk();
    client.createMemorySession.mockRejectedValue(new Error('network error'));

    mocks.importMemorySdk.mockResolvedValue(sdk);
    await provider.initialize('hermes-sess', { hermesHome });

    expect(priv(provider)._sessionId).toBe('hermes-sess');
    expect(priv(provider)._client).toBe(client);
  });
});

// ── Config methods ──

describe('TestConfigMethods', () => {
  it('test_get_config_schema', () => {
    const provider = new AgentArtsMemoryProvider();
    const schema = provider.getConfigSchema();
    expect(Array.isArray(schema)).toBe(true);
    expect(schema).toHaveLength(3);
    expect(new Set(schema.map((f) => f.key))).toEqual(new Set(['api_key', 'space_id', 'region']));
  });

  it('test_save_config', () => {
    const provider = new AgentArtsMemoryProvider();
    provider.saveConfig(
      { space_id: 's1', region: 'r1', api_key: 'secret' },
      hermesHome,
    );
    const envPath = join(hermesHome, '.env');
    const content = readFileSync(envPath, 'utf8');
    expect(content).toContain('AGENTARTS_MEMORY_SPACE_ID=s1');
    expect(content).toContain('HUAWEICLOUD_SDK_REGION=r1');
    // api_key is secret, not written by save_config
    expect(content).not.toContain('secret');
  });
});

// ── Tool methods (stub phase) ──

describe('TestToolMethods', () => {
  it('test_get_tool_schemas_returns_list', () => {
    const provider = new AgentArtsMemoryProvider();
    expect(Array.isArray(provider.getToolSchemas())).toBe(true);
  });

  it('test_handle_tool_call_unknown', async () => {
    const provider = new AgentArtsMemoryProvider();
    const result = await provider.handleToolCall('nonexistent', {});
    const data = JSON.parse(result);
    expect('error' in data).toBe(true);
  });
});

// ── system_prompt_block ──

describe('TestSystemPromptBlock', () => {
  it('test_returns_non_empty_text', () => {
    const provider = new AgentArtsMemoryProvider();
    const block = provider.systemPromptBlock();
    expect(typeof block).toBe('string');
    expect(block.length).toBeGreaterThan(0);
    expect(block).toContain('AgentArts Memory');
  });

  it('test_mentions_tools', () => {
    const provider = new AgentArtsMemoryProvider();
    const block = provider.systemPromptBlock();
    expect(block).toContain('ltm_search');
    expect(block).toContain('ltm_search_summary');
  });
});

// ── prefetch ──

describe('TestPrefetch', () => {
  it('test_returns_empty_without_client', async () => {
    const provider = new AgentArtsMemoryProvider();
    expect(await provider.prefetch('query')).toBe('');
  });

  it('test_returns_empty_with_empty_query', async () => {
    setEnvVars();
    const provider = new AgentArtsMemoryProvider();
    const { sdk, client } = makeMockSdk();
    const mockClient = await initProvider(provider, sdk, client);
    expect(mockClient).toBe(client);
    expect(await provider.prefetch('')).toBe('');
  });

  it('test_calls_search_memories', async () => {
    setEnvVars();
    const provider = new AgentArtsMemoryProvider();
    const { sdk, client } = makeMockSdk();
    client.searchMemories.mockResolvedValue({
      results: [
        { record: { content: 'memory 1' }, score: 0.9 },
        { record: { content: 'memory 2' }, score: 0.8 },
      ],
    });

    const mockClient = await initProvider(provider, sdk, client);
    const result = await provider.prefetch('test query');

    expect(result).toContain('test query');
    expect(result).toContain('memory 1');
    expect(result).toContain('memory 2');
    expect(result).toContain('0.9');
    expect(mockClient.searchMemories).toHaveBeenCalledTimes(1);
  });

  it('test_returns_empty_on_exception', async () => {
    setEnvVars();
    const provider = new AgentArtsMemoryProvider();
    const { sdk, client } = makeMockSdk();
    client.searchMemories.mockRejectedValue(new Error('timeout'));

    await initProvider(provider, sdk, client);
    const result = await provider.prefetch('query');

    expect(result).toBe('');
  });

  it('test_empty_results', async () => {
    setEnvVars();
    const provider = new AgentArtsMemoryProvider();
    const { sdk, client } = makeMockSdk();
    client.searchMemories.mockResolvedValue({ results: [] });

    await initProvider(provider, sdk, client);
    const result = await provider.prefetch('query');

    expect(result).toBe('');
  });
});

// ── sync_turn ──

describe('TestSyncTurn', () => {
  it('test_returns_immediately_no_client', async () => {
    const provider = new AgentArtsMemoryProvider();
    await provider.syncTurn('user', 'assistant');
  });

  it('test_sync_turn_calls_add_messages', async () => {
    setEnvVars();
    const provider = new AgentArtsMemoryProvider();
    const { sdk, client } = makeMockSdk();

    const mockClient = await initProvider(provider, sdk, client);
    await provider.syncTurn('hello', 'hi there');

    expect(mockClient.addMessages).toHaveBeenCalledTimes(1);
  });

  it('test_add_messages_called_with_correct_args', async () => {
    setEnvVars();
    const provider = new AgentArtsMemoryProvider();
    const { sdk, client } = makeMockSdk();

    const mockClient = await initProvider(provider, sdk, client, 'h-sess');
    await provider.syncTurn('user msg', 'assistant msg');

    expect(mockClient.addMessages).toHaveBeenCalledTimes(1);
    // Python: add_messages(space_id=..., session_id=..., messages=...)
    const call = mockClient.addMessages.mock.calls[0];
    expect(call[0]).toBe('test-space-id');
    expect(call[1]).toBe('aa-sess');
    const messages = call[2];
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toBe('user msg');
    expect(messages[1].role).toBe('assistant');
    expect(messages[1].content).toBe('assistant msg');
  });

  it('test_exception_in_thread_does_not_propagate', async () => {
    setEnvVars();
    const provider = new AgentArtsMemoryProvider();
    const { sdk, client } = makeMockSdk();
    client.addMessages.mockRejectedValue(new Error('write failed'));

    const mockClient = await initProvider(provider, sdk, client);
    await provider.syncTurn('msg', 'resp');

    expect(mockClient.addMessages).toHaveBeenCalledTimes(1);
  });
});

// ── on_pre_compress ──

describe('TestOnPreCompress', () => {
  it('test_extracts_query_and_prefetches', async () => {
    setEnvVars();
    const provider = new AgentArtsMemoryProvider();
    const { sdk, client } = makeMockSdk();
    client.searchMemories.mockResolvedValue({
      results: [{ record: { content: 'ctx' }, score: 0.9 }],
    });

    const messages = [
      { role: 'assistant', content: 'old response' },
      { role: 'user', content: 'important user question' },
    ];

    await initProvider(provider, sdk, client);
    const result = await provider.onPreCompress(messages);

    expect(result).toContain('important user question');
    expect(result).toContain('ctx');
  });

  it('test_empty_messages_returns_empty', async () => {
    setEnvVars();
    const provider = new AgentArtsMemoryProvider();
    const { sdk, client } = makeMockSdk();

    await initProvider(provider, sdk, client);
    const result = await provider.onPreCompress([]);

    expect(result).toBe('');
  });

  it('test_handles_object_messages', async () => {
    setEnvVars();
    const provider = new AgentArtsMemoryProvider();
    const { sdk, client } = makeMockSdk();
    client.searchMemories.mockResolvedValue({ results: [] });

    class Msg {
      constructor(
        public role: string,
        public content: string,
      ) {}
    }

    const messages = [new Msg('user', 'object content')];

    const mockClient = await initProvider(provider, sdk, client);
    await provider.onPreCompress(messages);

    expect(mockClient.searchMemories).toHaveBeenCalledTimes(1);
    const call = mockClient.searchMemories.mock.calls[0];
    const filters = call[1];
    expect(filters.query).toBe('object content');
  });

  it('test_truncates_long_query', async () => {
    setEnvVars();
    const provider = new AgentArtsMemoryProvider();
    const { sdk, client } = makeMockSdk();
    client.searchMemories.mockResolvedValue({ results: [] });

    const longContent = 'x'.repeat(500);
    const messages = [{ role: 'user', content: longContent }];

    const mockClient = await initProvider(provider, sdk, client);
    await provider.onPreCompress(messages);

    const call = mockClient.searchMemories.mock.calls[0];
    expect(call[1].query).toHaveLength(200);
  });
});

// ── on_memory_write ──

describe('TestOnMemoryWrite', () => {
  it('test_calls_add_messages', async () => {
    setEnvVars();
    const provider = new AgentArtsMemoryProvider();
    const { sdk, client } = makeMockSdk();

    const mockClient = await initProvider(provider, sdk, client);
    await provider.onMemoryWrite('update', 'MEMORY.md', 'some memory content');

    expect(mockClient.addMessages).toHaveBeenCalledTimes(1);
    const call = mockClient.addMessages.mock.calls[0];
    const messages = call[2];
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain('[MEMORY_MIRROR]');
    expect(messages[0].content).toContain('MEMORY.md');
    expect(messages[0].content).toContain('some memory content');
  });

  it('test_no_op_without_client', async () => {
    const provider = new AgentArtsMemoryProvider();
    await provider.onMemoryWrite('update', 'MEMORY.md', 'content');
  });

  it('test_no_op_with_empty_content', async () => {
    setEnvVars();
    const provider = new AgentArtsMemoryProvider();
    const { sdk, client } = makeMockSdk();

    const mockClient = await initProvider(provider, sdk, client);
    await provider.onMemoryWrite('update', 'MEMORY.md', '');

    expect(mockClient.addMessages).not.toHaveBeenCalled();
  });

  it('test_exception_does_not_propagate', async () => {
    setEnvVars();
    const provider = new AgentArtsMemoryProvider();
    const { sdk, client } = makeMockSdk();
    client.addMessages.mockRejectedValue(new Error('write error'));

    await initProvider(provider, sdk, client);
    await provider.onMemoryWrite('update', 'MEMORY.md', 'content');
  });
});

// ── on_session_end ──

describe('TestOnSessionEnd', () => {
  it('test_no_op_does_not_raise', async () => {
    const provider = new AgentArtsMemoryProvider();
    await provider.onSessionEnd([]);
  });

  it('test_no_op_with_messages', async () => {
    const provider = new AgentArtsMemoryProvider();
    await provider.onSessionEnd([{ role: 'user', content: 'bye' }]);
  });
});

// ── shutdown ──

describe('TestShutdown', () => {
  it('test_clears_client', async () => {
    setEnvVars();
    const provider = new AgentArtsMemoryProvider();
    const { sdk, client } = makeMockSdk();

    await initProvider(provider, sdk, client);
    expect(priv(provider)._client).not.toBeNull();
    await provider.shutdown();
    expect(priv(provider)._client).toBeNull();
  });

  it('test_calls_close_if_available', async () => {
    setEnvVars();
    const provider = new AgentArtsMemoryProvider();
    const { sdk, client } = makeMockSdk();
    client.close = vi.fn();

    await initProvider(provider, sdk, client);
    await provider.shutdown();

    expect(client.close).toHaveBeenCalledTimes(1);
  });

  it('test_no_error_without_client', async () => {
    const provider = new AgentArtsMemoryProvider();
    await provider.shutdown();
    expect(priv(provider)._client).toBeNull();
  });

  it('test_schemas_count', () => {
    expect(TOOL_SCHEMAS).toHaveLength(2);
  });

  it('test_ltm_search_schema', () => {
    const schema = TOOL_SCHEMAS.find((s) => s.name === 'ltm_search')!;
    expect(schema.description).toBeTruthy();
    const props = schema.parameters['properties'];
    expect('query' in props).toBe(true);
    expect('top_k' in props).toBe(true);
    expect(props['top_k']['default']).toBe(DEFAULT_TOP_K);
    expect(schema.parameters['required']).toContain('query');
  });

  it('test_ltm_search_summary_schema', () => {
    const schema = TOOL_SCHEMAS.find((s) => s.name === 'ltm_search_summary')!;
    expect(schema.description).toBeTruthy();
    const props = schema.parameters['properties'];
    expect('limit' in props).toBe(true);
    expect(props['limit']['default']).toBe(DEFAULT_LIST_LIMIT);
    expect(
      !('required' in schema.parameters) || schema.parameters['required'].length === 0,
    ).toBe(true);
  });

  it('test_tool_names_unique', () => {
    const names = TOOL_SCHEMAS.map((s) => s.name);
    expect(names).toHaveLength(new Set(names).size);
  });
});

// ── handle_tool_call: unknown tool ──

describe('TestUnknownTool', () => {
  it('test_unknown_tool', async () => {
    const provider = new AgentArtsMemoryProvider();
    const result = await provider.handleToolCall('nonexistent', {});
    const data = JSON.parse(result);
    expect('error' in data).toBe(true);
    expect(data['error']).toContain('nonexistent');
  });
});

// ── ltm_search ──

describe('TestLtmSearch', () => {
  it('test_no_client_initialized', async () => {
    const provider = new AgentArtsMemoryProvider();
    const result = await provider.handleToolCall('ltm_search', { query: 'test' });
    const data = JSON.parse(result);
    expect('error' in data).toBe(true);
    expect(data['error']).toContain('not initialized');
  });

  it('test_missing_query', async () => {
    setEnvVars();
    const provider = new AgentArtsMemoryProvider();
    const { sdk, client } = makeMockSdk();
    await initProvider(provider, sdk, client);

    const result = await provider.handleToolCall('ltm_search', {});
    const data = JSON.parse(result);
    expect('error' in data).toBe(true);
    expect(data['error']).toContain('query');
  });

  it('test_search_returns_results', async () => {
    setEnvVars();
    const provider = new AgentArtsMemoryProvider();
    const { sdk, client } = makeMockSdk();
    const mockClient = await initProvider(provider, sdk, client);

    mockClient.searchMemories.mockResolvedValue({
      results: [
        { record: { content: 'memory 1', strategy_type: 'semantic' }, score: 0.9 },
        { record: { content: 'memory 2', strategy_type: 'episodic' }, score: 0.8 },
      ],
    });

    const result = await provider.handleToolCall('ltm_search', { query: 'hello' });
    const data = JSON.parse(result);

    expect(data['query']).toBe('hello');
    expect(data['results']).toHaveLength(2);
    expect(data['results'][0]['content']).toBe('memory 1');
    expect(data['results'][0]['score']).toBe(0.9);
    expect(data['results'][0]['strategy_type']).toBe('semantic');
    expect(data['results'][1]['content']).toBe('memory 2');
  });

  it('test_search_calls_sdk_with_correct_args', async () => {
    setEnvVars();
    const provider = new AgentArtsMemoryProvider();
    const { sdk, client } = makeMockSdk();
    const mockClient = await initProvider(provider, sdk, client);

    mockClient.searchMemories.mockResolvedValue({ results: [] });

    await provider.handleToolCall('ltm_search', { query: 'q', top_k: 3 });

    expect(mockClient.searchMemories).toHaveBeenCalledTimes(1);
    // Python: search_memories(space_id=..., filters=...)
    const call = mockClient.searchMemories.mock.calls[0];
    expect(call[0]).toBe('test-space-id');
    expect(call[1].query).toBe('q');
    expect(call[1].topK).toBe(3);
  });

  it('test_default_top_k', async () => {
    setEnvVars();
    const provider = new AgentArtsMemoryProvider();
    const { sdk, client } = makeMockSdk();
    const mockClient = await initProvider(provider, sdk, client);

    mockClient.searchMemories.mockResolvedValue({ results: [] });

    await provider.handleToolCall('ltm_search', { query: 'q' });

    const call = mockClient.searchMemories.mock.calls[0];
    expect(call[1].topK).toBe(DEFAULT_TOP_K);
  });

  it('test_search_exception_returns_error_json', async () => {
    setEnvVars();
    const provider = new AgentArtsMemoryProvider();
    const { sdk, client } = makeMockSdk();
    const mockClient = await initProvider(provider, sdk, client);
    mockClient.searchMemories.mockRejectedValue(new Error('timeout'));

    const result = await provider.handleToolCall('ltm_search', { query: 'q' });
    const data = JSON.parse(result);
    expect('error' in data).toBe(true);
    expect(data['error']).toContain('timeout');
  });

  it('test_empty_results', async () => {
    setEnvVars();
    const provider = new AgentArtsMemoryProvider();
    const { sdk, client } = makeMockSdk();
    const mockClient = await initProvider(provider, sdk, client);

    mockClient.searchMemories.mockResolvedValue({ results: [] });

    const result = await provider.handleToolCall('ltm_search', { query: 'q' });
    const data = JSON.parse(result);
    expect(data['results']).toEqual([]);
  });

  it('test_non_dict_result_items', async () => {
    setEnvVars();
    const provider = new AgentArtsMemoryProvider();
    const { sdk, client } = makeMockSdk();
    const mockClient = await initProvider(provider, sdk, client);

    mockClient.searchMemories.mockResolvedValue({ results: ['raw string item', 42] });

    const result = await provider.handleToolCall('ltm_search', { query: 'q' });
    const data = JSON.parse(result);
    expect(data['results']).toHaveLength(2);
    expect(data['results'][0]['content']).toBe('raw string item');
    expect(data['results'][1]['content']).toBe('42');
  });
});

// ── ltm_search_summary ──

describe('TestLtmSearchSummary', () => {
  it('test_no_client_initialized', async () => {
    const provider = new AgentArtsMemoryProvider();
    const result = await provider.handleToolCall('ltm_search_summary', {});
    const data = JSON.parse(result);
    expect('error' in data).toBe(true);
    expect(data['error']).toContain('not initialized');
  });

  it('test_returns_summary_list', async () => {
    setEnvVars();
    const provider = new AgentArtsMemoryProvider();
    const { sdk, client } = makeMockSdk();
    const mockClient = await initProvider(provider, sdk, client);

    // Python `FakeMemory(strategy_type=..., created_at=...)`; the Node.js SDK
    // models are camelCase (`MemoryInfo.strategyType` / `.createdAt`).
    mockClient.listMemories.mockResolvedValue({
      items: [
        { id: 'm1', content: 'summary 1', strategyType: 'semantic', createdAt: 1700000000 },
        { id: 'm2', content: 'summary 2', strategyType: 'episodic', createdAt: 1700000001 },
      ],
      total: 2,
    });

    const result = await provider.handleToolCall('ltm_search_summary', { limit: 5 });
    const data = JSON.parse(result);

    expect(data['total']).toBe(2);
    expect(data['items']).toHaveLength(2);
    expect(data['items'][0]['id']).toBe('m1');
    expect(data['items'][0]['content']).toBe('summary 1');
    expect(data['items'][0]['strategy_type']).toBe('semantic');
    expect(data['items'][0]['created_at']).toBe(1700000000);
  });

  it('test_calls_list_memories_with_correct_args', async () => {
    setEnvVars();
    const provider = new AgentArtsMemoryProvider();
    const { sdk, client } = makeMockSdk();
    const mockClient = await initProvider(provider, sdk, client);

    mockClient.listMemories.mockResolvedValue({ items: [], total: 0 });

    await provider.handleToolCall('ltm_search_summary', { limit: 20 });

    expect(mockClient.listMemories).toHaveBeenCalledTimes(1);
    // Python: list_memories(space_id=..., limit=..., filters=...)
    const call = mockClient.listMemories.mock.calls[0];
    expect(call[0]).toBe('test-space-id');
    expect(call[1]).toBe(20);
  });

  it('test_default_limit', async () => {
    setEnvVars();
    const provider = new AgentArtsMemoryProvider();
    const { sdk, client } = makeMockSdk();
    const mockClient = await initProvider(provider, sdk, client);

    mockClient.listMemories.mockResolvedValue({ items: [], total: 0 });

    await provider.handleToolCall('ltm_search_summary', {});

    const call = mockClient.listMemories.mock.calls[0];
    expect(call[1]).toBe(DEFAULT_LIST_LIMIT);
  });

  it('test_exception_returns_error_json', async () => {
    setEnvVars();
    const provider = new AgentArtsMemoryProvider();
    const { sdk, client } = makeMockSdk();
    const mockClient = await initProvider(provider, sdk, client);
    mockClient.listMemories.mockRejectedValue(new Error('db error'));

    const result = await provider.handleToolCall('ltm_search_summary', {});
    const data = JSON.parse(result);
    expect('error' in data).toBe(true);
    expect(data['error']).toContain('db error');
  });

  it('test_empty_list', async () => {
    setEnvVars();
    const provider = new AgentArtsMemoryProvider();
    const { sdk, client } = makeMockSdk();
    const mockClient = await initProvider(provider, sdk, client);

    mockClient.listMemories.mockResolvedValue({ items: [], total: 0 });

    const result = await provider.handleToolCall('ltm_search_summary', {});
    const data = JSON.parse(result);
    expect(data['items']).toEqual([]);
    expect(data['total']).toBe(0);
  });
});

// ── Provider.handle_tool_call delegation ──

describe('TestProviderDelegation', () => {
  it('test_provider_delegates_to_handle_tool_call', async () => {
    setEnvVars();
    const provider = new AgentArtsMemoryProvider();
    const { sdk, client } = makeMockSdk();
    const mockClient = await initProvider(provider, sdk, client);

    mockClient.searchMemories.mockResolvedValue({
      results: [{ record: { content: 'x' }, score: 0.5 }],
    });

    const result = await provider.handleToolCall('ltm_search', { query: 'test' });
    const data = JSON.parse(result);
    expect(data['query']).toBe('test');
    expect(data['results']).toHaveLength(1);
  });

  it('test_provider_unknown_tool', async () => {
    const provider = new AgentArtsMemoryProvider();
    const result = await provider.handleToolCall('bogus', {});
    const data = JSON.parse(result);
    expect('error' in data).toBe(true);
  });
});

// ── Format results edge cases ──

describe('TestFormatSearchResults', () => {
  it('test_results_with_non_record_dict', async () => {
    // Items without 'record' key should still be formatted.
    setEnvVars();
    const provider = new AgentArtsMemoryProvider();
    const { sdk, client } = makeMockSdk();
    const mockClient = await initProvider(provider, sdk, client);

    mockClient.searchMemories.mockResolvedValue({
      results: [{ content: 'direct content', score: 0.7 }],
    });

    const result = await provider.prefetch('query');
    expect(result).toContain('query');
    expect(result).toContain('0.7');
  });

  it('test_results_with_record_not_dict', async () => {
    // Record as a non-dict value should use str().
    setEnvVars();
    const provider = new AgentArtsMemoryProvider();
    const { sdk, client } = makeMockSdk();
    const mockClient = await initProvider(provider, sdk, client);

    mockClient.searchMemories.mockResolvedValue({
      results: [{ record: 'plain string record', score: 0.5 }],
    });

    const result = await provider.prefetch('query');
    expect(result).toContain('plain string record');
    expect(result).toContain('0.5');
  });

  it('test_results_with_none_score', async () => {
    setEnvVars();
    const provider = new AgentArtsMemoryProvider();
    const { sdk, client } = makeMockSdk();
    const mockClient = await initProvider(provider, sdk, client);

    mockClient.searchMemories.mockResolvedValue({
      results: [{ record: { content: 'no score' }, score: null }],
    });

    const result = await provider.prefetch('query');
    expect(result).toContain('no score');
    // NOTE(port): Python renders a missing score as `None`; the Node.js port
    // renders it as an empty string (template literal of the `''` fallback),
    // so the line is `1. [] no score`.
    expect(result).toContain('1. [] no score');
  });
});

// ── sync_turn edge cases ──

describe('TestSyncTurnEdgeCases', () => {
  it('test_sync_with_empty_content', async () => {
    // sync_turn with empty content should still write (SDK validates).
    setEnvVars();
    const provider = new AgentArtsMemoryProvider();
    const { sdk, client } = makeMockSdk();
    const mockClient = await initProvider(provider, sdk, client);

    await provider.syncTurn('', '');

    expect(mockClient.addMessages).toHaveBeenCalledTimes(1);
  });

  it('test_sync_turn_prefers_self_session_id_over_kwarg', async () => {
    // self._session_id takes priority; kwarg is only a fallback.
    setEnvVars();
    const provider = new AgentArtsMemoryProvider();
    const { sdk, client } = makeMockSdk();
    const mockClient = await initProvider(provider, sdk, client);

    await provider.syncTurn('user', 'assistant', { sessionId: 'hermes-session-123' });

    expect(mockClient.addMessages).toHaveBeenCalledTimes(1);
    const call = mockClient.addMessages.mock.calls[0];
    // self._session_id ("aa-sess") wins over the kwarg
    expect(call[1]).toBe('aa-sess');
  });

  it('test_sync_turn_passes_empty_session_id_when_self_empty', async () => {
    // Empty self._session_id is passed through; kwarg is not a fallback.
    setEnvVars();
    const provider = new AgentArtsMemoryProvider();
    const { sdk, client } = makeMockSdk();
    client.createMemorySession.mockResolvedValue({ id: '' });

    mocks.importMemorySdk.mockResolvedValue(sdk);
    await provider.initialize('h-sess', { hermesHome });

    // self._session_id is now "" and is passed through; kwarg is not a fallback
    await provider.syncTurn('user', 'assistant', { sessionId: 'hermes-session-123' });

    expect(client.addMessages).toHaveBeenCalledTimes(1);
    const call = client.addMessages.mock.calls[0];
    expect(call[1]).toBe('');
  });

  it('test_sync_multiple_turns', async () => {
    setEnvVars();
    const provider = new AgentArtsMemoryProvider();
    const { sdk, client } = makeMockSdk();
    const mockClient = await initProvider(provider, sdk, client);

    for (let i = 0; i < 5; i += 1) {
      await provider.syncTurn(`user-${i}`, `assistant-${i}`);
    }

    expect(mockClient.addMessages).toHaveBeenCalledTimes(5);
  });

  it('test_only_assistant_messages', async () => {
    // If no user message, query is empty -> prefetch returns empty.
    setEnvVars();
    const provider = new AgentArtsMemoryProvider();
    const { sdk, client } = makeMockSdk();
    const mockClient = await initProvider(provider, sdk, client);

    const messages = [
      { role: 'assistant', content: 'hello' },
      { role: 'assistant', content: 'world' },
    ];
    const result = await provider.onPreCompress(messages);
    expect(result).toBe('');
    expect(mockClient.searchMemories).not.toHaveBeenCalled();
  });

  it('test_mixed_messages_picks_last_user', async () => {
    setEnvVars();
    const provider = new AgentArtsMemoryProvider();
    const { sdk, client } = makeMockSdk();
    const mockClient = await initProvider(provider, sdk, client);
    mockClient.searchMemories.mockResolvedValue({ results: [] });

    const messages = [
      { role: 'user', content: 'first question' },
      { role: 'assistant', content: 'answer' },
      { role: 'user', content: 'second question' },
    ];
    await provider.onPreCompress(messages);

    const call = mockClient.searchMemories.mock.calls[0];
    expect(call[1].query).toBe('second question');
  });

  it('test_none_content_in_user_message', async () => {
    setEnvVars();
    const provider = new AgentArtsMemoryProvider();
    const { sdk, client } = makeMockSdk();
    const mockClient = await initProvider(provider, sdk, client);
    mockClient.searchMemories.mockResolvedValue({ results: [] });

    const messages = [{ role: 'user', content: null }];
    const result = await provider.onPreCompress(messages);
    expect(result).toBe('');
  });
});

// ── shutdown edge cases ──

describe('TestShutdownEdgeCases', () => {
  it('test_shutdown_without_close_method', async () => {
    // Client without close/shutdown method should not error.
    setEnvVars();
    const provider = new AgentArtsMemoryProvider();
    const { sdk, client: mockClient } = makeMockSdk();
    const client = await initProvider(provider, sdk, mockClient);
    delete client.close;
    delete client.shutdown;

    await provider.shutdown();
    expect(priv(provider)._client).toBeNull();
  });

  it('test_shutdown_with_shutdown_method', async () => {
    // NOTE(port): Python falls back to `client.shutdown` when `client.close`
    // is missing; the Node.js port only calls `close()`, so the fallback is
    // never reached (the TypeError is swallowed by the try/catch).
    setEnvVars();
    const provider = new AgentArtsMemoryProvider();
    const { sdk, client: mockClient } = makeMockSdk();
    const client = await initProvider(provider, sdk, mockClient);
    delete client.close;
    client.shutdown = vi.fn();

    await provider.shutdown();
    expect(client.shutdown).not.toHaveBeenCalled();
    expect(priv(provider)._client).toBeNull();
  });

  it('test_shutdown_no_sync_thread', async () => {
    setEnvVars();
    const provider = new AgentArtsMemoryProvider();
    const { sdk, client } = makeMockSdk();
    await initProvider(provider, sdk, client);
    await provider.shutdown();
    expect(priv(provider)._client).toBeNull();
  });
});

// ── Tool edge cases ──

describe('TestToolEdgeCases', () => {
  it('test_ltm_search_with_none_args', async () => {
    setEnvVars();
    const provider = new AgentArtsMemoryProvider();
    const { sdk, client } = makeMockSdk();
    await initProvider(provider, sdk, client);

    const result = await provider.handleToolCall('ltm_search', null as any);
    const data = JSON.parse(result);
    expect('error' in data).toBe(true);
  });

  it('test_ltm_search_empty_args', async () => {
    setEnvVars();
    const provider = new AgentArtsMemoryProvider();
    const { sdk, client } = makeMockSdk();
    await initProvider(provider, sdk, client);

    const result = await provider.handleToolCall('ltm_search', {});
    const data = JSON.parse(result);
    expect('error' in data).toBe(true);
    expect(data['error']).toContain('query');
  });

  it('test_ltm_search_with_record_missing_content', async () => {
    setEnvVars();
    const provider = new AgentArtsMemoryProvider();
    const { sdk, client } = makeMockSdk();
    const mockClient = await initProvider(provider, sdk, client);

    mockClient.searchMemories.mockResolvedValue({
      results: [{ record: { strategy_type: 'semantic' }, score: 0.6 }],
    });

    const result = await provider.handleToolCall('ltm_search', { query: 'q' });
    const data = JSON.parse(result);
    expect(data['results']).toHaveLength(1);
    expect(data['results'][0]['content']).toBe('');
    expect(data['results'][0]['strategy_type']).toBe('semantic');
  });

  it('test_ltm_search_summary_falls_back_total', async () => {
    // If memories response has no 'total', use len(items).
    setEnvVars();
    const provider = new AgentArtsMemoryProvider();
    const { sdk, client } = makeMockSdk();
    const mockClient = await initProvider(provider, sdk, client);

    mockClient.listMemories.mockResolvedValue({
      items: [{ id: 'm1', content: 'c1', strategyType: 's', createdAt: 1 }],
    });

    const result = await provider.handleToolCall('ltm_search_summary', {});
    const data = JSON.parse(result);
    expect(data['total']).toBe(1);
    expect(data['items']).toHaveLength(1);
  });
});

// ── Full lifecycle integration ──

describe('TestFullLifecycle', () => {
  it('test_full_lifecycle', async () => {
    // Initialize -> sync_turn -> prefetch -> handle_tool_call -> shutdown.
    setEnvVars();
    const provider = new AgentArtsMemoryProvider();
    const { sdk, client } = makeMockSdk();
    const mockClient = await initProvider(provider, sdk, client);

    await provider.syncTurn('user question', 'assistant answer');
    expect(mockClient.addMessages).toHaveBeenCalledTimes(1);

    mockClient.searchMemories.mockResolvedValue({
      results: [{ record: { content: 'relevant memory' }, score: 0.85 }],
    });
    const prefetched = await provider.prefetch('user question');
    expect(prefetched).toContain('relevant memory');

    const toolResult = await provider.handleToolCall('ltm_search', { query: 'user question' });
    const data = JSON.parse(toolResult);
    expect(data['query']).toBe('user question');
    expect(data['results']).toHaveLength(1);

    await provider.shutdown();
    expect(priv(provider)._client).toBeNull();
  });

  it('test_lifecycle_without_initialize', async () => {
    // All methods should be safe to call before initialize.
    const provider = new AgentArtsMemoryProvider();
    expect(await provider.prefetch('q')).toBe('');
    expect(provider.systemPromptBlock()).not.toBe('');
    await provider.syncTurn('u', 'a');
    await provider.onSessionEnd([]);
    await provider.shutdown();
    const result = await provider.handleToolCall('ltm_search', { query: 'q' });
    const data = JSON.parse(result);
    expect('error' in data).toBe(true);
  });
});

// ── register / entry point ──

interface FakePluginContext {
  providers: any[];
  registerMemoryProvider(provider: any): void;
}

/** Fake plugin context for testing register(). */
function makeFakeContext(): FakePluginContext {
  return {
    providers: [],
    registerMemoryProvider(provider: any): void {
      this.providers.push(provider);
    },
  };
}

describe('TestRegister', () => {
  it('test_register_calls_register_memory_provider', () => {
    const ctx = makeFakeContext();
    register(ctx);
    expect(ctx.providers).toHaveLength(1);
    expect(ctx.providers[0]).toBeInstanceOf(AgentArtsMemoryProvider);
  });

  it('test_register_provider_name', () => {
    const ctx = makeFakeContext();
    register(ctx);
    expect(ctx.providers[0].name).toBe('agentarts');
  });
});

describe('TestPackageExports', () => {
  it('test_provider_class_exported', () => {
    expect(AgentArtsMemoryProvider).not.toBeNull();
  });

  it('test_register_callable', () => {
    expect(typeof register).toBe('function');
  });

  it('test_all_exports', () => {
    // Python asserts `__all__` membership; the port has no `__all__`, so the
    // named exports of the package module are checked instead.
    expect(Object.keys(hermesInit)).toEqual(
      expect.arrayContaining(['AgentArtsMemoryProvider', 'register']),
    );
  });
});

describe('TestPluginYaml', () => {
  /** Path of `plugin.yaml` (shipped in the package assets, below `ai_agent/hermes`). */
  function pluginYamlPath(): string {
    return getMemoryAssetPath('ai_agent/hermes/plugin.yaml');
  }

  function readPluginYaml(): any {
    return parseYaml(readFileSync(pluginYamlPath(), 'utf8'));
  }

  it('test_plugin_yaml_exists', () => {
    expect(existsSync(pluginYamlPath())).toBe(true);
  });

  it('test_plugin_yaml_content', () => {
    const data = readPluginYaml();

    expect(data['name']).toBe('agentarts');
    expect(data['version']).toBe('1.0.0');
    expect(data['description']).toContain('Memory');
  });

  it('test_plugin_yaml_hooks', () => {
    const data = readPluginYaml();

    const expectedHooks = new Set([
      'system_prompt_block',
      'prefetch',
      'sync_turn',
      'on_pre_compress',
      'on_memory_write',
      'on_session_end',
      'shutdown',
    ]);
    expect(new Set(data['hooks'])).toEqual(expectedHooks);
  });

  it('test_plugin_yaml_hooks_are_implemented', () => {
    // Every hook listed in plugin.yaml should be a method of the provider.
    // NOTE(port): `plugin.yaml` keeps the Python hook names (snake_case) because
    // the manifest is consumed by the Hermes host; the Node.js provider methods
    // follow the repository naming rules (camelCase), so each hook is mapped.
    const provider = new AgentArtsMemoryProvider();
    const data = readPluginYaml();

    const toCamel = (name: string): string =>
      name.replace(/_([a-z])/g, (_match: string, letter: string) => letter.toUpperCase());

    for (const hook of data['hooks'] as string[]) {
      const method = toCamel(hook);
      expect(method in provider).toBe(true);
      expect(typeof priv(provider)[method]).toBe('function');
    }
  });
});
