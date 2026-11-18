/**
 * Unit tests for `AgentArtsMemoryStore`.
 *
 * Ported 1:1 from `tests/unit/sdk/integration/test_langgraph_store.py`.
 *
 * Porting notes:
 * - Python patches the module-level `MemoryClient` / `AsyncMemoryClient` classes;
 *   the TypeScript port injects the fakes into the private `_client` /
 *   `_asyncClient` fields (same pattern as the Python saver tests, which assign
 *   `saver._client = fake`). No HTTP request is ever issued.
 * - The per-operation handlers (`_handlePut`, `_handleGet`, `_handleSearch`,
 *   `_handleListNamespaces`, `_asyncHandlePut`, ...) are `protected async` in
 *   TypeScript, so the tests reach them through `(store as any)`.
 * - LangGraph JS operations are plain objects (`PutOperation`, `GetOperation`,
 *   `SearchOperation`) -- there are no `PutOp`/`GetOp`/`SearchOp` classes -- and
 *   `Item`/`SearchItem` are interfaces, so results are plain objects whose
 *   `createdAt`/`updatedAt` are `Date` values.
 * - Python's `datetime` assertions become `Date` assertions; only `getUTC*`
 *   accessors are used so the host time zone cannot affect the result.
 * - Python guards the module with `pytest.importorskip("langgraph")`. The
 *   TypeScript port imports the store statically, and `@langchain/langgraph` is a
 *   declared devDependency of this monorepo (always installed for the test run),
 *   so no runtime skip is needed.
 */

import { describe, it, expect, vi } from 'vitest';

import type { Operation } from '@langchain/langgraph';

import { AgentArtsMemoryStore } from 'agentarts-sdk/sdk/integration/langgraph';
import { AgentArtsMemoryStore as AgentArtsMemoryStoreFromBarrel } from 'agentarts-sdk/sdk/integration/langgraph';
import { TextMessage } from 'agentarts-sdk/sdk/memory';

/**
 * Minimal stand-in for `MemoryClient` / `AsyncMemoryClient`.
 *
 * Python uses `MagicMock()`; here every method is a `vi.fn()` with a benign
 * default so a test only has to stub what it exercises.
 */
function createMockClient(): any {
  return {
    addMessages: vi.fn(async () => ({ items: [] })),
    deleteMemory: vi.fn(async () => undefined),
    getMemory: vi.fn(async () => null),
    searchMemories: vi.fn(async () => ({ results: [] })),
    listMemories: vi.fn(async () => ({ items: [] })),
    getLastKMessages: vi.fn(async () => []),
    createMemorySession: vi.fn(async () => ({})),
    listMessages: vi.fn(async () => ({ items: [] })),
    deleteSession: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
  };
}

/** Create a store with both clients replaced by mocks. */
function newStore(spaceId = 'test-space'): {
  store: AgentArtsMemoryStore;
  client: any;
  asyncClient: any;
} {
  const store = new AgentArtsMemoryStore({ spaceId });
  const client = createMockClient();
  const asyncClient = createMockClient();
  (store as any)._client = client;
  (store as any)._asyncClient = asyncClient;
  return { store, client, asyncClient };
}

/**
 * Backend memory record (Python `MagicMock` with attributes assigned).
 *
 * Raw backend payloads use snake_case keys, which `_getRecordAttr` understands.
 */
function memoryInfo(overrides: Record<string, any> = {}): Record<string, any> {
  return {
    id: 'memory-123',
    content: 'User prefers dark mode',
    actor_id: 'user-001',
    assistant_id: null,
    session_id: 'session-xyz',
    strategy_type: 'semantic',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    meta: null,
    ...overrides,
  };
}

// ============================================================
// Basic shape
// ============================================================

describe('TestAgentArtsMemoryStoreBasic', () => {
  it('test_import_store', () => {
    expect(AgentArtsMemoryStore).toBeTruthy();
  });

  it('test_store_methods_exist', () => {
    const proto = AgentArtsMemoryStore.prototype as any;
    expect(typeof proto.batch).toBe('function');
    expect(typeof proto.abatch).toBe('function');
    expect(typeof proto.close).toBe('function');
  });

  it('test_store_properties', () => {
    // Python `hasattr(cls, "space_id" / "region" / "supports_ttl")`; the
    // TypeScript port exposes them as getters (`supportsTtl` is also static).
    const prototype = AgentArtsMemoryStore.prototype;
    for (const name of ['spaceId', 'region', 'supportsTtl']) {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
      expect(typeof descriptor?.get).toBe('function');
    }
    expect(AgentArtsMemoryStore.supportsTtl).toBe(false);
  });

  it('test_store_init_requires_space_id', () => {
    const { store } = newStore();
    expect(store.spaceId).toBe('test-space');
  });
});

