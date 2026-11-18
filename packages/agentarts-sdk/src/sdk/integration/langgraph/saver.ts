/**
 * AgentArts Memory Session Saver for LangGraph.
 *
 * Mirrors `agentarts/sdk/integration/langgraph/saver.py`: a `BaseCheckpointSaver`
 * implementation that persists LangGraph conversation state in the AgentArts
 * Memory service.
 *
 * Architecture (same as Python):
 * - Checkpoints are stored as messages in the Memory service.
 * - Each checkpoint is tagged with metadata for retrieval.
 * - The thread ID is used directly as the session ID.
 * - "Sync" methods (`getTuple`/`put`/`putWrites`/`list`/`deleteThread`) use
 *   `MemoryClient`; the Python async variants (`agetTuple`/`aput`/`aputWrites`/
 *   `alist`/`adeleteThread`) use `AsyncMemoryClient`. Both clients are
 *   Promise-based in Node.js (PORTING.md §4), so every method of this class is
 *   `async`; the two families only differ in which HTTP client is used.
 * - Delta tracking: `put`/`aput` only send the messages added since the last
 *   persisted count, tracked per session ID in `_persistedCount`. The count is
 *   (re)initialized from the backend state on every `getTuple()`/`agetTuple()`
 *   call. Reuse a single saver instance for the application lifetime so the
 *   count survives across `get`/`put` calls.
 *
 * JS/LangGraph JS specifics (see the differences section in the port report):
 * - `CheckpointTuple` uses the JS field names `parentConfig` / `pendingWrites`.
 * - `list()` is an `AsyncGenerator` in LangGraph JS (Python returns a list);
 *   `alist()` keeps the Python list result.
 * - The serializer protocol is Promise based (`dumpsTyped` / `loadsTyped`).
 * - `WRITES_IDX_MAP` is not re-exported by `@langchain/langgraph` (only by
 *   `@langchain/langgraph-checkpoint`, which is not a declared dependency of this
 *   package), so it is reproduced verbatim below.
 */

import { createHash, randomUUID } from 'node:crypto';

import { BaseCheckpointSaver } from '@langchain/langgraph';
import type { BaseMessage } from '@langchain/core/messages';
import type { RunnableConfig } from '@langchain/core/runnables';
import type { Checkpoint, CheckpointMetadata, CheckpointTuple } from '@langchain/langgraph';

import { CheckpointerConfig } from './config.js';
import { _parseMeta, langgraphMessagesToMemory, memoryToLanggraphMessage } from './converter.js';
import { AsyncMemoryClient, MemoryClient, TextMessage } from '../../memory/index.js';
import type { MessageInfo } from '../../memory/index.js';
import { APIException } from '../../service/index.js';
import { getRegion } from '../../utils/constant.js';
import { getLogger } from '../../utils/logging.js';

const logger = getLogger('sdk.integration.langgraph.saver');

/**
 * Namespace UUID used to derive deterministic writes session IDs.
 *
 * Same value as Python `WRITES_SESSION_NAMESPACE` (the RFC 4122 DNS namespace),
 * so both SDKs compute identical writes session IDs.
 */
export const WRITES_SESSION_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

/**
 * Mapping from special channel name to (negative) write index.
 *
 * Copied verbatim from `langgraph-checkpoint`'s `WRITES_IDX_MAP`; the values are
 * part of the on-the-wire pending-writes format, so they must not drift.
 */
export const WRITES_IDX_MAP: Record<string, number> = {
  __error__: -1,
  __scheduled__: -2,
  __interrupt__: -3,
  __resume__: -4,
};

/** Promise-based counterpart of `langgraph-checkpoint`'s `SerializerProtocol`. */
export interface SerializerProtocolLike {
  dumpsTyped(data: any): Promise<[string, Uint8Array]>;
  loadsTyped(type: string, data: Uint8Array | string): Promise<any>;
}

