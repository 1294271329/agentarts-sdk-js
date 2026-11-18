/**
 * Unit tests for `AgentArtsMemorySessionSaver` behavior.
 *
 * Ported 1:1 from `tests/unit/sdk/integration/test_saver_writes_delete_list.py`
 * (which itself was migrated from `my_simple_demo/test_saver_writes_delete_list.py`).
 * Covers:
 * - putWrites / aputWrites (storage, 404 auto-create retry, dedup)
 * - getTuple / agetTuple and list / alist (pending_writes extraction)
 * - deleteThread / adeleteThread (order, swallow contract, cleanup)
 * - close behavior (sync `close()` only closes the `MemoryClient`; `aclose()`
 *   closes both clients -- the Node.js equivalent of the Python context managers)
 *
 * Uses in-memory fake clients (no real API calls).
 *
 * Porting notes:
 * - The Python suite has two near-identical fakes (`FakeMemoryClient` and
 *   `FakeAsyncMemoryClient`) because Python has sync and async client families.
 *   Every Node.js client method is a `Promise` (PORTING.md §4), so both fakes
 *   share the single `FakeMemoryClient` implementation below.
 * - `saver._client` / `saver._async_client` are injected directly (they are
 *   ordinary private fields), exactly like the Python test does.
 * - `list()` is an `AsyncGenerator` in LangGraph JS, so the pending-writes test
 *   collects it with `for await`; `alist()` still returns an array.
 * - `serializeWrite()` awaits `serde.dumpsTyped()` (Promise based in JS).
 * - Python guards the module with `pytest.importorskip("langgraph")`; the port
 *   imports statically and `@langchain/langgraph` is a declared devDependency of
 *   this monorepo, so no runtime skip is needed.
 */

import { describe, it, expect } from 'vitest';

import type { RunnableConfig } from '@langchain/core/runnables';
import type { CheckpointTuple } from '@langchain/langgraph';

import {
  AgentArtsMemorySessionSaver,
  type PendingWrite,
} from 'agentarts-sdk/sdk/integration/langgraph';
import { APIException } from 'agentarts-sdk/sdk/service/http-client';

/** Mock message for testing (`parts` is what `memoryToLanggraphMessage` expects). */
class FakeMessage {
  role: string;
  content: string;
  meta: any;
  parts: Array<Record<string, any>>;

  constructor(role: string, content = '', meta: any = null) {
    this.role = role;
    this.content = content;
    this.meta = meta;
    this.parts = [{ type: 'text', text: content }];
  }
}

/** In-memory mock of `MemoryClient` / `AsyncMemoryClient` for testing. */
class FakeMemoryClient {
  /** session ID -> list of message objects. */
  sessions = new Map<string, any[]>();
  addMessagesCalls: Array<{ spaceId: string; sessionId: string; messages: any[] }> = [];
  deleteSessionCalls: Array<{ spaceId: string; sessionId: string }> = [];
  createMemorySessionCalls: Array<{ spaceId: string; id?: string | null }> = [];
  closeCalled = false;
  addMessagesFail404 = false;
  deleteSessionFail = false;
  deleteSessionAttempts = 0;

  async addMessages(spaceId: string, sessionId: string, messages: any[]): Promise<any> {
    // Simulate 404 on the first call if the flag is set.
    if (this.addMessagesFail404) {
      this.addMessagesFail404 = false;
      throw new APIException(404, 'NotFound', 'session not found');
    }
    // Call `toDict()` on each message to simulate real backend behavior; this
    // catches bugs like empty content (`TextMessage.toDict()` validates).
    for (const msg of messages) {
      msg.toDict();
    }
    const existing = this.sessions.get(sessionId) ?? [];
    existing.push(...messages);
    this.sessions.set(sessionId, existing);
    this.addMessagesCalls.push({ spaceId, sessionId, messages });
    return { items: messages };
  }

  async createMemorySession(spaceId: string, id?: string | null): Promise<void> {
    this.createMemorySessionCalls.push({ spaceId, id });
  }

  async getLastKMessages(sessionId: string, k: number, _spaceId: string): Promise<any[]> {
    const msgs = this.sessions.get(sessionId) ?? [];
    return msgs.length > k ? msgs.slice(-k) : msgs;
  }

  async listMessages(
    _spaceId: string,
    sessionId: string,
    limit: number,
    offset: number,
  ): Promise<any> {
    const msgs = this.sessions.get(sessionId) ?? [];
    return { items: msgs.slice(offset, offset + limit) };
  }