// ============================================================
// PutOp / PutOperation handling
// ============================================================

describe('TestAgentArtsMemoryStorePut', () => {
  it('test_put_requires_session_id', async () => {
    const { store } = newStore();

    const op = { namespace: ['memories'], key: 'msg-1', value: { content: 'test' } };

    await expect((store as any)._handlePut(op)).rejects.toThrow(/session_id/);
  });

  it('test_put_serializes_value_when_no_content', async () => {
    const { store, client } = newStore();

    const op = {
      namespace: ['memories'],
      key: 'msg-1',
      value: { session_id: 'session-123', preference: 'dark mode' },
    };

    await (store as any)._handlePut(op);

    expect(client.addMessages).toHaveBeenCalledTimes(1);
    const messages = client.addMessages.mock.calls[0]![2];
    expect(messages[0]).toBeInstanceOf(TextMessage);
    const parsed = JSON.parse(messages[0].content);
    expect(parsed['preference']).toBe('dark mode');
    expect('session_id' in parsed).toBe(false);
  });

  it('test_put_calls_add_messages', async () => {
    const { store, client } = newStore();

    const op = {
      namespace: ['memories', 'user-001'],
      key: 'msg-1',
      value: {
        content: 'I prefer dark mode',
        actor_id: 'user-001',
        session_id: 'session-123',
      },
    };

    await (store as any)._handlePut(op);

    expect(client.addMessages).toHaveBeenCalledTimes(1);
    const callArgs = client.addMessages.mock.calls[0]!;

    expect(callArgs[0]).toBe('test-space');
    expect(callArgs[1]).toBe('session-123');
    const messages = callArgs[2];
    expect(messages).toHaveLength(1);
    // message must be a TextMessage instance, not a raw dict
    expect(messages[0]).toBeInstanceOf(TextMessage);
    // Verify toDict() outputs actor_id (was missing before the Python fix)
    const msgDict = messages[0].toDict();
    expect(msgDict['role']).toBe('user');
    expect(msgDict['actor_id']).toBe('user-001');
    expect('parts' in msgDict).toBe(true);
    // Verify meta contains store_key and store_namespace
    expect(msgDict['meta']).toBeTruthy();
    const meta = JSON.parse(msgDict['meta'] as string);
    expect(meta['store_key']).toBe('msg-1');
    expect(meta['store_namespace']).toEqual(['memories', 'user-001']);
  });

  it('test_put_delete_calls_delete_memory', async () => {
    const { store, client } = newStore();

    const op = { namespace: ['memories'], key: 'memory-123', value: null };

    await (store as any)._handlePut(op);

    expect(client.deleteMemory).toHaveBeenCalledTimes(1);
    expect(client.deleteMemory.mock.calls[0]).toEqual(['test-space', 'memory-123']);
    expect(client.addMessages).not.toHaveBeenCalled();
  });

  it('test_put_delete_handles_not_found', async () => {
    const { store, client } = newStore();
    client.deleteMemory.mockRejectedValue(new Error('404 not found'));

    const op = { namespace: ['memories'], key: 'nonexistent', value: null };

    // Should not raise, should return undefined
    const result = await (store as any)._handlePut(op);
    expect(result).toBeUndefined();
  });

  it('test_put_swallows_exception', async () => {
    const { store, client } = newStore();
    client.addMessages.mockRejectedValue(new Error('network error'));

    const op = {
      namespace: ['memories'],
      key: 'msg-1',
      value: { content: 'test', session_id: 's1' },
    };

    // Should not raise, should return undefined
    const result = await (store as any)._handlePut(op);
    expect(result).toBeUndefined();
  });
});

// ============================================================
// SearchOp / SearchOperation handling
// ============================================================

