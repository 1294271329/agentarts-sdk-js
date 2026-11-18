/**
 * Unit tests for the MCP server tools (`mcp/server.ts`).
 *
 * Ported 1:1 from
 * `tests/unit/toolkit/plugins/memory/code_agent/test_mcp_server.py`.
 *
 * Porting notes:
 * - The Python fixture injects a mock `AgentArtsMemoryClient` through
 *   `reset_client()`; the Node.js port exposes the same test seam
 *   (`resetClient()`), so no MCP transport / stdio subprocess is needed — the
 *   tools are ordinary exported async functions and are called directly.
 * - `MagicMock()` -> a plain object of `vi.fn()` members.
 * - Python tool functions are synchronous; the Node.js port returns promises,
 *   so every call is awaited.
 * - Keyword-argument assertions become object-argument assertions
 *   (`mock.calls[0][0]`).
 * - `monkeypatch.delenv/setenv` -> `process.env` mutation, restored afterwards;
 *   the platform-detection variables (`*_PLUGIN_ROOT`, `AGENTARTS_MEMORY_*`) are
 *   cleared so the tests always see the "unknown" platform unless set.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  AgentArtsMemoryClient,
  DEFAULT_MIN_SCORE,
  DEFAULT_TOP_K,
} from 'agentarts-sdk/toolkit/plugins/memory/agentarts-client';
import * as mcpServer from 'agentarts-sdk/toolkit/plugins/memory/mcp/server';

// ── env helpers (monkeypatch.setenv / delenv) ──────────────────────

const MANAGED_ENV_KEYS = [
  'HUAWEICLOUD_SDK_AK',
  'HUAWEICLOUD_SDK_SK',
  'HUAWEICLOUD_SDK_MEMORY_API_KEY',
  'AGENTARTS_MEMORY_SPACE_ID',
  'AGENTARTS_MEMORY_PLATFORM',
  'AGENTARTS_MEMORY_USER_ID',
  'AGENTARTS_MEMORY_PROJECT_NAME',
  'CLAUDE_PLUGIN_ROOT',
  'CODEX_PLUGIN_ROOT',
  'OPENCODE_PLUGIN_ROOT',
] as const;

const savedEnv: Record<string, string | undefined> = {};

/** Mock `AgentArtsMemoryClient` injected into the MCP server module. */
let mockClient: {
  searchMemories: ReturnType<typeof vi.fn>;
  addMessages: ReturnType<typeof vi.fn>;
  listMemories: ReturnType<typeof vi.fn>;
  isConfigured: ReturnType<typeof vi.fn>;
  health: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  for (const key of MANAGED_ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  process.env['HUAWEICLOUD_SDK_AK'] = 'ak';
  process.env['HUAWEICLOUD_SDK_SK'] = 'sk';
  process.env['AGENTARTS_MEMORY_SPACE_ID'] = 'sp';
  process.env['HUAWEICLOUD_SDK_MEMORY_API_KEY'] = 'k';
  // Ensure "unknown" platform detection -> user_id="__default__".

  mockClient = {
    searchMemories: vi.fn(),
    addMessages: vi.fn(),
    listMemories: vi.fn(),
    isConfigured: vi.fn(),
    health: vi.fn(),
  };
  mcpServer.resetClient(mockClient as unknown as AgentArtsMemoryClient);

  // Unit tests must never reach the cloud.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new Error('unexpected network call in unit test');
    }),
  );
});

afterEach(() => {
  mcpServer.resetClient(null);
  for (const key of MANAGED_ENV_KEYS) {
    if (savedEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = savedEnv[key];
    }
  }
  vi.unstubAllGlobals();
});

// ── search_memories ───────────────────────────────────────────────