  async deleteSession(spaceId: string, sessionId: string): Promise<void> {
    this.deleteSessionAttempts += 1;
    if (this.deleteSessionFail) {
      throw new APIException(500, 'InternalError', 'delete failed');
    }
    this.sessions.delete(sessionId);
    this.deleteSessionCalls.push({ spaceId, sessionId });
  }

  async close(): Promise<void> {
    this.closeCalled = true;
  }
}

/** Create a saver with fake clients. */
function createSaver(): {
  saver: AgentArtsMemorySessionSaver;
  fakeSync: FakeMemoryClient;
  fakeAsync: FakeMemoryClient;
} {
  const saver = new AgentArtsMemorySessionSaver({
    spaceId: 'test-space',
    region: 'cn-southwest-1',
    apiKey: 'test-api-key',
  });
  const fakeSync = new FakeMemoryClient();
  const fakeAsync = new FakeMemoryClient();
  (saver as any)._client = fakeSync;
  (saver as any)._asyncClient = fakeAsync;
  return { saver, fakeSync, fakeAsync };
}

/** Create a `RunnableConfig`. */
function makeConfig(threadId: string, checkpointId?: string | null): RunnableConfig {
  const configurable: Record<string, any> = { thread_id: threadId };
  if (checkpointId) {
    configurable['checkpoint_id'] = checkpointId;
  }
  return { configurable } as RunnableConfig;
}

/** Serialize a value the same way `putWrites` does. */
async function serializeWrite(
  saver: AgentArtsMemorySessionSaver,
  value: any,
): Promise<{ value_type: string; value_data: string }> {
  const [valueType, valueBytes] = await saver.serde.dumpsTyped(value);
  return {
    value_type: valueType,
    value_data: Buffer.from(valueBytes).toString('base64'),
  };
}

/** Seed the main session with one checkpoint message. */
function seedMainSession(
  fake: FakeMemoryClient,
  threadId: string,
  checkpointId: string,
  content = 'Hello',
): void {
  fake.sessions.set(threadId, [
    new FakeMessage(
      'user',
      content,
      JSON.stringify({
        step: 0,
        source: 'loop',
        checkpoint_id: checkpointId,
        checkpoint_ts: '2024-01-01T00:00:00Z',
      }),
    ),
  ]);
}

/** Seed the writes session with one `pending_writes` message. */
async function seedWritesSession(
  saver: AgentArtsMemorySessionSaver,
  fake: FakeMemoryClient,
  threadId: string,
  checkpointId: string,
  taskId: string,
  channel: string,
  value: any,
): Promise<void> {
  const writesData = [
    {
      task_id: taskId,
      task_path: '',
      channel,
      write_idx: 0,
      ...(await serializeWrite(saver, value)),
    },
  ];
  fake.sessions.set(AgentArtsMemorySessionSaver._writesSessionId(threadId), [
    new FakeMessage(
      'system',
      '',
      JSON.stringify({
        type: 'pending_writes',
        checkpoint_id: checkpointId,
        writes: writesData,
      }),
    ),
  ]);
}

// ============================================================
// putWrites behavior
// ============================================================