describe('TestAgentArtsMemoryStoreSearch', () => {
  it('test_search_with_query_calls_search_memories', async () => {
    const { store, client } = newStore();
    client.searchMemories.mockResolvedValue({
      results: [{ record: memoryInfo(), score: 0.95 }],
    });

    const results = await (store as any)._handleSearch({
      namespacePrefix: ['memories'],
      query: 'user preferences',
      filter: { actor_id: 'user-001' },
      limit: 5,
    });

    expect(client.searchMemories).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(1);
    expect(results[0].key).toBe('memory-123');
    expect(results[0].score).toBe(0.95);
    expect(results[0].value['content']).toContain('dark mode');
  });

  it('test_search_with_filter_params', async () => {
    const { store, client } = newStore();
    client.searchMemories.mockResolvedValue({ results: [] });

    await (store as any)._handleSearch({
      namespacePrefix: ['memories'],
      query: 'test',
      filter: {
        actor_id: 'user-001',
        assistant_id: 'agent-abc',
        session_id: 'session-xyz',
      },
      limit: 10,
    });

    const filters = client.searchMemories.mock.calls[0]![1];

    expect(filters.actorId).toBe('user-001');
    expect(filters.assistantId).toBe('agent-abc');
    expect(filters.sessionId).toBe('session-xyz');
  });

  it('test_search_without_query_calls_list_memories', async () => {
    const { store, client } = newStore();
    client.listMemories.mockResolvedValue({
      items: [memoryInfo({ content: 'test content' })],
    });

    const results = await (store as any)._handleSearch({
      namespacePrefix: ['memories'],
      filter: { actor_id: 'user-001' },
      limit: 10,
    });

    expect(client.listMemories).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(1);
    expect(results[0].score).toBeNull();
  });

  it('test_search_without_query_memory_type_filter', async () => {
    const { store, client } = newStore();

    const makeMemory = (memoryId: string, memoryType: string): Record<string, any> =>
      memoryInfo({ id: memoryId, content: 'content', memory_type: memoryType });

    client.listMemories.mockResolvedValue({
      items: [makeMemory('mem-memory', 'memory'), makeMemory('mem-episode', 'episode')],
    });

    const results = await (store as any)._handleSearch({
      namespacePrefix: ['memories'],
      filter: { memory_type: 'memory' },
      limit: 10,
    });

    expect(results).toHaveLength(1);
    expect(results[0].key).toBe('mem-memory');
    expect(results[0].value['memory_type']).toBe('memory');
  });

  it('test_search_without_query_no_memory_type_filter', async () => {
    const { store, client } = newStore();

    const makeMemory = (memoryId: string, memoryType: string): Record<string, any> =>
      memoryInfo({ id: memoryId, content: 'content', memory_type: memoryType });

    client.listMemories.mockResolvedValue({
      items: [makeMemory('mem-memory', 'memory'), makeMemory('mem-episode', 'episode')],
    });

    const results = await (store as any)._handleSearch({
      namespacePrefix: ['memories'],
      filter: null,
      limit: 10,
    });

    expect(results).toHaveLength(2);
    const memoryTypes = new Set(results.map((item: any) => item.value['memory_type']));
    expect(memoryTypes).toEqual(new Set(['memory', 'episode']));
  });
});

// ============================================================
// GetOp / GetOperation handling
// ============================================================

describe('TestAgentArtsMemoryStoreGet', () => {
  it('test_get_returns_item_when_found', async () => {
    const { store, client } = newStore();
    client.getMemory.mockResolvedValue(memoryInfo({ content: 'test content' }));

    const result = await (store as any)._handleGet({
      namespace: ['memories'],
      key: 'memory-123',
    });

    expect(result).not.toBeNull();
    expect(result.key).toBe('memory-123');
    expect(result.value['content']).toBe('test content');
  });

  it('test_get_returns_none_when_not_found', async () => {
    const { store, client } = newStore();
    client.getMemory.mockRejectedValue(new Error('not found'));

    const result = await (store as any)._handleGet({
      namespace: ['memories'],
      key: 'nonexistent',
    });

    expect(result).toBeNull();
  });
});

// ============================================================
// batch / abatch
// ============================================================

describe('TestAgentArtsMemoryStoreBatch', () => {
  it('test_batch_processes_multiple_ops', async () => {
    const { store, client } = newStore();
    client.searchMemories.mockResolvedValue({ results: [] });
    client.addMessages.mockResolvedValue({});
    client.getMemory.mockRejectedValue(new Error('404 not found'));

    const ops: Operation[] = [
      { namespace: ['memories'], key: 'msg-1', value: { content: 'test', session_id: 's1' } },
      { namespacePrefix: ['memories'], query: 'test' },
      { namespace: ['memories'], key: 'nonexistent' },
    ];

    const results = (await store.batch(ops)) as any[];

    expect(results).toHaveLength(3);
    expect(results[0]).toBeUndefined();
    expect(results[1]).toEqual([]);
    expect(results[2]).toBeNull();
  });
});

