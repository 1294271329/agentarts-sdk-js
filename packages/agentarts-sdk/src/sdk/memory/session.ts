/**
 * Agent Memory SDK - Session Management.
 *
 * Mirrors `agentarts/sdk/memory/session.py`: provides the `MemorySession` class
 * which binds a Space, an Actor and a Session together.
 */

import { getLogger } from '../utils/logging.js';

import {
  describeType,
  MemoryInfo,
  MemoryListFilter,
  MemoryListResponse,
  MemorySearchFilter,
  MemorySearchResponse,
  MessageBatchResponse,
  MessageInfo,
  MessageListResponse,
  SessionCreateRequest,
  SessionInfo,
  TextMessage,
  ToolCallMessage,
  ToolResultMessage,
} from './inner/config.js';
import type { JsonDict } from './inner/config.js';
import { _DataPlane } from './inner/dataplane.js';
import type { DataPlaneOptions } from './inner/dataplane.js';

const logger = getLogger('sdk.memory.session');

/**
 * Retrieval configuration for memory retrieval parameters.
 *
 * Mirrors `RetrievalConfig`.
 */
export class RetrievalConfig {
  /** User ID for personalized retrieval. */
  userId?: string | null;
  /** Maximum token count of the retrieval result, 0 means no limit. */
  maxTokens = 0;
  /** Return the Top-K memories (default 2). */
  topK = 2;
  /** Similarity score threshold; lower scores are filtered out. */
  scoreThreshold = 0.6;

  constructor(init?: Partial<RetrievalConfig>) {
    Object.assign(this, init ?? {});
  }

  /** Python `__repr__` equivalent. */
  toString(): string {
    return (
      `RetrievalConfig(user_id=${this.userId}, max_tokens=${this.maxTokens}, ` +
      `top_k=${this.topK}, score_threshold=${this.scoreThreshold})`
    );
  }
}

/** Options accepted by {@link MemorySession}. */
export interface MemorySessionOptions {
  /** Space ID (required). */
  spaceId: string;
  /** Actor ID (required). */
  actorId: string;
  /**
   * Session ID (optional).
   * - Omitted: a new Session is created through the backend API.
   * - Provided: an existing Session is reused.
   */
  sessionId?: string | null;
  /** Huawei Cloud region name (default `cn-southwest-2`). */
  regionName?: string | null;
  /** API Key for data plane authentication (falls back to the environment). */
  apiKey?: string | null;
}

/** Keyword-only options of `addMessages` (Python `*` parameters). */
export interface AddMessagesOptions {
  /** Client API call time (milliseconds timestamp). */
  timestamp?: number | null;
  /** Idempotency key preventing duplicate writes on retry. */
  idempotencyKey?: string | null;
  /** Whether to force trigger memory extraction. */
  isForceExtract?: boolean;
}

/** Supported message types for `addMessages`. */
export type SessionMessage = TextMessage | ToolCallMessage | ToolResultMessage;

/** Default region used by sessions (matches the Python implementation). */
export const DEFAULT_SESSION_REGION = 'cn-southwest-2';

/**
 * Memory session wrapper class.
 *
 * Pre-binds `spaceId` and `sessionId`, so they do not need to be passed to every
 * call. Prefer the async factory {@link MemorySession.of} so the session has
 * been created before use.
 *
 * @typeParam C HTTP data plane type; `AsyncMemorySession` specializes it with
 *   `_AsyncDataPlane`.
 */
export class MemorySession<C extends _DataPlane = _DataPlane> {
  readonly spaceId: string;
  readonly actorId: string;

  protected _regionName: string;
  protected _dataPlane: C;

  private _sessionId?: string;
  private _initialized = false;
  private _initializing?: Promise<void>;
  private _pendingSessionId: string | null;

  /**
   * @param first Options object, or the space ID when using the positional
   *   form (same order as the Python signature).
   */
  constructor(
    first: MemorySessionOptions | string,
    actorId = '',
    sessionId?: string | null,
    regionName?: string | null,
    apiKey?: string | null,
  ) {
    const options: MemorySessionOptions =
      typeof first === 'object' && first !== null
        ? first
        : { spaceId: first, actorId, sessionId, regionName, apiKey };

    this.spaceId = options.spaceId;
    this.actorId = options.actorId;
    this._regionName = options.regionName ?? DEFAULT_SESSION_REGION;

    this._dataPlane = this._createDataPlane({
      regionName: options.regionName,
      apiKey: options.apiKey,
    });

    this._pendingSessionId = options.sessionId ?? null;
    if (options.sessionId !== undefined && options.sessionId !== null) {
      // An existing session ID was provided: no backend call is needed.
      this._sessionId = options.sessionId;
      this._initialized = true;
    }
  }

  /** Create the data plane used by this session. */
  protected _createDataPlane(options: DataPlaneOptions): C {
    return new _DataPlane(options) as C;
  }

  /** Region name of this session. */
  get regionName(): string {
    return this._regionName;
  }

  /** Python `__repr__` equivalent. */
  toString(): string {
    return (
      `MemorySession(space_id='${this.spaceId}', session_id='${this._sessionId}', ` +
      `region_name='${this._regionName}')`
    );
  }

  /** Session ID (undefined until the backend session has been created). */
  get sessionId(): string | undefined {
    return this._sessionId;
  }