describe('TestPutWrites', () => {
  it('test_put_writes_stores_in_writes_session', async () => {
    const { saver, fakeSync } = createSaver();
    const threadId = 'test-thread-1';
    const checkpointId = 'cp-123';
    const config = makeConfig(threadId, checkpointId);

    const writes: PendingWrite[] = [
      ['channel1', 'value1'],
      ['channel2', { key: 'val' }],
    ];
    const taskId = 'task-001';
    await saver.putWrites(config, writes, taskId);

    expect(fakeSync.addMessagesCalls).toHaveLength(1);
    const call = fakeSync.addMessagesCalls[0]!;
    const expectedWritesSession = AgentArtsMemorySessionSaver._writesSessionId(threadId);
    expect(call.sessionId).toBe(expectedWritesSession);

    expect(call.messages).toHaveLength(1);
    const msg = call.messages[0]!;
    expect(msg.role).toBe('system');
    expect(msg.content).toBe('pending_writes');

    const meta = JSON.parse(msg.meta);
    expect(meta['type']).toBe('pending_writes');
    expect(meta['checkpoint_id']).toBe(checkpointId);
    expect(meta['writes']).toHaveLength(2);
    expect(meta['writes'][0]['task_id']).toBe(taskId);
    expect(meta['writes'][0]['channel']).toBe('channel1');
    expect('value_type' in meta['writes'][0]).toBe(true);
    expect('value_data' in meta['writes'][0]).toBe(true);
  });

  it('test_put_writes_empty_is_noop', async () => {
    const { saver, fakeSync } = createSaver();
    const threadId = 'test-thread-5';
    const config = makeConfig(threadId, 'cp-000');

    await saver.putWrites(config, [], 'task-005');

    expect(fakeSync.addMessagesCalls).toHaveLength(0);
  });

  it('test_put_writes_dedup_first_occurrence_wins', async () => {
    const { saver, fakeSync } = createSaver();
    const threadId = 'test-thread-6';
    const checkpointId = 'cp-dedup';
    seedMainSession(fakeSync, threadId, checkpointId);

    const config = makeConfig(threadId, checkpointId);
    await saver.putWrites(config, [['output', 'first']], 'task-A');
    await saver.putWrites(config, [['output', 'second']], 'task-A');

    const result = await saver.getTuple(config);
    expect(result).toBeDefined();
    expect(result!.pendingWrites).toBeDefined();
    expect(result!.pendingWrites).toHaveLength(1);
    expect(result!.pendingWrites![0]![2]).toBe('first');
  });

  it('test_put_writes_404_auto_creates_and_retries', async () => {
    const { saver, fakeSync } = createSaver();
    const threadId = 'test-thread-404';
    const checkpointId = 'cp-404';
    const config = makeConfig(threadId, checkpointId);

    fakeSync.addMessagesFail404 = true;
    await saver.putWrites(config, [['channel404', 'value404']], 'task-404');

    expect(fakeSync.createMemorySessionCalls).toHaveLength(1);
    const createCall = fakeSync.createMemorySessionCalls[0]!;
    const expectedWritesSession = AgentArtsMemorySessionSaver._writesSessionId(threadId);
    expect(createCall.id).toBe(expectedWritesSession);

    expect(fakeSync.addMessagesCalls).toHaveLength(1);
    expect(fakeSync.sessions.has(expectedWritesSession)).toBe(true);
    expect(fakeSync.sessions.get(expectedWritesSession)).toHaveLength(1);
  });
});

// ============================================================
// aputWrites behavior (async client)
// ============================================================

describe('TestAPutWrites', () => {
  it('test_aput_writes_stores_in_writes_session', async () => {
    const { saver, fakeAsync } = createSaver();
    const threadId = 'test-thread-7';
    const checkpointId = 'cp-async-1';
    const config = makeConfig(threadId, checkpointId);

    await saver.aputWrites(config, [['channelA', 'valueA']], 'task-007');

    expect(fakeAsync.addMessagesCalls).toHaveLength(1);
    const call = fakeAsync.addMessagesCalls[0]!;
    expect(call.sessionId).toBe(AgentArtsMemorySessionSaver._writesSessionId(threadId));
    const meta = JSON.parse(call.messages[0]!.meta);
    expect(meta['type']).toBe('pending_writes');
    expect(meta['writes']).toHaveLength(1);
  });

  it('test_aput_writes_404_auto_creates_and_retries', async () => {
    const { saver, fakeAsync } = createSaver();
    const threadId = 'test-thread-404-async';
    const checkpointId = 'cp-404-async';
    const config = makeConfig(threadId, checkpointId);

    fakeAsync.addMessagesFail404 = true;
    await saver.aputWrites(config, [['channelA404', 'valueA404']], 'task-404-async');

    expect(fakeAsync.createMemorySessionCalls).toHaveLength(1);
    const createCall = fakeAsync.createMemorySessionCalls[0]!;
    const expectedWritesSession = AgentArtsMemorySessionSaver._writesSessionId(threadId);
    expect(createCall.id).toBe(expectedWritesSession);

    expect(fakeAsync.addMessagesCalls).toHaveLength(1);
    expect(fakeAsync.sessions.has(expectedWritesSession)).toBe(true);
    expect(fakeAsync.sessions.get(expectedWritesSession)).toHaveLength(1);
  });
});

// ============================================================
// getTuple pending_writes roundtrip
// ============================================================