describe('search_memories', () => {
  it('test_search_memories_returns_results', async () => {
    mockClient.searchMemories.mockResolvedValue([
      { content: 'likes python', score: 0.9, type: 'semantic' },
      { content: 'episodic note', score: 0.7, type: 'episodic' },
    ]);
    const result = await mcpServer.searchMemories('python', 5, 0.3);
    expect(result.total).toBe(2);
    expect(result.query).toBe('python');
    expect(result.results[0].content).toBe('likes python');
    expect(result.results[0].score).toBe(0.9);

    const kw = mockClient.searchMemories.mock.calls[0][0];
    expect(kw.query).toBe('python');
    expect(kw.userId).toBe('__default__');
    expect(kw.scopeId).toBe('default');
    expect(kw.num).toBe(5);
    expect(kw.threshold).toBe(0.3);
  });

  it('test_search_memories_empty', async () => {
    mockClient.searchMemories.mockResolvedValue([]);
    const result = await mcpServer.searchMemories('x');
    expect(result.total).toBe(0);
    expect(result.results).toEqual([]);
  });

  it('test_search_memories_error', async () => {
    mockClient.searchMemories.mockRejectedValue(new Error('boom'));
    const result = await mcpServer.searchMemories('x');
    expect('error' in result).toBe(true);
    expect(result.error).toContain('boom');
    expect(result.results).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('test_search_memories_defaults', async () => {
    mockClient.searchMemories.mockResolvedValue([]);
    await mcpServer.searchMemories('test');
    const kw = mockClient.searchMemories.mock.calls[0][0];
    // Imported here like the Python test does (DEFAULT_TOP_K / DEFAULT_MIN_SCORE).
    expect(kw.num).toBe(DEFAULT_TOP_K);
    expect(kw.threshold).toBe(DEFAULT_MIN_SCORE);
    expect(kw.userId).toBe('__default__');
    expect(kw.scopeId).toBe('default');
  });

  it('test_search_memories_resolves_platform_env', async () => {
    // When AGENTARTS_MEMORY_PLATFORM=opencode, user_id should be opencode-user.
    process.env['AGENTARTS_MEMORY_PLATFORM'] = 'opencode';
    mockClient.searchMemories.mockResolvedValue([]);
    await mcpServer.searchMemories('test');
    const kw = mockClient.searchMemories.mock.calls[0][0];
    expect(kw.userId).toBe('opencode-user');
  });
});

// ── add_messages ──────────────────────────────────────────────────

describe('add_messages', () => {
  it('test_add_messages_success', async () => {
    mockClient.addMessages.mockResolvedValue({ session_id: 's1', count: 2 });
    const result = await mcpServer.addMessages([{ role: 'user', content: 'hi' }]);
    expect(result.session_id).toBe('s1');
    expect(result.count).toBe(2);

    const args = mockClient.addMessages.mock.calls[0];
    expect(args[0]).toEqual([{ role: 'user', content: 'hi' }]);
    expect(args[1].userId).toBe('__default__');
    expect(args[1].scopeId).toBe('default');
  });

  it('test_add_messages_error', async () => {
    mockClient.addMessages.mockRejectedValue(new Error('network error'));
    const result = await mcpServer.addMessages([{ role: 'user', content: 'x' }]);
    expect('error' in result).toBe(true);
    expect(result.error).toContain('network error');
    expect(result.count).toBe(0);
  });
});

// ── list_memories ─────────────────────────────────────────────────

describe('list_memories', () => {
  it('test_list_memories_success', async () => {
    mockClient.listMemories.mockResolvedValue([
      { id: 'm1', content: 'c1', type: 'semantic', created_at: 't1' },
      { id: 'm2', content: 'c2', type: 'episodic', created_at: 't2' },
    ]);
    const result = await mcpServer.listMemories(10, 0);
    expect(result.total).toBe(2);
    expect(result.results[0].id).toBe('m1');

    const kw = mockClient.listMemories.mock.calls[0][0];
    expect(kw.limit).toBe(10);
    expect(kw.offset).toBe(0);
  });

  it('test_list_memories_error', async () => {
    mockClient.listMemories.mockRejectedValue(new Error('fail'));
    const result = await mcpServer.listMemories();
    expect('error' in result).toBe(true);
    expect(result.total).toBe(0);
  });
});

// ── search_summary ────────────────────────────────────────────────

describe('search_summary', () => {
  it('test_search_summary_filters_summary_types', async () => {
    // search_memories returns results; filter to summary types only.
    mockClient.searchMemories.mockResolvedValue([
      { content: 'summary text', score: 0.9, type: 'episodic' },
      { content: 'other', score: 0.7, type: 'semantic' },
    ]);
    const result = await mcpServer.searchSummary('x', 3);
    const types = result.results.map((m: Record<string, any>) => m['type']);
    expect(types).toContain('episodic');
    expect(types).not.toContain('semantic');
  });

  it('test_search_summary_fallback_to_list_when_search_empty', async () => {
    // search_memories returns nothing; fallback to list_memories + filter.
    mockClient.searchMemories.mockResolvedValue([]);
    mockClient.listMemories.mockResolvedValue([
      { id: 'm1', content: 'summary text', type: 'episodic', created_at: 't' },
      { id: 'm2', content: 'other', type: 'semantic', created_at: 't2' },
    ]);
    const result = await mcpServer.searchSummary('x', 3);
    const types = result.results.map((m: Record<string, any>) => m['type']);
    expect(types).toContain('episodic');
    expect(types).not.toContain('semantic');
  });

  it('test_search_summary_fallback_to_all', async () => {
    mockClient.searchMemories.mockResolvedValue([]);
    mockClient.listMemories.mockResolvedValue([
      { id: 'm1', content: 'c', type: 'semantic', created_at: 't' },
    ]);
    const result = await mcpServer.searchSummary('x', 5);
    expect(result.results).toHaveLength(1);
  });

  it('test_search_summary_error', async () => {
    mockClient.searchMemories.mockRejectedValue(new Error('err'));
    const result = await mcpServer.searchSummary('x');
    expect('error' in result).toBe(true);
    expect(result.total).toBe(0);
  });
});

// ── module structure ─────────────────────────────────────────────

describe('module structure', () => {
  it('test_mcp_server_has_name', () => {
    expect(mcpServer.mcp.name).toBe('agentarts-memory');
  });

  it('test_mcp_server_has_version', () => {
    expect(mcpServer.mcp.version).toBe('1.0.0');
  });

  it('test_get_client_singleton', () => {
    mcpServer.resetClient(null);
    expect(typeof mcpServer.getClient).toBe('function');
    expect(typeof mcpServer.resetClient).toBe('function');
    mcpServer.resetClient(null);
  });
});
