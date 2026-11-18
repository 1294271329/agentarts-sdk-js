/**
 * Unit tests for `AgentArtsMemoryClient` (`agentarts-client.ts`).
 *
 * Ported 1:1 from
 * `tests/unit/toolkit/plugins/memory/code_agent/test_agentarts_client.py`.
 *
 * Porting notes:
 * - The Python `_fake_sdk()` (`SimpleNamespace`) becomes a plain object holding
 *   the two fake data classes; the client is constructed with
 *   `new AgentArtsMemoryClient({ sdk })` instead of `sdk=...`.
 * - `monkeypatch.setattr(AgentArtsMemoryClient, "_get_cached_sid_from_file", ...)`
 *   (disable the file cache) becomes `vi.spyOn(AgentArtsMemoryClient as any, ...)`
 *   on the private static helpers, so the tests only exercise in-memory logic.
 * - `MagicMock()` -> a plain object of `vi.fn()` members; `call_args.kwargs` ->
 *   `mock.calls[i][j]` because the Node.js port passes positional arguments
 *   (`createMemorySession(spaceId, undefined, actorId, assistantId)`,
 *   `addMessages(spaceId, sessionId, messages)`,
 *   `searchMemories(spaceId, filters)`).
 * - `pytest.approx(0.9)` -> `toBeCloseTo(0.9)`.
 * - `process.env` mutation replaces `monkeypatch.setenv/delenv` (restored after
 *   each test); `fetch` is stubbed to fail so no unit test can reach the cloud.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  AgentArtsMemoryClient,
  DEFAULT_ASSISTANT_ID,
  DEFAULT_MIN_SCORE,
  DEFAULT_TOP_K,
} from 'agentarts-sdk/toolkit/plugins/memory/agentarts-client';
import {
  MemoryInfo,
  MemoryListResponse,
  MemorySearchResponse,
} from 'agentarts-sdk/sdk/memory';

// ── fake SDK ───────────────────────────────────────────────────────

class FakeTextMessage {
  role: string;
  content: string;
  actorId?: string;
  assistantId?: string;

  constructor(init: { role: string; content: string; actorId?: string; assistantId?: string }) {
    this.role = init.role;
    this.content = init.content;
    this.actorId = init.actorId;
    this.assistantId = init.assistantId;
  }
}

class FakeSearchFilter {
  query?: string;
  topK?: number;
  minScore?: number;
  actorId?: string;

  constructor(init: Partial<FakeSearchFilter> = {}) {
    Object.assign(this, init);
  }
}

function fakeSdk(): any {
  return {
    MemoryClient: class FakeMemoryClient {},
    TextMessage: FakeTextMessage,
    MemorySearchFilter: FakeSearchFilter,
  };
}

/** Plain `MagicMock` counterpart: every SDK client method is a `vi.fn()`. */
function fakeClient(): any {
  return {
    createMemorySession: vi.fn(),
    addMessages: vi.fn(),
    searchMemories: vi.fn(),
    listMemories: vi.fn(),
    close: vi.fn(),
  };
}

// ── env helpers (`monkeypatch.setenv` / `monkeypatch.delenv`) ───────

const MANAGED_ENV_KEYS = [
  'HUAWEICLOUD_SDK_AK',
  'HUAWEICLOUD_SDK_SK',
  'HUAWEICLOUD_SDK_REGION',
  'AGENTARTS_MEMORY_SPACE_ID',
  'HUAWEICLOUD_SDK_MEMORY_API_KEY',
] as const;

const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of MANAGED_ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
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
});