describe('TestGetTuplePendingWrites', () => {
  it('test_roundtrip', async () => {
    const { saver, fakeSync } = createSaver();
    const threadId = 'test-thread-2';
    const checkpointId = 'cp-456';
    seedMainSession(fakeSync, threadId, checkpointId);

    const config = makeConfig(threadId, checkpointId);
    await saver.putWrites(config, [['output', 'result-value']], 'task-002');

    const result = await saver.getTuple(config);
    expect(result).toBeDefined();
    expect(result!.pendingWrites).toBeDefined();
    expect(result!.pendingWrites).toHaveLength(1);
    const pw = result!.pendingWrites![0]!;
    expect(pw[0]).toBe('task-002');
    expect(pw[1]).toBe('output');
    expect(pw[2]).toBe('result-value');
  });

  it('test_async_roundtrip', async () => {
    const { saver, fakeAsync } = createSaver();
    const threadId = 'test-thread-8';
    const checkpointId = 'cp-async-2';
    seedMainSession(fakeAsync, threadId, checkpointId, 'Async test');

    const config = makeConfig(threadId, checkpointId);
    await saver.aputWrites(config, [['result', { data: 'async-value' }]], 'task-008');

    const result = await saver.agetTuple(config);
    expect(result).toBeDefined();
    expect(result!.pendingWrites).toBeDefined();
    expect(result!.pendingWrites).toHaveLength(1);
    const pw = result!.pendingWrites![0]!;
    expect(pw[0]).toBe('task-008');
    expect(pw[1]).toBe('result');
    expect(pw[2]).toEqual({ data: 'async-value' });
  });
});

// ============================================================
// list / alist pending_writes extraction
// ============================================================

describe('TestListPendingWrites', () => {
  it('test_list_retrieves_pending_writes', async () => {
    const { saver, fakeSync } = createSaver();
    const threadId = 'test-thread-3';
    const checkpointId = 'cp-789';
    seedMainSession(fakeSync, threadId, checkpointId, 'Test');
    await seedWritesSession(
      saver,
      fakeSync,
      threadId,
      checkpointId,
      'task-003',
      'data',
      'test-data',
    );

    // Python returns a list; LangGraph JS models `list()` as an AsyncGenerator.
    const result: CheckpointTuple[] = [];
    for await (const tuple of saver.list(makeConfig(threadId))) {
      result.push(tuple);
    }

    expect(result).toHaveLength(1);
    const checkpointTuple = result[0]!;
    expect(checkpointTuple.pendingWrites).toBeDefined();
    expect(checkpointTuple.pendingWrites).toHaveLength(1);
    const pw = checkpointTuple.pendingWrites![0]!;
    expect(pw[0]).toBe('task-003');
    expect(pw[1]).toBe('data');
    expect(pw[2]).toBe('test-data');
  });

  it('test_alist_retrieves_pending_writes', async () => {
    const { saver, fakeAsync } = createSaver();
    const threadId = 'test-thread-9';
    const checkpointId = 'cp-async-3';
    seedMainSession(fakeAsync, threadId, checkpointId, 'Async list test');
    await seedWritesSession(
      saver,
      fakeAsync,
      threadId,
      checkpointId,
      'task-009',
      'async-channel',
      'async-data',
    );

    const result = await saver.alist(makeConfig(threadId));

    expect(result).toHaveLength(1);
    const checkpointTuple = result[0]!;
    expect(checkpointTuple.pendingWrites).toBeDefined();
    expect(checkpointTuple.pendingWrites).toHaveLength(1);
    const pw = checkpointTuple.pendingWrites![0]!;
    expect(pw[0]).toBe('task-009');
    expect(pw[1]).toBe('async-channel');
    expect(pw[2]).toBe('async-data');
  });
});

// ============================================================
// deleteThread / adeleteThread behavior
// ============================================================