/** One pending write `[channel, value]` (same shape as Python `PendingWrite`). */
export type PendingWrite<Channel = string> = [Channel, unknown];

/** One persisted pending write `[taskId, channel, value]`. */
export type CheckpointPendingWrite<TaskId = string> = [TaskId, ...PendingWrite<string>];

/** `@langchain/langgraph` does not re-export `CheckpointListOptions`. */
export interface CheckpointListOptions {
  limit?: number;
  before?: RunnableConfig;
  filter?: Record<string, any>;
}

/**
 * A LangGraph checkpoint.
 *
 * LangGraph JS only declares `v`/`id`/`ts`/`channel_values`/`channel_versions`/
 * `versions_seen`; Python's `Checkpoint` also carries the (legacy) `step`,
 * `pending_sends` and `parents` keys, which are kept here so the stored payloads
 * stay identical across SDKs.
 */
export interface AgentArtsCheckpoint extends Checkpoint {
  step?: number;
  pending_sends?: unknown[];
  parents?: Record<string, string>;
}

/** Options accepted by {@link AgentArtsMemorySessionSaver}. */
export interface AgentArtsMemorySessionSaverOptions {
  /** Space ID for the memory service (required). */
  spaceId: string;
  /** Huawei Cloud region name, defaults to the SDK environment detection. */
  region?: string | null;
  /** API Key for data plane authentication (falls back to the environment). */
  apiKey?: string | null;
  /** Maximum number of messages retrieved per query (default 10). */
  maxMessages?: number;
  /** Serializer/deserializer for checkpoints (default `JsonPlusSerializer`). */
  serde?: SerializerProtocolLike | null;
  /**
   * SSL verification setting (default `true`): `true` verifies with the system CA
   * bundle, `false` skips verification, a string is a custom CA file path.
   */
  verifySsl?: boolean | string;
}

