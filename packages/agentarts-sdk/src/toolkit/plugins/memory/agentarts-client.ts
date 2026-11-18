/**
 * Adapter wrapping `agentarts-sdk/sdk/memory` `MemoryClient`.
 *
 * Ported from `agentarts/toolkit/plugins/memory/agentarts_client.py`. Provides:
 * - `scopeId:actorId` -> `sessionId` caching (auto `createMemorySession` on
 *   first use), shared with the hook scripts through
 *   `<tmpdir>/agentarts_memory/sessions.json`;
 * - `userId` -> `actorId` mapping;
 * - normalized result dicts for the MCP/HTTP layer.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { MemoryClient } from '../../../sdk/memory/index.js';
import type {
  MemoryInfo,
  MemoryListResponse,
  MemorySearchFilter,
  MemorySearchResponse,
  TextMessage,
} from '../../../sdk/memory/index.js';
import { getLogger } from '../../../sdk/utils/logging.js';

const logger = getLogger('toolkit.plugins.memory.agentarts_client');

/** Debug mode from environment (`AGENTARTS_MEMORY_LOG_LEVEL=debug`). */
export const DEBUG = (process.env['AGENTARTS_MEMORY_LOG_LEVEL'] ?? 'info').toLowerCase() === 'debug';

export const ENV_API_KEY = 'HUAWEICLOUD_SDK_MEMORY_API_KEY';
export const ENV_REGION = 'HUAWEICLOUD_SDK_REGION';
export const ENV_SPACE_ID = 'AGENTARTS_MEMORY_SPACE_ID';

export const DEFAULT_REGION = 'cn-southwest-2';
export const DEFAULT_ASSISTANT_ID = 'agentarts-memory-agent';
export const DEFAULT_TOP_K = 5;
export const DEFAULT_LIST_LIMIT = 10;
export const DEFAULT_MIN_SCORE = 0.7;
/** Session cache TTL: 24 hours. */
export const SESSION_TTL_SECONDS = 24 * 60 * 60;
export const SESSION_CACHE_DIR = join(tmpdir(), 'agentarts_memory');
export const SESSION_CACHE_FILE = join(SESSION_CACHE_DIR, 'sessions.json');

/** Message shape accepted by {@link AgentArtsMemoryClient.addMessages}. */
export interface MemoryMessageInput {
  role: string;
  content: string;
}

/** Normalized search result (`{content, score, type}`). */
export interface NormalizedSearchResult {
  content: string;
  score: number;
  type: string;
}

/** Normalized memory list item (`{id, content, type, created_at}`). */
export interface NormalizedListResult {
  id: any;
  content: any;
  type: any;
  created_at: any;
}

/** Result of {@link AgentArtsMemoryClient.addMessages}. */
export interface AddMessagesResult {
  session_id: string;
  count: number;
}

/** Result of {@link AgentArtsMemoryClient.health}. */
export interface MemoryHealth {
  status: 'healthy' | 'misconfigured';
  space_id: boolean;
  api_key: boolean;
}

/** File cache entry written by the adapter and the hook scripts. */
interface SessionCacheEntry {
  sid: string;
  ts: number;
}

/**
 * Namespace exposing the SDK classes used by the adapter.
 *
 * Python counterpart: the ad-hoc type returned by `import_memory_sdk()`. This
 * indirection lets callers (and tests) inject a fake SDK through the
 * `AgentArtsMemoryClient` constructor without importing the real one.
 */
export interface MemorySdkNamespace {
  MemoryClient: typeof MemoryClient;
  TextMessage: typeof TextMessage;
  MemorySearchFilter: typeof MemorySearchFilter;
}

/**
 * Lazily import the AgentArts Memory SDK.
 *
 * The dynamic import keeps the adapter loadable without the SDK being
 * resolved at module evaluation time (mirrors the Python function-level
 * imports).
 */
export async function importMemorySdk(): Promise<MemorySdkNamespace> {
  const memory = await import('../../../sdk/memory/index.js');
  return {
    MemoryClient: memory.MemoryClient,
    TextMessage: memory.TextMessage,
    MemorySearchFilter: memory.MemorySearchFilter,
  };
}