  /**
   * Create a MemorySession through the factory method and make sure the
   * underlying session exists (counterpart of Python's `MemorySession.of`).
   */
  static async of(options: MemorySessionOptions): Promise<MemorySession>;
  static async of(
    spaceId: string,
    actorId: string,
    sessionId?: string | null,
    regionName?: string | null,
    apiKey?: string | null,
  ): Promise<MemorySession>;
  static async of(
    first: MemorySessionOptions | string,
    actorId?: string,
    sessionId?: string | null,
    regionName?: string | null,
    apiKey?: string | null,
  ): Promise<MemorySession> {
    const session = new MemorySession(
      first as MemorySessionOptions,
      actorId ?? '',
      sessionId,
      regionName,
      apiKey,
    );
    await session.ensureInitialized();
    return session;
  }

  /**
   * Ensure the session is initialized (creates it through the backend API when
   * no `sessionId` was provided).
   */
  async ensureInitialized(): Promise<void> {
    if (this._initialized) {
      return;
    }
    if (!this._initializing) {
      this._initializing = this._initialize().catch((error: unknown) => {
        // Allow a later call to retry initialization.
        this._initializing = undefined;
        throw error;
      });
    }
    await this._initializing;
  }

  private async _initialize(): Promise<void> {
    if (this._pendingSessionId === null || this._pendingSessionId === undefined) {
      const sessionConfig = new SessionCreateRequest({ actorId: this.actorId });
      const sessionInfo = await this._dataPlane.createMemorySession(
        this.spaceId,
        sessionConfig,
      );
      this._sessionId = sessionInfo.id;
      if (!this._sessionId) {
        throw new Error(`Failed to create session: ${JSON.stringify(sessionInfo)}`);
      }
      logger.info(`Session created via API: ${this._sessionId}`);
    } else {
      this._sessionId = this._pendingSessionId;
    }

    this._initialized = true;
  }

  /** Delete this session (soft delete). */
  async delete(): Promise<void> {
    await this.ensureInitialized();
    await this._dataPlane.deleteSession(this.spaceId, this._sessionId as string);
    logger.info(`Session deleted: ${this._sessionId} in space: ${this.spaceId}`);
  }

  /** Get details of this session. */
  async getInfo(): Promise<SessionInfo> {
    await this.ensureInitialized();
    logger.info(`Getting session info: ${this._sessionId} in space: ${this.spaceId}`);
    return this._dataPlane.getSession(this.spaceId, this._sessionId as string);
  }

  /** Get the last K messages from the bound session. */
  async getLastKMessages(k: number): Promise<MessageInfo[]> {
    await this.ensureInitialized();
    logger.info(`Getting last ${k} messages for session: ${this._sessionId}`);
    return this._dataPlane.getLastKMessages(
      this._sessionId as string,
      k,
      this.spaceId,
    );
  }

  /**
   * Add messages to the bound session.
   *
   * @param messages Text, tool call and tool result messages (may be mixed).
   * @param options Keyword-only options (timestamp, idempotencyKey,
   *   isForceExtract).
   */
  async addMessages(
    messages: SessionMessage[],
    options?: AddMessagesOptions,
  ): Promise<MessageBatchResponse> {
    await this.ensureInitialized();
    logger.info(`Adding ${messages.length} messages to session: ${this._sessionId}`);

    const messageRequests: JsonDict[] = [];

    for (const message of messages) {
      if (
        message instanceof TextMessage ||
        message instanceof ToolCallMessage ||
        message instanceof ToolResultMessage
      ) {
        messageRequests.push(message.toDict());
      } else {
        throw new Error(`Unsupported message type: ${describeType(message)}`);
      }
    }

    return this._dataPlane.addMessages(
      this.spaceId,
      this._sessionId as string,
      messageRequests,
      options?.timestamp,
      options?.idempotencyKey,
      options?.isForceExtract ?? false,
    );
  }

  /** List messages in the bound session. */
  async listMessages(limit = 10, offset = 0): Promise<MessageListResponse> {
    await this.ensureInitialized();
    logger.info(`Listing messages for session: ${this._sessionId}`);
    return this._dataPlane.listMessages(
      this.spaceId,
      this._sessionId as string,
      limit,
      offset,
    );
  }

  /** Get a specific message from the bound session. */
  async getMessage(messageId: string): Promise<MessageInfo> {
    await this.ensureInitialized();
    logger.info(`Getting message: ${messageId}`);
    return this._dataPlane.getMessage(
      messageId,
      this.spaceId,
      this._sessionId as string,
    );
  }

  /** Search memories in the bound space. */
  async searchMemories(
    filters?: MemorySearchFilter | null,
  ): Promise<MemorySearchResponse> {
    await this.ensureInitialized();
    logger.info(`Searching memories with filter: ${filters}`);

    return this._dataPlane.searchMemories(this.spaceId, filters);
  }

  /** List memory records in the bound space. */
  async listMemories(
    limit = 10,
    offset = 0,
    filters?: MemoryListFilter | null,
  ): Promise<MemoryListResponse> {
    await this.ensureInitialized();
    logger.info(`Listing memory records: limit=${limit}, offset=${offset}`);

    return this._dataPlane.listMemories(this.spaceId, limit, offset, filters);
  }

  /** Get a specific memory record from the bound space. */
  async getMemory(memoryId: string): Promise<MemoryInfo> {
    await this.ensureInitialized();
    logger.info(`Getting memory record: ${memoryId}`);
    return this._dataPlane.getMemory(this.spaceId, memoryId);
  }

  /** Delete a specific memory record from the bound space. */
  async deleteMemory(memoryId: string): Promise<void> {
    await this.ensureInitialized();
    logger.info(`Deleting memory record: ${memoryId}`);
    await this._dataPlane.deleteMemory(this.spaceId, memoryId);
  }

  /** Close the session and release resources. */
  async close(): Promise<void> {
    if (this._dataPlane) {
      await this._dataPlane.close();
      logger.info('MemorySession closed');
    }
  }
}