describe('TestDeleteThread', () => {
  it('test_delete_thread_deletes_both_sessions', async () => {
    const { saver, fakeSync } = createSaver();
    const threadId = 'test-thread-4';

    fakeSync.sessions.set(threadId, [new FakeMessage('user', 'main')]);
    fakeSync.sessions.set(AgentArtsMemorySessionSaver._writesSessionId(threadId), [
      new FakeMessage('system', 'writes'),
    ]);
    (saver as any)._persistedCount.set(threadId, 5);

    await saver.deleteThread(threadId);

    expect(fakeSync.deleteSessionCalls).toHaveLength(2);
    const deletedSessions = fakeSync.deleteSessionCalls.map((call) => call.sessionId);
    expect(deletedSessions).toContain(threadId);
    expect(deletedSessions).toContain(AgentArtsMemorySessionSaver._writesSessionId(threadId));
    expect((saver as any)._persistedCount.has(threadId)).toBe(false);
    expect(fakeSync.sessions.has(threadId)).toBe(false);
    expect(fakeSync.sessions.has(AgentArtsMemorySessionSaver._writesSessionId(threadId))).toBe(
      false,
    );
  });

  it('test_delete_thread_writes_session_deleted_first', async () => {
    const { saver, fakeSync } = createSaver();
    const threadId = 'test-thread-order';

    await saver.deleteThread(threadId);

    expect(fakeSync.deleteSessionCalls).toHaveLength(2);
    const deletedSessions = fakeSync.deleteSessionCalls.map((call) => call.sessionId);
    const writesSessionId = AgentArtsMemorySessionSaver._writesSessionId(threadId);
    expect(deletedSessions[0]).toBe(writesSessionId);
    expect(deletedSessions[1]).toBe(threadId);
  });

  it('test_delete_thread_swallows_failures_and_cleans_up', async () => {
    const { saver, fakeSync } = createSaver();
    const threadId = 'test-thread-swallow';
    (saver as any)._persistedCount.set(threadId, 5);
    fakeSync.deleteSessionFail = true;

    await saver.deleteThread(threadId); // must NOT raise

    expect(fakeSync.deleteSessionAttempts).toBe(2);
    expect((saver as any)._persistedCount.has(threadId)).toBe(false);
  });

  it('test_adelete_thread_deletes_both_sessions', async () => {
    const { saver, fakeAsync } = createSaver();
    const threadId = 'test-thread-10';

    fakeAsync.sessions.set(threadId, [new FakeMessage('user', 'main')]);
    fakeAsync.sessions.set(AgentArtsMemorySessionSaver._writesSessionId(threadId), [
      new FakeMessage('system', 'writes'),
    ]);
    (saver as any)._persistedCount.set(threadId, 10);

    await saver.adeleteThread(threadId);

    expect(fakeAsync.deleteSessionCalls).toHaveLength(2);
    const deletedSessions = fakeAsync.deleteSessionCalls.map((call) => call.sessionId);
    expect(deletedSessions).toContain(threadId);
    expect(deletedSessions).toContain(AgentArtsMemorySessionSaver._writesSessionId(threadId));
    expect((saver as any)._persistedCount.has(threadId)).toBe(false);
  });

  it('test_adelete_thread_order_and_swallow', async () => {
    const { saver, fakeAsync } = createSaver();
    const threadId = 'test-thread-async-order';

    // Normal path: verify order
    await saver.adeleteThread(threadId);
    const deletedSessions = fakeAsync.deleteSessionCalls.map((call) => call.sessionId);
    const writesSessionId = AgentArtsMemorySessionSaver._writesSessionId(threadId);
    expect(deletedSessions).toHaveLength(2);
    expect(deletedSessions[0]).toBe(writesSessionId);
    expect(deletedSessions[1]).toBe(threadId);
    expect((saver as any)._persistedCount.has(threadId)).toBe(false);

    // Failure path: no raise + cleanup
    (saver as any)._persistedCount.set(threadId, 7);
    fakeAsync.deleteSessionFail = true;
    await saver.adeleteThread(threadId); // must not raise
    expect(fakeAsync.deleteSessionAttempts).toBe(4);
    expect((saver as any)._persistedCount.has(threadId)).toBe(false);
  });
});

// ============================================================
// Close behavior (Python `with saver as s:` / `async with saver as s:`)
// ============================================================

describe('TestContextManager', () => {
  it('test_sync_context_manager_closes_sync_client_only', async () => {
    const { saver, fakeSync, fakeAsync } = createSaver();

    // Python: `with saver as s: assert s is saver`. Node.js has no `with`
    // statement, so `try { ... } finally { await saver.close(); }` is the
    // documented replacement for the Python context manager.
    let entered: AgentArtsMemorySessionSaver | undefined;
    try {
      entered = saver;
    } finally {
      await saver.close();
    }

    expect(entered).toBe(saver);
    expect(fakeSync.closeCalled).toBe(true);
    expect(fakeAsync.closeCalled).toBe(false);
  });

  it('test_async_context_manager_closes_both', async () => {
    const { saver, fakeSync, fakeAsync } = createSaver();

    // Python: `async with saver as s:`. Node.js equivalent: `try { ... }
    // finally { await saver.aclose(); }` (closes both client families).
    let entered: AgentArtsMemorySessionSaver | undefined;
    try {
      entered = saver;
    } finally {
      await saver.aclose();
    }

    expect(entered).toBe(saver);
    expect(fakeSync.closeCalled).toBe(true);
    expect(fakeAsync.closeCalled).toBe(true);
  });
});