// ============================================================
// Async operations (AsyncMemoryClient)
// ============================================================

describe('TestAgentArtsMemoryStoreAsync', () => {
  it('test_async_put_calls_async_client', async () => {
    const { store, asyncClient } = newStore();

    const op = {
      namespace: ['memories'],
      key: 'msg-1',
      value: { content: 'test', session_id: 's1' },
    };

    await (store as any)._asyncHandlePut(op);

    expect(asyncClient.addMessages).toHaveBeenCalledTimes(1);
  });

  it('test_async_search_calls_async_client', async () => {
    const { store, asyncClient } = newStore();
    asyncClient.searchMemories.mockResolvedValue({ results: [] });

    const results = await (store as any)._asyncHandleSearch({
      namespacePrefix: ['memories'],
      query: 'test',
    });

    expect(results).toEqual([]);
  });

  it('test_abatch_processes_multiple_ops', async () => {
    const { store, asyncClient } = newStore();
    asyncClient.searchMemories.mockResolvedValue({ results: [] });
    asyncClient.addMessages.mockResolvedValue({});
    asyncClient.getMemory.mockRejectedValue(new Error('not found'));

    const ops: Operation[] = [
      { namespace: ['memories'], key: 'msg-1', value: { content: 'test', session_id: 's1' } },
      { namespacePrefix: ['memories'], query: 'test' },
      { namespace: ['memories'], key: 'nonexistent' },
    ];

    const results = (await store.abatch(ops)) as any[];

    expect(results).toHaveLength(3);
  });
});

// ============================================================
// Namespace + filter design (方案 D)
// ============================================================

describe('TestAgentArtsMemoryStoreNamespaceFilter', () => {
  it('test_namespace_is_hierarchy_path', () => {
    const { store } = newStore();
    expect((store as any)._spaceId).toBe('test-space');
  });

  it('test_filter_contains_actor_session', async () => {
    const { store, client } = newStore();
    client.searchMemories.mockResolvedValue({ results: [] });

    await (store as any)._handleSearch({
      namespacePrefix: ['memories'],
      query: 'test',
      filter: { actor_id: 'user-001', session_id: 'session-xyz' },
    });

    const filters = client.searchMemories.mock.calls[0]![1];

    expect(filters.actorId).toBe('user-001');
    expect(filters.sessionId).toBe('session-xyz');
  });

  it('test_only_session_id_in_filter', async () => {
    const { store, client } = newStore();
    client.searchMemories.mockResolvedValue({ results: [] });

    await (store as any)._handleSearch({
      namespacePrefix: ['memories'],
      query: 'test',
      filter: { session_id: 'session-xyz' },
    });

    const filters = client.searchMemories.mock.calls[0]![1];

    expect(filters.sessionId).toBe('session-xyz');
    // Python asserts `is None`; the TypeScript filter leaves the field unset.
    expect(filters.actorId ?? null).toBeNull();
    expect(filters.assistantId ?? null).toBeNull();
  });
});

// ============================================================
// LangGraph agent simulation (cross-thread memory)
// ============================================================

describe('TestLangGraphAgentSimulation', () => {
  it('test_store_put_search_flow', async () => {
    const { store, client } = newStore('space-001');
    client.addMessages.mockResolvedValue({});
    client.searchMemories.mockResolvedValue({
      results: [
        {
          record: memoryInfo({
            id: 'mem-001',
            content: 'User prefers dark mode theme',
            session_id: 'session-abc',
          }),
          score: 0.92,
        },
      ],
    });

    await store.put(['memories'], 'user-pref-1', {
      content: 'User prefers dark mode theme',
      actor_id: 'user-001',
      session_id: 'session-abc',
    });

    const results = await store.search(['memories'], {
      query: 'theme preferences',
      filter: { actor_id: 'user-001' },
      limit: 5,
    });

    expect(results).toHaveLength(1);
    expect(results[0]!.score).toBe(0.92);
    expect(results[0]!.value['content']).toContain('dark mode');
  });

  it('test_cross_thread_memory_access', async () => {
    const { store, client } = newStore('space-001');
    client.searchMemories.mockResolvedValue({
      results: [
        {
          record: memoryInfo({
            id: 'mem-001',
            content: 'User likes Python programming',
            session_id: 'session-old',
          }),
          score: 0.88,
        },
      ],
    });

    const results = await store.search(['memories'], {
      query: 'programming interests',
      filter: { actor_id: 'user-001' },
    });

    expect(results).toHaveLength(1);
    expect(results[0]!.value['session_id']).toBe('session-old');
  });

  it('test_store_module_export', () => {
    expect(AgentArtsMemoryStoreFromBarrel).toBeTruthy();
  });

  it('test_store_with_context_manager', async () => {
    const { store, client } = newStore();

    // Python: `with AgentArtsMemoryStore(...) as store:` calls `__exit__`, which
    // closes the client. Node.js has no context-manager protocol here, so
    // `try { ... } finally { await store.close(); }` is the documented idiom.
    try {
      expect(store.spaceId).toBe('test-space');
    } finally {
      await store.close();
    }

    expect(client.close).toHaveBeenCalledTimes(1);
  });
});