/** Options of {@link AgentArtsMemoryClient}. */
export interface AgentArtsMemoryClientOptions {
  spaceId?: string | null;
  regionName?: string | null;
  apiKey?: string | null;
  assistantId?: string;
  /** Injected SDK namespace (tests); resolved lazily when omitted. */
  sdk?: MemorySdkNamespace | null;
}

/** Thin wrapper over `MemoryClient` with `scope` -> `session` caching. */
export class AgentArtsMemoryClient {
  private _spaceId: string;
  private _region: string;
  private _apiKey: string | undefined;
  private _assistantId: string;
  private _sdk: MemorySdkNamespace | null;
  private _client: MemoryClient | null = null;
  /** `scope_id:actor_id` -> `session_id` cache (in memory). */
  private _sessions = new Map<string, string>();
  /** In-flight session creations, so concurrent callers share one session. */
  private _pending = new Map<string, Promise<string>>();

  constructor(options: AgentArtsMemoryClientOptions = {}) {
    this._spaceId = options.spaceId || process.env[ENV_SPACE_ID] || '';
    this._region = options.regionName || process.env[ENV_REGION] || DEFAULT_REGION;
    this._apiKey = options.apiKey || process.env[ENV_API_KEY];
    this._assistantId = options.assistantId ?? DEFAULT_ASSISTANT_ID;
    this._sdk = options.sdk ?? null;
  }

  // ── file-based session cache (shared with hook scripts) ──

  private static _readFileCache(): Record<string, any> {
    try {
      if (existsSync(SESSION_CACHE_FILE)) {
        return JSON.parse(readFileSync(SESSION_CACHE_FILE, 'utf8'));
      }
    } catch {
      // Ignore unreadable/corrupt caches, exactly like the Python version.
    }
    return {};
  }