/** Create a client with env-based configuration and the file cache disabled. */
function makeClient(
  options: { spaceId?: string; ak?: string; sk?: string; apiKey?: string | null } = {},
): AgentArtsMemoryClient {
  process.env['HUAWEICLOUD_SDK_AK'] = options.ak ?? 'ak1';
  process.env['HUAWEICLOUD_SDK_SK'] = options.sk ?? 'sk1';
  process.env['AGENTARTS_MEMORY_SPACE_ID'] = options.spaceId ?? 'space-1';
  process.env['HUAWEICLOUD_SDK_MEMORY_API_KEY'] =
    options.apiKey === undefined ? 'key1' : (options.apiKey ?? '');

  const client = new AgentArtsMemoryClient({ sdk: fakeSdk() });
  // Disable the file-based cache for unit tests — only test in-memory logic.
  vi.spyOn(AgentArtsMemoryClient as any, '_getCachedSidFromFile').mockReturnValue(null);
  vi.spyOn(AgentArtsMemoryClient as any, '_putCachedSidToFile').mockImplementation(() => undefined);
  vi.spyOn(AgentArtsMemoryClient as any, '_invalidateCachedSid').mockImplementation(() => undefined);
  return client;
}

/** Inject a fake `MemoryClient` (Python `c._client = MagicMock()`). */
function injectClient(client: AgentArtsMemoryClient, sdkClient: any): any {
  (client as any)._client = sdkClient;
  return sdkClient;
}

// ── availability ──────────────────────────────────────────────────

describe('availability', () => {
  it('test_is_configured_true', () => {
    const c = makeClient();
    expect(c.isConfigured()).toBe(true);
  });

  it('test_is_configured_false_when_missing_space', () => {
    process.env['HUAWEICLOUD_SDK_AK'] = 'ak';
    process.env['HUAWEICLOUD_SDK_SK'] = 'sk';
    delete process.env['AGENTARTS_MEMORY_SPACE_ID'];
    const c = new AgentArtsMemoryClient({ sdk: fakeSdk() });
    expect(c.isConfigured()).toBe(false);
  });

  it('test_health_reports_flags', () => {
    const c = makeClient();
    const h = c.health();
    expect(h.space_id).toBe(true);
    expect(h.api_key).toBe(true);
    expect(h.status).toBe('healthy');
  });
});

// ── session caching ───────────────────────────────────────────────

describe('session caching', () => {
  it('test_session_cached_per_scope', async () => {
    const c = makeClient();
    const sdkClient = injectClient(c, fakeClient());
    sdkClient.createMemorySession.mockResolvedValue({ id: 'sess-1' });
    const sid1 = await (c as any)._getOrCreateSession('proj-a', 'user-1');
    const sid2 = await (c as any)._getOrCreateSession('proj-a', 'user-1');
    expect(sid1).toBe('sess-1');
    expect(sid2).toBe('sess-1');
    // create called only once for the same scope
    expect(sdkClient.createMemorySession).toHaveBeenCalledTimes(1);
    // different scope -> new session
    sdkClient.createMemorySession.mockResolvedValue({ id: 'sess-2' });
    const sid3 = await (c as any)._getOrCreateSession('proj-b', 'user-1');
    expect(sid3).toBe('sess-2');
    expect(sdkClient.createMemorySession).toHaveBeenCalledTimes(2);
  });

  it('test_session_not_shared_across_users', async () => {
    // Same scope but different actor_id must create separate sessions.
    const c = makeClient();
    const sdkClient = injectClient(c, fakeClient());
    sdkClient.createMemorySession.mockResolvedValue({ id: 'sess-1' });
    const sid1 = await (c as any)._getOrCreateSession('proj-a', 'codex-user');
    // same scope, different user -> new session
    sdkClient.createMemorySession.mockResolvedValue({ id: 'sess-2' });
    const sid2 = await (c as any)._getOrCreateSession('proj-a', 'cc-user');
    expect(sid1).not.toBe(sid2);
    expect(sid1).toBe('sess-1');
    expect(sid2).toBe('sess-2');
    expect(sdkClient.createMemorySession).toHaveBeenCalledTimes(2);
    // same scope + same user still cached
    const sid3 = await (c as any)._getOrCreateSession('proj-a', 'codex-user');
    expect(sid3).toBe(sid1);
    expect(sdkClient.createMemorySession).toHaveBeenCalledTimes(2);
  });

  it('test_session_uses_actor_and_assistant', async () => {
    const c = makeClient({ spaceId: 'sp' });
    const sdkClient = injectClient(c, fakeClient());
    sdkClient.createMemorySession.mockResolvedValue({ id: 's-x' });
    await (c as any)._getOrCreateSession('scope', 'the-actor');
    // Python: create_memory_session(space_id=..., actor_id=..., assistant_id=...)
    const call = sdkClient.createMemorySession.mock.calls[0];
    expect(call[0]).toBe('sp');
    expect(call[2]).toBe('the-actor');
    expect(call[3]).toBe(DEFAULT_ASSISTANT_ID);
  });
});

