/**
 * Unit tests for AsyncMemoryClient.
 *
 * Ported 1:1 from `tests/unit/sdk/memory/test_async_memory_client.py`.
 *
 * Porting notes:
 * - `AsyncMock()` on a data plane method -> `vi.spyOn(client.asyncDataPlane, ...)`
 *   or a plain mock data plane assigned to the session (`vi.fn()`).
 * - Python's `async with AsyncMemorySession(...)` has no Node.js equivalent (no
 *   `Symbol.asyncDispose`); the documented idiom is `try { ... } finally { await
 *   session.close(); }`, which is what the context-manager tests exercise.
 * - Every call is awaited because the Node.js port has no sync API (PORTING.md §4).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  AsyncMemoryClient,
  AsyncMemorySession,
  MemoryInfo,
  MemorySearchFilter,
  MemorySearchResponse,
  MessageBatchResponse,
  MessageInfo,
  MessageListResponse,
  SessionCreateRequest,
  SessionInfo,
  TextMessage,
} from 'agentarts-sdk/sdk/memory';
import { _AsyncDataPlane } from 'agentarts-sdk/sdk/memory/inner/dataplane-async';

/** Create an async client exactly like the Python tests do. */
function newAsyncClient(): AsyncMemoryClient {
  return new AsyncMemoryClient({ apiKey: 'test-key' });
}

/**
 * Minimal stand-in for `_AsyncDataPlane` (Python: `MagicMock()` with `AsyncMock`
 * members), so sessions never reach the network.
 */
function newMockDataPlane(): any {
  return {
    createMemorySession: vi.fn(
      async () => new SessionInfo({ id: 'session-123', spaceId: 'space-123', actorId: 'user-1' }),
    ),
    addMessages: vi.fn(async () => new MessageBatchResponse({ items: [] })),
    getMessage: vi.fn(async () => new MessageInfo({ id: 'msg-1', sessionId: 'session-456', seq: 1 })),
    close: vi.fn(async () => undefined),
  };
}