  private static _writeFileCache(data: Record<string, any>): void {
    try {
      mkdirSync(SESSION_CACHE_DIR, { recursive: true });
      writeFileSync(SESSION_CACHE_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch {
      // Best-effort cache: never fail a memory operation because of it.
    }
  }

  private static _getCachedSidFromFile(cacheKey: string): string | null {
    const entry = AgentArtsMemoryClient._readFileCache()[cacheKey];
    if (!entry) {
      return null;
    }
    if (typeof entry === 'string') {
      return null; // old format, force re-create
    }
    const sid = entry.sid;
    const ts = entry.ts ?? 0;
    if (sid && Date.now() / 1000 - ts < SESSION_TTL_SECONDS) {
      return sid;
    }
    return null;
  }

  private static _putCachedSidToFile(cacheKey: string, sid: string): void {
    const data = AgentArtsMemoryClient._readFileCache();
    data[cacheKey] = { sid, ts: Math.floor(Date.now() / 1000) } satisfies SessionCacheEntry;
    AgentArtsMemoryClient._writeFileCache(data);
  }

  private static _invalidateCachedSid(cacheKey: string): void {
    const data = AgentArtsMemoryClient._readFileCache();
    if (cacheKey in data) {
      delete data[cacheKey];
      AgentArtsMemoryClient._writeFileCache(data);
    }
  }

  // ── availability ──

  /** True when the minimal env vars are present (no network access). */
  isConfigured(): boolean {
    return Boolean(this._spaceId && this._apiKey);
  }

  /** Space ID used by this client. */
  get spaceId(): string {
    return this._spaceId;
  }

  private async _ensureSdk(): Promise<MemorySdkNamespace> {
    if (this._sdk === null) {
      this._sdk = await importMemorySdk();
    }
    return this._sdk;
  }

  private async _ensureClient(): Promise<MemoryClient> {
    if (this._client === null) {
      const sdk = await this._ensureSdk();
      this._client = new sdk.MemoryClient({
        regionName: this._region,
        apiKey: this._apiKey,
      });
    }
    return this._client;
  }

  /** Return the cached session ID for `scope`+`actor`, creating one if needed. */
  async _getOrCreateSession(scopeId: string, actorId: string): Promise<string> {
    const cacheKey = `${scopeId}:${actorId}`;
    const cached = this._sessions.get(cacheKey);
    if (cached) {
      if (DEBUG) {
        logger.debug(
          `[SDK] session cache hit | scope_id=${scopeId}, actor_id=${actorId}, session_id=${cached}`,
        );
      }
      return cached;
    }

    // Check the file-based cache (shared with hook scripts).
    const fileSid = AgentArtsMemoryClient._getCachedSidFromFile(cacheKey);
    if (fileSid) {
      this._sessions.set(cacheKey, fileSid);
      return fileSid;
    }

    // Serialize concurrent creations for the same cache key (Python holds a
    // threading.Lock across session creation).
    const pending = this._pending.get(cacheKey);
    if (pending) {
      return pending;
    }
    const creation = (async (): Promise<string> => {
      const client = await this._ensureClient();
      if (DEBUG) {
        logger.debug(
          `[SDK] creating session | scope_id=${scopeId}, actor_id=${actorId}, ` +
            `space_id=${this._spaceId.slice(0, 8)}...`,
        );
      }
      const session = await client.createMemorySession(
        this._spaceId,
        undefined,
        actorId,
        this._assistantId,
      );
      const sid = session.id || '';
      if (!sid) {
        throw new Error('createMemorySession returned empty session id');
      }
      this._sessions.set(cacheKey, sid);
      AgentArtsMemoryClient._putCachedSidToFile(cacheKey, sid);
      if (DEBUG) {
        logger.debug(
          `[SDK] session created | scope_id=${scopeId}, actor_id=${actorId}, session_id=${sid}`,
        );
      }
      return sid;
    })();

    this._pending.set(cacheKey, creation);
    try {
      return await creation;
    } finally {
      this._pending.delete(cacheKey);
    }
  }

  /** Invalidate the cached session for `scope`+`actor` (memory + file). */
  invalidateSession(scopeId: string, actorId: string): void {
    const cacheKey = `${scopeId}:${actorId}`;
    this._sessions.delete(cacheKey);
    AgentArtsMemoryClient._invalidateCachedSid(cacheKey);
  }

  // ── operations ──

  /**
   * Record messages under the scope's session.
   *
   * `messages` is a list of `{role, content}` objects.
   */
  async addMessages(
    messages: MemoryMessageInput[],
    options: { userId: string; scopeId: string },
  ): Promise<AddMessagesResult> {
    const user_id: string = options.userId;
    const scope_id: string = options.scopeId;
    const sid = await this._getOrCreateSession(scope_id, user_id);
    const client = await this._ensureClient();
    const sdk = await this._ensureSdk();
    const sdkMessages = messages.map(
      (message) =>
        new sdk.TextMessage({
          role: message.role as TextMessage['role'],
          content: message.content,
          actorId: user_id,
          assistantId: this._assistantId,
        }),
    );
    if (DEBUG) {
      logger.debug(
        `[SDK] add_messages | user_id=${user_id}, scope_id=${scope_id}, ` +
          `session_id=${sid}, count=${sdkMessages.length}`,
      );
    }
    await client.addMessages(this._spaceId, sid, sdkMessages);
    return { session_id: sid, count: sdkMessages.length };
  }

  /** Semantic search; returns a normalized list of `{content, score, type}`. */
  async searchMemories(options: {
    query: string;
    userId: string;
    scopeId: string;
    num?: number;
    threshold?: number;
  }): Promise<NormalizedSearchResult[]> {
    const num = options.num ?? DEFAULT_TOP_K;
    const threshold = options.threshold ?? DEFAULT_MIN_SCORE;
    const client = await this._ensureClient();
    const sdk = await this._ensureSdk();
    if (DEBUG) {
      logger.debug(
        `[SDK] search_memories | user_id=${options.userId}, scope_id=${options.scopeId}, ` +
          `query='${options.query.slice(0, 50)}...', num=${num}`,
      );
    }
    const filters = new sdk.MemorySearchFilter({
      query: options.query,
      topK: num,
      minScore: threshold,
      actorId: options.userId,
    });
    const response = await client.searchMemories(this._spaceId, filters);
    const results = AgentArtsMemoryClient._normalizeSearchResults(response);
    if (DEBUG) {
      logger.debug(`[SDK] search_memories | results=${results.length}`);
    }
    return results;
  }

  /** List memory records; returns a normalized list of `{id, content, type, created_at}`. */
  async listMemories(options: {
    userId?: string | null;
    scopeId?: string | null;
    limit?: number;
    offset?: number;
  } = {}): Promise<NormalizedListResult[]> {
    const limit = options.limit ?? DEFAULT_LIST_LIMIT;
    const offset = options.offset ?? 0;
    const client = await this._ensureClient();
    if (DEBUG) {
      logger.debug(
        `[SDK] list_memories | user_id=${options.userId ?? 'default'}, ` +
          `scope_id=${options.scopeId ?? 'default'}, limit=${limit}`,
      );
    }
    const response = await client.listMemories(this._spaceId, limit, offset);
    return AgentArtsMemoryClient._normalizeListResults(response);
  }

  /** Return config readiness (no network call). */
  health(): MemoryHealth {
    return {
      status: this.isConfigured() ? 'healthy' : 'misconfigured',
      space_id: Boolean(this._spaceId),
      api_key: Boolean(this._apiKey),
    };
  }

  // ── normalization helpers ──

  /** Best-effort extract of the content string from a search result record. */
  static _extractContent(record: any): string {
    if (record === null || record === undefined) {
      return '';
    }
    if (typeof record === 'string') {
      return record;
    }
    if (typeof record === 'object') {
      for (const key of ['content', 'text', 'summary', 'message']) {
        const value = (record as Record<string, any>)[key];
        if (value) {
          return String(value);
        }
      }
      // nested record
      const inner = (record as Record<string, any>)['record'];
      if (inner) {
        return AgentArtsMemoryClient._extractContent(inner);
      }
    }
    return String(record);
  }

  /** Best-effort extract of the strategy/memory type from a record. */
  static _extractType(record: any): string {
    if (record !== null && typeof record === 'object') {
      for (const key of ['strategy_type', 'memory_type', 'type', 'strategy']) {
        const value = (record as Record<string, any>)[key];
        if (value) {
          return String(value);
        }
      }
      const inner = (record as Record<string, any>)['record'];
      if (inner !== null && typeof inner === 'object') {
        return AgentArtsMemoryClient._extractType(inner);
      }
    }
    return '';
  }

  /** Normalize `MemorySearchResponse` -> list of `{content, score, type}`. */
  static _normalizeSearchResults(response: MemorySearchResponse | null | undefined): NormalizedSearchResult[] {
    const rawResults = response?.results;
    if (!rawResults) {
      return [];
    }
    const out: NormalizedSearchResult[] = [];
    for (const item of rawResults) {
      let record: any;
      let score: any;
      if (item !== null && typeof item === 'object') {
        record = (item as Record<string, any>)['record'];
        score = (item as Record<string, any>)['score'];
      } else {
        record = item;
        score = undefined;
      }
      out.push({
        content: AgentArtsMemoryClient._extractContent(record),
        score: score !== null && score !== undefined ? Number(score) : 0.0,
        type: AgentArtsMemoryClient._extractType(record),
      });
    }
    return out;
  }

  /** Normalize `MemoryListResponse` -> list of `{id, content, type, created_at}`. */
  static _normalizeListResults(
    response: MemoryListResponse | null | undefined,
  ): NormalizedListResult[] {
    const items: any[] = response?.items ?? [];
    const out: NormalizedListResult[] = [];
    for (const memory of items) {
      let id: any;
      let content: any;
      let type: any;
      let createdAt: any;
      if (_isPlainDict(memory)) {
        // Python branch: isinstance(mem, dict)
        content = memory['content'] ?? '';
        type = memory['strategy_type'] || memory['memory_type'] || '';
        id = memory['id'] ?? '';
        createdAt = memory['created_at'] ?? '';
      } else {
        const info = memory as MemoryInfo;
        content = info.content ?? '';
        type = info.strategyType ?? '';
        id = info.id ?? '';
        createdAt = info.createdAt ?? '';
      }
      out.push({ id, content, type, created_at: createdAt });
    }
    return out;
  }
}

/** True for a plain object literal (Python `isinstance(value, dict)`). */
function _isPlainDict(value: any): value is Record<string, any> {
  return value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
}