// ── add_messages ──────────────────────────────────────────────────

describe('addMessages', () => {
  it('test_add_messages_maps_role_content', async () => {
    const c = makeClient();
    const sdkClient = injectClient(c, fakeClient());
    sdkClient.createMemorySession.mockResolvedValue({ id: 'sess-9' });
    sdkClient.addMessages.mockResolvedValue({});
    const res = await c.addMessages([{ role: 'user', content: 'hello' }], {
      userId: 'u1',
      scopeId: 'proj',
    });
    expect(res.session_id).toBe('sess-9');
    expect(res.count).toBe(1);
    // Python: add_messages(space_id=..., session_id=..., messages=...)
    const sent = sdkClient.addMessages.mock.calls[0];
    const msgs = sent[2];
    expect(msgs[0].role).toBe('user');
    expect(msgs[0].content).toBe('hello');
    expect(msgs[0].actorId).toBe('u1');
    expect(sent[0]).toBe('space-1');
    expect(sent[1]).toBe('sess-9');
  });
});

// ── search_memories ───────────────────────────────────────────────

describe('searchMemories', () => {
  it('test_search_memories_normalizes_results', async () => {
    const c = makeClient();
    const sdkClient = injectClient(c, fakeClient());
    // MemorySearchResponse.results = [{"record": <dict>, "score": 0.9}, ...]
    sdkClient.searchMemories.mockResolvedValue(
      new MemorySearchResponse({
        results: [
          { record: { content: 'likes python', strategy_type: 'semantic' }, score: 0.9 },
          { record: { content: 'episodic note', strategy_type: 'episodic' }, score: 0.7 },
        ],
        total: 2,
      }),
    );
    const out = await c.searchMemories({ query: 'python', userId: 'u1', scopeId: 'proj' });
    expect(out).toHaveLength(2);
    expect(out[0]!.content).toBe('likes python');
    expect(out[0]!.score).toBeCloseTo(0.9);
    expect(out[0]!.type).toBe('semantic');
    // filter passed through (`searchMemories(spaceId, filters)`)
    const f = sdkClient.searchMemories.mock.calls[0][1];
    expect(f.query).toBe('python');
    expect(f.topK).toBe(DEFAULT_TOP_K);
    expect(f.minScore).toBe(DEFAULT_MIN_SCORE);
    expect(f.actorId).toBe('u1');
  });

  it('test_search_memories_empty', async () => {
    const c = makeClient();
    const sdkClient = injectClient(c, fakeClient());
    sdkClient.searchMemories.mockResolvedValue(
      new MemorySearchResponse({ results: [], total: 0 }),
    );
    expect(await c.searchMemories({ query: 'x', userId: 'u', scopeId: 's' })).toEqual([]);
  });
});

// ── list_memories ─────────────────────────────────────────────────

describe('listMemories', () => {
  it('test_list_memories_normalizes', async () => {
    const c = makeClient();
    const sdkClient = injectClient(c, fakeClient());
    // Python uses `SimpleNamespace(strategy_type=...)`; the Node.js SDK returns
    // `MemoryInfo` instances (camelCase attributes), which is the non-dict branch
    // of `_normalize_list_results`.
    sdkClient.listMemories.mockResolvedValue(
      new MemoryListResponse({
        items: [
          new MemoryInfo({
            id: 'm1',
            content: 'c1',
            strategyType: 'semantic',
            createdAt: 't1',
          }),
        ],
        total: 1,
      }),
    );
    const out = await c.listMemories({ userId: 'u', scopeId: 's' });
    expect(out[0]!.id).toBe('m1');
    expect(out[0]!.content).toBe('c1');
    expect(out[0]!.type).toBe('semantic');
    expect(out[0]!.created_at).toBe('t1');
  });
});