beforeEach(() => {
  // Unit tests must never reach the cloud.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new Error('unexpected network call in unit test');
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ============================================================
// AsyncMemoryClient lifecycle
// ============================================================

describe('TestAsyncMemoryClient', () => {
  it('test_init_with_api_key', () => {
    const client = newAsyncClient();
    expect(client.asyncDataPlane).toBeTruthy();
    expect(client.controlPlane).toBeNull();
  });

  it('test_init_with_region', () => {
    const client = new AsyncMemoryClient({ regionName: 'cn-north-4', apiKey: 'test-key' });
    expect(client.regionName).toBe('cn-north-4');
  });

  it('test_close_async', async () => {
    const client = newAsyncClient();

    const mockClose = vi.spyOn(client.asyncDataPlane, 'close').mockResolvedValue(undefined);

    await client.close();

    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it('test_context_manager', async () => {
    const mockClose = vi.fn(async () => undefined);
    const client = newAsyncClient();

    // Python: `async with AsyncMemoryClient(...) as client:` -> close() on exit.
    try {
      vi.spyOn(client.asyncDataPlane, 'close').mockImplementation(mockClose);
    } finally {
      await client.close();
    }

    expect(mockClose).toHaveBeenCalledTimes(1);
  });
});

// ============================================================
// AsyncMemoryClient data plane methods
// ============================================================

describe('TestAsyncMemoryClientDataPlane', () => {
  it('test_add_messages_success', async () => {
    const client = newAsyncClient();

    const mockResult = {
      messages: [
        { id: 'msg-1', session_id: 'session-456', seq: 1, role: 'user', parts: [{ text: 'hello' }] },
      ],
    };
    const mockAdd = vi
      .spyOn(client.asyncDataPlane, 'addMessages')
      .mockResolvedValue(MessageBatchResponse.fromDict(mockResult));

    const result = await client.addMessages('space-123', 'session-456', [
      new TextMessage({ role: 'user', content: 'hello' }),
    ]);

    expect(result.items.length).toBe(1);
    expect(mockAdd).toHaveBeenCalledTimes(1);
  });

  it('test_add_messages_with_options', async () => {
    const client = newAsyncClient();

    const mockResult = { messages: [] };
    const mockAdd = vi
      .spyOn(client.asyncDataPlane, 'addMessages')
      .mockResolvedValue(MessageBatchResponse.fromDict(mockResult));

    await client.addMessages('space-123', 'session-456', [
      new TextMessage({ role: 'user', content: 'test' }),
    ], {
      timestamp: 123456789,
      idempotencyKey: 'key-123',
      isForceExtract: true,
    });

    // Python keyword arguments map to the positional data plane parameters.
    const callArgs = mockAdd.mock.calls[0];
    expect(callArgs[3]).toBe(123456789);
    expect(callArgs[4]).toBe('key-123');
    expect(callArgs[5]).toBe(true);
  });

  it('test_search_memories_success', async () => {
    const client = newAsyncClient();

    const mockResult = {
      records: [
        {
          id: 'mem-1',
          space_id: 'space-123',
          strategy_id: 'str-1',
          content: 'test',
          score: 0.9,
        },
      ],
      total: 1,
    };
    const mockSearch = vi
      .spyOn(client.asyncDataPlane, 'searchMemories')
      .mockResolvedValue(MemorySearchResponse.fromDict(mockResult));

    const filters = new MemorySearchFilter({ query: 'test query', topK: 5 });
    const result = await client.searchMemories('space-123', filters);

    expect(result.total).toBe(1);
    expect(mockSearch).toHaveBeenCalledTimes(1);
  });

  it('test_get_last_k_messages_success', async () => {
    const client = newAsyncClient();

    const mockMessages = [
      new MessageInfo({
        id: 'msg-1',
        sessionId: 'session-456',
        seq: 1,
        role: 'user',
        parts: [{ text: 'hello' }],
      }),
      new MessageInfo({
        id: 'msg-2',
        sessionId: 'session-456',
        seq: 2,
        role: 'assistant',
        parts: [{ text: 'response' }],
      }),
    ];
    const mockGet = vi
      .spyOn(client.asyncDataPlane, 'getLastKMessages')
      .mockResolvedValue(mockMessages);

    const result = await client.getLastKMessages('session-456', 10, 'space-123');

    expect(result.length).toBe(2);
    expect(mockGet).toHaveBeenCalledWith('session-456', 10, 'space-123');
  });

  it('test_list_messages_success', async () => {
    const client = newAsyncClient();

    const mockResult = {
      items: [{ id: 'msg-1', session_id: 'session-456', seq: 1, role: 'user', parts: [] }],
      total: 1,
    };
    const mockList = vi
      .spyOn(client.asyncDataPlane, 'listMessages')
      .mockResolvedValue(MessageListResponse.fromDict(mockResult));

    const result = await client.listMessages('space-123', 'session-456', 10, 0);

    expect(result.total).toBe(1);
    expect(mockList).toHaveBeenCalledTimes(1);
  });

  it('test_get_memory_success', async () => {
    const client = newAsyncClient();

    const mockResult = {
      id: 'mem-1',
      space_id: 'space-123',
      strategy_id: 'str-1',
      content: 'test memory',
    };
    const mockGet = vi
      .spyOn(client.asyncDataPlane, 'getMemory')
      .mockResolvedValue(MemoryInfo.fromDict(mockResult));

    const result = await client.getMemory('space-123', 'mem-1');

    expect(result.id).toBe('mem-1');
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('test_delete_memory_success', async () => {
    const client = newAsyncClient();

    const mockDelete = vi.spyOn(client.asyncDataPlane, 'deleteMemory').mockResolvedValue(undefined);

    await client.deleteMemory('space-123', 'mem-1');

    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it('test_create_memory_session_success', async () => {
    const client = newAsyncClient();

    const mockResult = { id: 'session-123', space_id: 'space-123', actor_id: 'user-1' };
    const mockCreate = vi
      .spyOn(client.asyncDataPlane, 'createMemorySession')
      .mockResolvedValue(SessionInfo.fromDict(mockResult));

    // Python: `create_memory_session(space_id=..., actor_id=...)`, i.e. the
    // second positional parameter (the session id) keeps its default.
    const result = await client.createMemorySession('space-123', undefined, 'user-1');

    expect(result.id).toBe('session-123');
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});

// ============================================================
// Unsupported message types
// ============================================================

describe('TestAsyncMemoryClientUnsupportedMessage', () => {
  it('test_add_messages_unsupported_type_raises_error', async () => {
    const client = newAsyncClient();

    await expect(
      client.addMessages('space-123', 'session-456', [
        { invalid: 'message' },
      ] as unknown as TextMessage[]),
    ).rejects.toThrow(/Unsupported message type/);
  });
});

// ============================================================
// AsyncMemorySession
// ============================================================

describe('TestAsyncMemorySession', () => {
  it('test_session_with_existing_session_id', async () => {
    const mockDataPlane = newMockDataPlane();

    const session = new AsyncMemorySession({
      spaceId: 'space-123',
      actorId: 'user-1',
      sessionId: 'session-456',
      apiKey: 'test-key',
    });
    (session as unknown as { _dataPlane: unknown })._dataPlane = mockDataPlane;

    await session.ensureInitialized();

    expect(session.sessionId).toBe('session-456');
    expect((session as unknown as { _initialized: boolean })._initialized).toBe(true);
    expect(mockDataPlane.createMemorySession).not.toHaveBeenCalled();
  });

  it('test_session_auto_create', async () => {
    const mockDataPlane = newMockDataPlane();
    mockDataPlane.createMemorySession.mockImplementation(
      async () => new SessionInfo({ id: 'new-session-123', spaceId: 'space-123', actorId: 'user-1' }),
    );

    const session = new AsyncMemorySession({
      spaceId: 'space-123',
      actorId: 'user-1',
      apiKey: 'test-key',
    });
    (session as unknown as { _dataPlane: unknown })._dataPlane = mockDataPlane;

    await session.ensureInitialized();

    expect(session.sessionId).toBe('new-session-123');
    expect(mockDataPlane.createMemorySession).toHaveBeenCalledTimes(1);
    // Regression: the session layer must pass a SessionCreateRequest object, not
    // a pre-converted dict (the data plane calls toDict() internally).
    const callArgs = mockDataPlane.createMemorySession.mock.calls[0];
    expect(callArgs[0]).toBe('space-123');
    expect(callArgs[1]).toBeInstanceOf(SessionCreateRequest);
    expect(callArgs[1].actorId).toBe('user-1');
  });

  it('test_session_add_messages', async () => {
    const mockDataPlane = newMockDataPlane();

    const session = new AsyncMemorySession({
      spaceId: 'space-123',
      actorId: 'user-1',
      apiKey: 'test-key',
    });
    (session as unknown as { _dataPlane: unknown })._dataPlane = mockDataPlane;

    await session.addMessages([new TextMessage({ role: 'user', content: 'hello' })]);

    expect(mockDataPlane.addMessages).toHaveBeenCalledTimes(1);
  });

  it('test_session_context_manager', async () => {
    const mockDataPlane = newMockDataPlane();

    const session = new AsyncMemorySession({
      spaceId: 'space-123',
      actorId: 'user-1',
      sessionId: 'session-456',
      apiKey: 'test-key',
    });

    // Python: `async with AsyncMemorySession(...) as session:` -> close() on exit.
    try {
      (session as unknown as { _dataPlane: unknown })._dataPlane = mockDataPlane;
    } finally {
      await session.close();
    }

    expect(mockDataPlane.close).toHaveBeenCalledTimes(1);
  });

  it('test_session_factory_method', async () => {
    const session = await AsyncMemorySession.of({
      spaceId: 'space-123',
      actorId: 'user-1',
      sessionId: 'session-456',
      apiKey: 'test-key',
    });

    expect(session.spaceId).toBe('space-123');
    expect(session.actorId).toBe('user-1');
  });

  it('test_session_get_message_arg_order', async () => {
    // Regression: getMessage must forward args as (messageId, spaceId,
    // sessionId) to match the data plane signature, not
    // (spaceId, sessionId, messageId).
    const mockDataPlane = newMockDataPlane();

    const session = new AsyncMemorySession({
      spaceId: 'space-123',
      actorId: 'user-1',
      sessionId: 'session-456',
      apiKey: 'test-key',
    });
    (session as unknown as { _dataPlane: unknown })._dataPlane = mockDataPlane;

    await session.getMessage('msg-1');

    expect(mockDataPlane.getMessage).toHaveBeenCalledTimes(1);
    expect(mockDataPlane.getMessage).toHaveBeenCalledWith('msg-1', 'space-123', 'session-456');
  });
});

// ============================================================
// _AsyncDataPlane validation
// ============================================================

describe('TestAsyncDataPlaneValidation', () => {
  it('test_add_messages_empty_space_id_raises_error', async () => {
    const dataPlane = new _AsyncDataPlane({ apiKey: 'test-key' });

    await expect(
      dataPlane.addMessages('', 'session-456', [{ role: 'user' }]),
    ).rejects.toThrow(/space_id is required/);
  });

  it('test_get_last_k_messages_empty_space_id_raises_error', async () => {
    const dataPlane = new _AsyncDataPlane({ apiKey: 'test-key' });

    await expect(
      dataPlane.getLastKMessages('session-456', 10, ''),
    ).rejects.toThrow(/space_id is required/);
  });
});