/** Format an unknown thrown value the way Python's `str(e)` would. */
function _errorText(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * RFC 4122 version 5 (SHA-1, name based) UUID.
 *
 * Node.js has no `uuid.uuid5` equivalent; Python's
 * `uuid.uuid5(WRITES_SESSION_NAMESPACE, session_id)` is reproduced here bit for
 * bit so both SDKs address the same writes session.
 */
export function _uuid5(namespaceUuid: string, name: string): string {
  const namespaceBytes = Buffer.from(namespaceUuid.replace(/-/g, ''), 'hex');
  const digest = createHash('sha1')
    .update(Buffer.concat([namespaceBytes, Buffer.from(name, 'utf8')]))
    .digest();
  const bytes = Buffer.from(digest.subarray(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

/**
 * A LangGraph checkpoint saver backed by the AgentArts Memory service.
 *
 * ```ts
 * const checkpointer = new AgentArtsMemorySessionSaver({
 *   spaceId: 'your-space-id',
 *   apiKey: 'your-api-key',
 *   maxMessages: 10,
 * });
 * const compiled = graph.compile({ checkpointer });
 * const result = await compiled.invoke(
 *   { input: 'hello' },
 *   { configurable: { thread_id: 'conversation-123' } },
 * );
 * ```
 */
export class AgentArtsMemorySessionSaver extends BaseCheckpointSaver<number> {
  private _spaceId: string;
  private _region: string;
  private _apiKey?: string | null;
  private _maxMessages: number;
  private _verifySsl: boolean | string;

  /** Messages already persisted per session (thread ID). */
  private _persistedCount = new Map<string, number>();

  private _client: MemoryClient;
  private _asyncClient: AsyncMemoryClient;

  constructor(options: AgentArtsMemorySessionSaverOptions) {
    // Python: `super().__init__(serde=serde or JsonPlusSerializer())`; the JS base
    // class constructs a `JsonPlusSerializer` when no serde is given.
    super(options.serde ?? undefined);

    this._spaceId = options.spaceId;
    this._region = options.region || getRegion();
    this._apiKey = options.apiKey;
    this._maxMessages = options.maxMessages ?? 10;
    this._verifySsl = options.verifySsl ?? true;

    this._client = new MemoryClient({
      regionName: this._region,
      apiKey: this._apiKey,
      verifySsl: this._verifySsl,
    });
    this._asyncClient = new AsyncMemoryClient({
      regionName: this._region,
      apiKey: this._apiKey,
      verifySsl: this._verifySsl,
    });
  }

  /** Get the Space ID. */
  get spaceId(): string {
    return this._spaceId;
  }

  /** Get the region. */
  get region(): string {
    return this._region;
  }

  /** Get the max messages limit. */
  get maxMessages(): number {
    return this._maxMessages;
  }

  /** Extract the runtime configuration from a `RunnableConfig`. */
  protected _getRuntimeConfig(config: RunnableConfig | Record<string, any>): CheckpointerConfig {
    return CheckpointerConfig.fromRunnableConfig(config);
  }

  /**
   * Get the session ID used for storing pending writes.
   *
   * Uses UUID5 to derive a deterministic UUID from the session ID, ensuring the
   * writes session ID is a valid UUID (required by the backend).
   */
  static _writesSessionId(sessionId: string): string {
    return _uuid5(WRITES_SESSION_NAMESPACE, sessionId);
  }

  /**
   * Extract and deduplicate pending writes from write messages.
   *
   * Matches `InMemorySaver` semantics:
   * - Regular writes (`write_idx >= 0`): first occurrence wins (idempotent skip).
   * - Special writes (`write_idx < 0`): last occurrence wins (always overwrite).
   */
  protected async _extractPendingWrites(
    messages: MessageInfo[],
    checkpointId: string,
  ): Promise<CheckpointPendingWrite[]> {
    // Messages are ordered oldest to newest; dedupe by (task_id, write_idx).
    const seen = new Map<string, Record<string, any>>();

    for (const msg of messages) {
      if (!msg || !msg.meta) {
        continue;
      }
      const meta = _parseMetaOrNull(msg.meta);
      if (meta === null) {
        continue;
      }

      if (meta['type'] !== 'pending_writes') {
        continue;
      }
      if (meta['checkpoint_id'] !== checkpointId) {
        continue;
      }

      const writes = (meta['writes'] ?? []) as Array<Record<string, any>>;
      for (const write of writes) {
        const key = `${write['task_id']}\u0000${write['write_idx']}`;
        if ((write['write_idx'] as number) >= 0) {
          // Regular write: first occurrence wins (matches InMemorySaver skip).
          if (!seen.has(key)) {
            seen.set(key, write);
          }
        } else {
          // Special write (ERROR/INTERRUPT/RESUME/SCHEDULED): last wins.
          seen.set(key, write);
        }
      }
    }

    // Reconstruct PendingWrite tuples: (task_id, channel, value).
    const pendingWrites: CheckpointPendingWrite[] = [];
    for (const write of seen.values()) {
      const valueType = write['value_type'] as string;
      const valueBytes = new Uint8Array(Buffer.from(String(write['value_data'] ?? ''), 'base64'));
      const value = await this.serde.loadsTyped(valueType, valueBytes);
      pendingWrites.push([write['task_id'] as string, write['channel'] as string, value]);
    }

    return pendingWrites;
  }

  /** Convert Memory messages into LangGraph messages, skipping broken ones. */
  private _toLanggraphMessages(messages: MessageInfo[]): BaseMessage[] {
    const langgraphMessages: BaseMessage[] = [];
    for (const msg of messages) {
      try {
        langgraphMessages.push(memoryToLanggraphMessage(msg));
      } catch (error) {
        logger.debug(`Failed to convert message: ${_errorText(error)}`);
      }
    }
    return langgraphMessages;
  }

  /**
   * Build the checkpoint tuple for a set of backend messages.
   *
   * Shared by `getTuple`/`agetTuple`; returns `undefined` in the same situations
   * as the Python implementation.
   */
  private async _buildTuple(
    client: MemoryClient,
    runtimeConfig: CheckpointerConfig,
    messages: MessageInfo[],
    checkpointIdFromConfig: string | null | undefined,
    initializePersistedCount: boolean,
  ): Promise<CheckpointTuple | undefined> {
    const sessionId = runtimeConfig.sessionId;

    const langgraphMessages = this._toLanggraphMessages(messages);
    if (langgraphMessages.length === 0) {
      return undefined;
    }

    const checkpointState = this._readCheckpointState(messages);

    if (checkpointIdFromConfig && checkpointIdFromConfig !== checkpointState.checkpointId) {
      logger.debug(
        `Requested checkpoint_id ${checkpointIdFromConfig} ` +
          `does not match latest ${checkpointState.checkpointId}`,
      );
      return undefined;
    }

    const checkpoint: AgentArtsCheckpoint = {
      v: 1,
      id: checkpointState.checkpointId,
      ts: checkpointState.checkpointTs,
      channel_values: { messages: langgraphMessages },
      channel_versions: { messages: 1 },
      versions_seen: {},
      step: -1,
      pending_sends: [],
      parents: {},
    };

    const metadata = {
      source: checkpointState.source,
      step: checkpointState.step,
      writes: {},
      parents: {},
    } as unknown as CheckpointMetadata;

    // Initialize the persisted count from the backend state.
    // This runs on every getTuple()/agetTuple() call (including a session resume
    // after a process restart), so the count stays in sync with the backend.
    if (initializePersistedCount) {
      this._persistedCount.set(sessionId, langgraphMessages.length);
    }

    const pendingWrites = await this._loadPendingWrites(
      client,
      sessionId,
      checkpointState.checkpointId,
    );

    return {
      config: runtimeConfig.toRunnableConfig(),
      checkpoint,
      metadata,
      parentConfig: undefined,
      pendingWrites: pendingWrites.length > 0 ? pendingWrites : undefined,
    };
  }

  /** Read `step`/`source`/`checkpoint_id`/`checkpoint_ts` from the last message meta. */
  private _readCheckpointState(messages: MessageInfo[]): {
    step: number;
    source: 'input' | 'loop' | 'update' | 'fork';
    checkpointId: string;
    checkpointTs: string;
  } {
    let step = 0;
    let source: 'input' | 'loop' | 'update' | 'fork' = 'loop';
    let checkpointId = randomUUID();
    let checkpointTs = new Date().toISOString();

    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.meta) {
      const meta = _parseMetaOrNull(lastMessage.meta);
      if (meta === null) {
        logger.debug(`Failed to parse meta: ${JSON.stringify(lastMessage.meta)}`);
      } else {
        step = meta['step'] ?? 0;
        source = meta['source'] ?? 'loop';
        checkpointId = meta['checkpoint_id'] ?? checkpointId;
        checkpointTs = meta['checkpoint_ts'] ?? checkpointTs;
      }
    }

    return { step, source, checkpointId, checkpointTs };
  }

  /** Load the pending writes stored in the dedicated writes session. */
  private async _loadPendingWrites(
    client: MemoryClient,
    sessionId: string,
    checkpointId: string,
  ): Promise<CheckpointPendingWrite[]> {
    let pendingWrites: CheckpointPendingWrite[] = [];
    try {
      const writesMessages = await client.getLastKMessages(
        AgentArtsMemorySessionSaver._writesSessionId(sessionId),
        this._maxMessages,
        this._spaceId,
      );
      if (writesMessages && writesMessages.length > 0) {
        pendingWrites = await this._extractPendingWrites(writesMessages, checkpointId);
      }
    } catch (error) {
      logger.debug(`Failed to retrieve pending writes: ${_errorText(error)}`);
    }
    return pendingWrites;
  }

  /** `getTuple`/`agetTuple` implementation for a given client. */
  private async _getTupleWith(
    client: MemoryClient,
    config: RunnableConfig,
  ): Promise<CheckpointTuple | undefined> {
    const runtimeConfig = this._getRuntimeConfig(config);
    const sessionId = runtimeConfig.sessionId;
    const checkpointIdFromConfig = (config as any)?.configurable?.['checkpoint_id'] as
      | string
      | null
      | undefined;

    let messages: MessageInfo[];
    try {
      messages = await client.getLastKMessages(sessionId, this._maxMessages, this._spaceId);
    } catch (error) {
      logger.exception(`Failed to get checkpoint tuple: ${_errorText(error)}`);
      return undefined;
    }
    if (!messages || messages.length === 0) {
      return undefined;
    }

    return await this._buildTuple(
      client,
      runtimeConfig,
      messages,
      checkpointIdFromConfig,
      true,
    );
  }

  /** `put`/`aput` implementation for a given client. */
  private async _putWith(
    client: MemoryClient,
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
  ): Promise<RunnableConfig> {
    const runtimeConfig = this._getRuntimeConfig(config);
    const sessionId = runtimeConfig.sessionId;

    const channelValues = (checkpoint.channel_values ?? {}) as Record<string, any>;
    const messages = (channelValues['messages'] ?? []) as BaseMessage[];
    if (!messages || messages.length === 0) {
      return config;
    }

    // Delta tracking: only send new messages since the last persisted count.
    // LangGraph calls put() on every step with the full message history, so
    // duplicates must be avoided.
    let lastCount = this._persistedCount.get(sessionId) ?? 0;
    // Defensive: if the count is somehow ahead of the current messages (e.g. the
    // backend messages were deleted), reset to 0 to avoid skipping new messages.
    if (lastCount > messages.length) {
      lastCount = 0;
    }
    const newMessages = messages.slice(lastCount);
    if (newMessages.length === 0) {
      // Nothing new to persist, skip sending to the backend.
      return config;
    }

    const step = metadata?.step ?? 0;
    const source = metadata?.source ?? 'loop';
    const checkpointId = checkpoint.id ?? randomUUID();
    const checkpointTs = checkpoint.ts ?? new Date().toISOString();
    const checkpointMeta = JSON.stringify({
      step,
      source,
      checkpoint_id: checkpointId,
      checkpoint_ts: checkpointTs,
    });
    const cloudMessages = langgraphMessagesToMemory(
      newMessages,
      runtimeConfig.actorId,
      runtimeConfig.assistantId,
      checkpointMeta,
    );

    try {
      await client.addMessages(this._spaceId, sessionId, cloudMessages);

      // Only update the persisted count after a successful backend call. If the
      // call failed, the count stays at the last successful value so the next
      // put() retries the delta.
      this._persistedCount.set(sessionId, messages.length);
    } catch (error) {
      logger.exception(
        `Failed to put checkpoint for session ${sessionId} with: ${_errorText(error)}`,
      );
    }

    return config;
  }

  /** `putWrites`/`aputWrites` implementation for a given client. */
  private async _putWritesWith(
    client: MemoryClient,
    config: RunnableConfig,
    writes: PendingWrite[],
    taskId: string,
    taskPath: string,
  ): Promise<void> {
    if (!writes || writes.length === 0) {
      return;
    }

    const runtimeConfig = this._getRuntimeConfig(config);
    const sessionId = runtimeConfig.sessionId;
    const writesSessionId = AgentArtsMemorySessionSaver._writesSessionId(sessionId);
    const checkpointId = ((config as any)?.configurable?.['checkpoint_id'] as string) ?? '';

    const writesData: Array<Record<string, any>> = [];
    for (let idx = 0; idx < writes.length; idx += 1) {
      const [channel, value] = writes[idx]!;
      const writeIdx = WRITES_IDX_MAP[channel] ?? idx;
      const [valueType, valueBytes] = await this.serde.dumpsTyped(value);
      writesData.push({
        task_id: taskId,
        task_path: taskPath,
        channel,
        write_idx: writeIdx,
        value_type: valueType,
        value_data: Buffer.from(valueBytes).toString('base64'),
      });
    }

    const writeMeta = JSON.stringify({
      type: 'pending_writes',
      checkpoint_id: checkpointId,
      writes: writesData,
    });

    const cloudMessage = new TextMessage({
      role: 'system',
      content: 'pending_writes',
      meta: writeMeta,
    });

    try {
      await client.addMessages(this._spaceId, writesSessionId, [cloudMessage]);
    } catch (error) {
      if (error instanceof APIException && error.statusCode === 404) {
        logger.info(`Writes session ${writesSessionId} not found, creating it`);
        try {
          await client.createMemorySession(this._spaceId, writesSessionId);
        } catch {
          // Python swallows this too: the create may race another writer.
        }
        try {
          await client.addMessages(this._spaceId, writesSessionId, [cloudMessage]);
        } catch (retryError) {
          logger.exception(
            `Failed to put_writes for session ${sessionId} after retry: ` +
              `${_errorText(retryError)}`,
          );
        }
      } else {
        logger.exception(`Failed to put_writes for session ${sessionId}: ${_errorText(error)}`);
      }
    }
  }

  /** `list`/`alist` implementation for a given client. */
  private async _listWith(
    client: MemoryClient,
    config: RunnableConfig | null | undefined,
    options: CheckpointListOptions,
  ): Promise<CheckpointTuple[]> {
    if (config === null || config === undefined) {
      return [];
    }

    const runtimeConfig = this._getRuntimeConfig(config);
    const sessionId = runtimeConfig.sessionId;

    let messages: MessageInfo[];
    try {
      const result = await client.listMessages(
        this._spaceId,
        sessionId,
        options.limit ?? this._maxMessages,
        0,
      );
      messages = result?.items ?? [];
    } catch (error) {
      logger.exception(`Failed to list checkpoints: ${_errorText(error)}`);
      return [];
    }

    if (!messages || messages.length === 0) {
      return [];
    }

    const tuple = await this._buildTuple(client, runtimeConfig, messages, null, false);
    return tuple ? [tuple] : [];
  }

  /** `deleteThread`/`adeleteThread` implementation for a given client. */
  private async _deleteThreadWith(client: MemoryClient, threadId: string): Promise<void> {
    const writesSessionId = AgentArtsMemorySessionSaver._writesSessionId(threadId);
    try {
      // The writes session may not exist -- log at debug level.
      try {
        await client.deleteSession(this._spaceId, writesSessionId);
      } catch (error) {
        logger.debug(`Failed to delete writes session for thread ${threadId}: ${_errorText(error)}`);
      }

      try {
        await client.deleteSession(this._spaceId, threadId);
      } catch (error) {
        logger.exception(`Failed to delete session for thread ${threadId}: ${_errorText(error)}`);
      }
    } finally {
      // Clean up the persisted count tracking regardless of the outcome.
      this._persistedCount.delete(threadId);
    }
  }

  /**
   * Get a checkpoint tuple from the memory service.
   *
   * @param config Runnable config containing `thread_id` and optionally
   *   `checkpoint_id`.
   * @returns The checkpoint tuple when messages were found, `undefined` otherwise.
   */
  override async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    return await this._getTupleWith(this._client, config);
  }

  /** `Checkpoint` accessor kept for parity with the Python `get()` override. */
  override async get(config: RunnableConfig): Promise<Checkpoint | undefined> {
    const value = await this.getTuple(config);
    return value ? value.checkpoint : undefined;
  }

  /**
   * Store a checkpoint in the memory service.
   *
   * @param config Runnable config containing `thread_id`.
   * @param checkpoint Checkpoint data to store.
   * @param metadata Checkpoint metadata.
   * @param _newVersions New channel versions (unused, same as Python).
   * @returns The (unchanged) runnable config.
   */
  override async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
    _newVersions?: Record<string, string | number>,
  ): Promise<RunnableConfig> {
    return await this._putWith(this._client, config, checkpoint, metadata);
  }

  /**
   * Store intermediate writes linked to a checkpoint.
   *
   * Writes are stored as messages in a dedicated writes session (UUID5-derived
   * from the session ID), separate from the conversation messages. Each call
   * produces one message containing all writes serialized via the serde;
   * idempotency is handled on the read side. If the writes session does not
   * exist (HTTP 404), it is created and the write is retried.
   *
   * @param config Runnable config containing `thread_id` and `checkpoint_id`.
   * @param writes `[channel, value]` pairs to store.
   * @param taskId Task identifier.
   * @param taskPath Task path (optional).
   */
  override async putWrites(
    config: RunnableConfig,
    writes: PendingWrite[],
    taskId: string,
    taskPath = '',
  ): Promise<void> {
    await this._putWritesWith(this._client, config, writes, taskId, taskPath);
  }

  /**
   * List checkpoints for a given thread.
   *
   * LangGraph JS models this as an `AsyncGenerator` (Python returns a list), so
   * the single tuple built from the backend messages is yielded.
   */
  override async *list(
    config: RunnableConfig | null | undefined,
    options: CheckpointListOptions = {},
  ): AsyncGenerator<CheckpointTuple> {
    const tuples = await this._listWith(this._client, config, options);
    for (const tuple of tuples) {
      yield tuple;
    }
  }

  /**
   * Delete all checkpoints and writes for a thread.
   *
   * Deletes both the main session (conversation messages) and the writes session
   * (pending writes). Deletion is soft; the backend cleans up the associated
   * data asynchronously.
   *
   * @param threadId Thread ID (= session ID) to delete.
   */
  override async deleteThread(threadId: string): Promise<void> {
    await this._deleteThreadWith(this._client, threadId);
  }

  /** Close the underlying `MemoryClient` connections. */
  async close(): Promise<void> {
    await this._client.close();
  }

  /** Close both the sync and async client connections. */
  async aclose(): Promise<void> {
    await this.close();
    await this._asyncClient.close();
  }

  /**
   * Asynchronously get a checkpoint tuple from the memory service.
   *
   * Uses `AsyncMemoryClient` for native async HTTP calls.
   */
  async agetTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    return await this._getTupleWith(this._asyncClient, config);
  }

  /** Asynchronously store a checkpoint in the memory service. */
  async aput(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
    newVersions?: Record<string, string | number>,
  ): Promise<RunnableConfig> {
    void newVersions;
    return await this._putWith(this._asyncClient, config, checkpoint, metadata);
  }

  /** Async version of `putWrites` (see {@link putWrites} for details). */
  async aputWrites(
    config: RunnableConfig,
    writes: PendingWrite[],
    taskId: string,
    taskPath = '',
  ): Promise<void> {
    await this._putWritesWith(this._asyncClient, config, writes, taskId, taskPath);
  }

  /** Asynchronously list checkpoints for a given thread. */
  async alist(
    config: RunnableConfig | null | undefined,
    options: CheckpointListOptions = {},
  ): Promise<CheckpointTuple[]> {
    return await this._listWith(this._asyncClient, config, options);
  }

  /** Asynchronously delete all checkpoints and writes for a thread. */
  async adeleteThread(threadId: string): Promise<void> {
    await this._deleteThreadWith(this._asyncClient, threadId);
  }
}

/** Parse `meta` and return `null` when it cannot be parsed as a JSON object. */
function _parseMetaOrNull(meta: unknown): Record<string, any> | null {
  if (!meta) {
    return null;
  }
  if (typeof meta === 'object') {
    return { ...(meta as Record<string, any>) };
  }
  if (typeof meta === 'string') {
    try {
      const parsed = JSON.parse(meta);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, any>;
      }
      return null;
    } catch {
      return null;
    }
  }
  return null;
}