// ============================================================
// Datetime parsing utilities
// ============================================================

describe('TestDatetimeParsing', () => {
  it('test_parse_datetime_from_string', () => {
    const { store } = newStore();

    const result = (store as any)._parseDatetime('2024-01-01T00:00:00Z') as Date;
    expect(result.getUTCFullYear()).toBe(2024);
    expect(result.getUTCMonth() + 1).toBe(1);
  });

  it('test_parse_datetime_from_datetime', () => {
    const { store } = newStore();

    const dt = new Date();
    const result = (store as any)._parseDatetime(dt);
    expect(result).toBe(dt);
  });

  it('test_parse_datetime_none_returns_epoch', () => {
    const { store } = newStore();

    const result = (store as any)._parseDatetime(null) as Date;
    expect(result.getTime()).toBe(0);
    expect(result.toISOString()).toBe('1970-01-01T00:00:00.000Z');
  });

  it('test_parse_datetime_invalid_string_returns_epoch', () => {
    const { store } = newStore();

    const result = (store as any)._parseDatetime('not-a-date') as Date;
    expect(result.getTime()).toBe(0);
    expect(result.toISOString()).toBe('1970-01-01T00:00:00.000Z');
  });
});

// ============================================================
// Wildcard support in match conditions
// ============================================================

describe('TestWildcardMatching', () => {
  it('test_match_path_with_wildcards_exact_match', () => {
    const { store } = newStore();
    const match = (namespace: string[], path: string[]): boolean =>
      (store as any)._matchPathWithWildcards(namespace, path);

    expect(match(['memories', 'user-001'], ['memories', 'user-001'])).toBe(true);
    expect(match(['memories', 'user-001'], ['memories', 'user-002'])).toBe(false);
  });

  it('test_match_path_with_wildcards_single_wildcard', () => {
    const { store } = newStore();
    const match = (namespace: string[], path: string[]): boolean =>
      (store as any)._matchPathWithWildcards(namespace, path);

    expect(match(['memories', 'user-001'], ['memories', '*'])).toBe(true);
    expect(match(['other', 'user-001'], ['memories', '*'])).toBe(false);
  });

  it('test_match_path_with_wildcards_length_mismatch', () => {
    const { store } = newStore();
    const match = (namespace: string[], path: string[]): boolean =>
      (store as any)._matchPathWithWildcards(namespace, path);

    expect(match(['memories'], ['memories', '*'])).toBe(false);
    expect(match(['memories', 'user-001'], ['memories'])).toBe(false);
  });

  it('test_matches_condition_prefix_with_wildcard', () => {
    const { store } = newStore();

    const condition = { matchType: 'prefix', path: ['memories', '*'] };
    const matches = (namespace: string[]): boolean =>
      (store as any)._matchesCondition(namespace, condition);

    expect(matches(['memories', 'user-001'])).toBe(true);
    expect(matches(['memories', 'user-001', 'deep'])).toBe(true);
    expect(matches(['other', 'user-001'])).toBe(false);
  });

  it('test_matches_condition_suffix_with_wildcard', () => {
    const { store } = newStore();

    const condition = { matchType: 'suffix', path: ['*'] };
    const matches = (namespace: string[]): boolean =>
      (store as any)._matchesCondition(namespace, condition);

    expect(matches(['memories', 'user-001'])).toBe(true);
    expect(matches(['single'])).toBe(true);
  });
});
