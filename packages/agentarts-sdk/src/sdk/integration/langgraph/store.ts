/**
 * AgentArts Memory Store for LangGraph.
 *
 * Mirrors `agentarts/sdk/integration/langgraph/store.py`: a `BaseStore`
 * implementation backed by the AgentArts Memory service, enabling cross-thread
 * memory storage with semantic search.
 *
 * Design (方案 D, same as Python):
 * - Namespace: hierarchical path, e.g. `["memories"]` or `["memories", "user-001"]`.
 * - Filter: exact `actor_id` / `assistant_id` / `session_id` filtering.
 * - Query: semantic search.
 *
 * JS specifics:
 * - LangGraph JS models every operation as Promise based, so `batch` is async and
 *   the per-operation handlers (`_handlePut`, ...) are async too. The Python
 *   `abatch`/`_async_handle_*` pair is kept and uses the `AsyncMemoryClient`.
 * - `Item`/`SearchItem` are plain interfaces in LangGraph JS (no runtime
 *   constructors), so plain objects with `createdAt`/`updatedAt` `Date` values are
 *   returned.
 */

import { BaseStore } from '@langchain/langgraph';
import type {
  GetOperation,
  Item,
  ListNamespacesOperation,
  Operation,
  OperationResults,
  PutOperation,
  SearchOperation,
} from '@langchain/langgraph';

import {
  AsyncMemoryClient,
  MemoryClient,
  MemoryListFilter,
  MemorySearchFilter,
  TextMessage,
} from '../../memory/index.js';
import type { JsonDict, MemoryInfo } from '../../memory/index.js';
import { getRegion } from '../../utils/constant.js';
import { getLogger } from '../../utils/logging.js';

const logger = getLogger('sdk.integration.langgraph.store');

/**
 * A search result item.
 *
 * LangGraph JS does not re-export `SearchItem`, so the interface from
 * `langgraph-checkpoint`'s store base is declared here.
 */
export interface SearchItem extends Item {
  /** Relevance/similarity score; absent when the operation was not ranked. */
  score?: number | null;
}

/** Options accepted by {@link AgentArtsMemoryStore}. */
export interface AgentArtsMemoryStoreOptions {
  /** Space ID for the memory service (required). */
  spaceId: string;
  /** Huawei Cloud region name, defaults to the SDK environment detection. */
  region?: string | null;
  /** API Key for data plane authentication (falls back to the environment). */
  apiKey?: string | null;
  /**
   * SSL verification setting (default `true`): `true` verifies with the system CA
   * bundle, `false` skips verification, a string is a custom CA file path.
   */
  verifySsl?: boolean | string;
}

/** Epoch used when a timestamp cannot be parsed (Python `_EPOCH`). */
const EPOCH = new Date(0);

/** Format an unknown thrown value the way Python's `str(e)` would. */
function _errorText(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/** Python truthiness (`if value:`) for values coming from a store operation. */
function _isTruthy(value: unknown): boolean {
  if (
    value === null ||
    value === undefined ||
    value === false ||
    value === 0 ||
    value === ''
  ) {
    return false;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>).length > 0;
  }
  return true;
}

/** `json.dumps(value, ensure_ascii=False, default=str)` for non-serializable values. */
function _jsonDumps(value: unknown): string {
  return JSON.stringify(value, (_key, item) => {
    if (typeof item === 'bigint') {
      return item.toString();
    }
    if (typeof item === 'function') {
      return String(item);
    }
    if (item === undefined) {
      return null;
    }
    return item;
  });
}

/** Python tuple ordering: element-wise, shorter prefix first. */
function _compareNamespace(a: string[], b: string[]): number {
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const left = a[index]!;
    const right = b[index]!;
    if (left < right) return -1;
    if (left > right) return 1;
  }
  return a.length - b.length;
}

/** `SearchOperation` discriminator (LangGraph JS operations carry no type tag). */
function _isSearchOperation(op: Operation): op is SearchOperation {
  return 'namespacePrefix' in op;
}

/** `ListNamespacesOperation` discriminator. */
function _isListNamespacesOperation(op: Operation): op is ListNamespacesOperation {
  return 'matchConditions' in op || 'maxDepth' in op;
}

/** `PutOperation` discriminator (`delete()` sends `value: null`). */
function _isPutOperation(op: Operation): op is PutOperation {
  return 'namespace' in op && 'key' in op && 'value' in op;
}

/** `GetOperation` discriminator. */
function _isGetOperation(op: Operation): op is GetOperation {
  return 'namespace' in op && 'key' in op;
}

/**
 * AgentArts Memory Store for LangGraph cross-thread memory.
 *
 * ```ts
 * const store = new AgentArtsMemoryStore({ spaceId: 'your-space-id', apiKey: 'your-api-key' });
 * await store.put(['memories', 'user-001'], 'msg-1', {
 *   content: 'I prefer dark mode',
 *   actor_id: 'user-001',
 *   session_id: 'session-xyz',
 * });
 * const results = await store.search(['memories'], {
 *   query: 'user preferences',
 *   filter: { actor_id: 'user-001' },
 *   limit: 5,
 * });
 * ```
 */
export class AgentArtsMemoryStore extends BaseStore {
  /** Whether the store supports time-to-live (Python `supports_ttl`). */
  static readonly supportsTtl = false;

  private _spaceId: string;
  private _region: string;
  private _apiKey?: string | null;
  private _verifySsl: boolean | string;

  private _client: MemoryClient;
  private _asyncClient: AsyncMemoryClient;

  constructor(options: AgentArtsMemoryStoreOptions) {
    super();

    this._spaceId = options.spaceId;
    this._region = options.region || getRegion();
    this._apiKey = options.apiKey;
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

  /** Whether the store supports time-to-live (instance side of `supportsTtl`). */
  get supportsTtl(): boolean {
    return AgentArtsMemoryStore.supportsTtl;
  }

  /** Close the underlying `MemoryClient` connections. */
  async close(): Promise<void> {
    await this._client.close();
  }

  /**
   * Execute multiple operations in a single batch.
   *
   * @param operations The operations to execute.
   * @returns The results corresponding to each operation.
   */
  override async batch<Op extends Operation[]>(operations: Op): Promise<OperationResults<Op>> {
    const results: any[] = [];

    for (const op of operations) {
      if (_isPutOperation(op)) {
        await this._handlePut(op);
        results.push(undefined);
      } else if (_isSearchOperation(op)) {
        results.push(await this._handleSearch(op));
      } else if (_isGetOperation(op)) {
        results.push(await this._handleGet(op));
      } else if (_isListNamespacesOperation(op)) {
        results.push(await this._handleListNamespaces(op));
      } else {
        throw new Error(`Unknown operation type: ${_describeType(op)}`);
      }
    }

    return results as unknown as OperationResults<Op>;
  }

  /** Execute multiple operations asynchronously (Python `abatch`). */
  async abatch<Op extends Operation[]>(operations: Op): Promise<OperationResults<Op>> {
    const results: any[] = [];

    for (const op of operations) {
      if (_isPutOperation(op)) {
        await this._asyncHandlePut(op);
        results.push(undefined);
      } else if (_isSearchOperation(op)) {
        results.push(await this._asyncHandleSearch(op));
      } else if (_isGetOperation(op)) {
        results.push(await this._asyncHandleGet(op));
      } else if (_isListNamespacesOperation(op)) {
        results.push(await this._asyncHandleListNamespaces(op));
      } else {
        throw new Error(`Unknown operation type: ${_describeType(op)}`);
      }
    }

    return results as unknown as OperationResults<Op>;
  }

  /**
   * Handle `PutOperation` by adding messages to trigger backend memory extraction.
   *
   * - `value === null`: delete operation (calls `deleteMemory` with the key as
   *   the memory ID).
   * - otherwise `value` must contain `session_id` plus the content/metadata.
   */
  protected async _handlePut(op: PutOperation): Promise<void> {
    if (op.value === null || op.value === undefined) {
      // Delete operation: delete the memory by memory_id.
      try {
        await this._client.deleteMemory(this._spaceId, op.key);
        logger.debug(`Deleted memory ${op.key}`);
      } catch (error) {
        const errorStr = _errorText(error).toLowerCase();
        if (errorStr.includes('not found') || errorStr.includes('404')) {
          logger.debug(`Memory ${op.key} not found for deletion`);
        } else {
          logger.exception(`Failed to delete memory ${op.key}: ${_errorText(error)}`);
        }
      }
      return;
    }

    const sessionId = op.value['session_id'];
    if (!sessionId) {
      throw new Error(
        "value must contain 'session_id' for Put operation. " +
          'AgentArts Memory service requires a session to add messages. ' +
          "Example: store.put(ns, key, {'content': '...', 'session_id': 'session-xxx'})",
      );
    }

    let content = op.value['content'];
    if (!_isTruthy(content)) {
      // Serialize the entire value (minus session_id) as the content.
      const valueCopy: JsonDict = {};
      for (const [key, value] of Object.entries(op.value)) {
        if (key !== 'session_id') {
          valueCopy[key] = value;
        }
      }
      content = _jsonDumps(valueCopy);
    }

    const actorId = op.value['actor_id'];
    const assistantId = op.value['assistant_id'];

    const meta = {
      store_key: op.key,
      store_namespace: [...op.namespace],
    };

    const message = new TextMessage({
      role: 'user',
      content: typeof content === 'string' ? content : _jsonDumps(content),
      actorId: actorId ?? null,
      assistantId: assistantId ?? null,
      meta: _jsonDumps(meta),
    });

    try {
      await this._client.addMessages(this._spaceId, sessionId as string, [message]);
      logger.debug(`Added message to session ${sessionId} for namespace ${op.namespace}`);
    } catch (error) {
      logger.exception(`Failed to put item: ${_errorText(error)}`);
    }
  }

  /** Async version of {@link _handlePut}. */
  protected async _asyncHandlePut(op: PutOperation): Promise<void> {
    if (op.value === null || op.value === undefined) {
      try {
        await this._asyncClient.deleteMemory(this._spaceId, op.key);
        logger.debug(`Deleted memory ${op.key}`);
      } catch (error) {
        const errorStr = _errorText(error).toLowerCase();
        if (errorStr.includes('not found') || errorStr.includes('404')) {
          logger.debug(`Memory ${op.key} not found for deletion`);
        } else {
          logger.exception(`Failed to delete memory ${op.key}: ${_errorText(error)}`);
        }
      }
      return;
    }

    const sessionId = op.value['session_id'];
    if (!sessionId) {
      throw new Error(
        "value must contain 'session_id' for Put operation. " +
          'AgentArts Memory service requires a session to add messages. ' +
          "Example: store.put(ns, key, {'content': '...', 'session_id': 'session-xxx'})",
      );
    }

    let content = op.value['content'];
    if (!_isTruthy(content)) {
      const valueCopy: JsonDict = {};
      for (const [key, value] of Object.entries(op.value)) {
        if (key !== 'session_id') {
          valueCopy[key] = value;
        }
      }
      content = _jsonDumps(valueCopy);
    }

    const actorId = op.value['actor_id'];
    const assistantId = op.value['assistant_id'];

    const meta = {
      store_key: op.key,
      store_namespace: [...op.namespace],
    };

    const message = new TextMessage({
      role: 'user',
      content: typeof content === 'string' ? content : _jsonDumps(content),
      actorId: actorId ?? null,
      assistantId: assistantId ?? null,
      meta: _jsonDumps(meta),
    });

    try {
      await this._asyncClient.addMessages(this._spaceId, sessionId as string, [message]);
      logger.debug(`Added message to session ${sessionId} for namespace ${op.namespace}`);
    } catch (error) {
      logger.exception(`Failed to put item: ${_errorText(error)}`);
    }
  }

  /**
   * Handle `GetOperation` by retrieving a specific memory by key (memory ID).
   *
   * @returns The item when found, `null` when the memory does not exist.
   */
  protected async _handleGet(op: GetOperation): Promise<Item | null> {
    try {
      const memoryInfo = await this._client.getMemory(this._spaceId, op.key);
      return this._convertMemoryToItem(memoryInfo, op.namespace);
    } catch (error) {
      const errorStr = _errorText(error).toLowerCase();
      if (errorStr.includes('not found') || errorStr.includes('404')) {
        logger.debug(`Memory ${op.key} not found`);
        return null;
      }
      logger.exception(`Failed to get memory ${op.key}: ${_errorText(error)}`);
      throw error;
    }
  }

  /** Async version of {@link _handleGet}. */
  protected async _asyncHandleGet(op: GetOperation): Promise<Item | null> {
    try {
      const memoryInfo = await this._asyncClient.getMemory(this._spaceId, op.key);
      return this._convertMemoryToItem(memoryInfo, op.namespace);
    } catch (error) {
      const errorStr = _errorText(error).toLowerCase();
      if (errorStr.includes('not found') || errorStr.includes('404')) {
        logger.debug(`Memory ${op.key} not found`);
        return null;
      }
      logger.exception(`Failed to get memory ${op.key}: ${_errorText(error)}`);
      throw error;
    }
  }

  /**
   * Handle `SearchOperation` by semantic search with query and filter.
   *
   * - `namespacePrefix`: organizational path (unused for backend filtering).
   * - `query`: semantic search string.
   * - `filter`: `actor_id`/`assistant_id`/`session_id` filtering.
   * - `limit`: maximum results (`top_k`).
   */
  protected async _handleSearch(op: SearchOperation): Promise<SearchItem[]> {
    if (!op.query) {
      return await this._handleSearchWithoutQuery(op);
    }

    const searchFilter = new MemorySearchFilter({
      query: op.query,
      topK: op.limit ?? null,
      minScore: 0.0,
    });

    if (op.filter) {
      if ('actor_id' in op.filter) {
        searchFilter.actorId = op.filter['actor_id'];
      }
      if ('assistant_id' in op.filter) {
        searchFilter.assistantId = op.filter['assistant_id'];
      }
      if ('session_id' in op.filter) {
        searchFilter.sessionId = op.filter['session_id'];
      }
      if ('strategy_type' in op.filter) {
        searchFilter.strategyType = op.filter['strategy_type'];
      }
      if ('memory_type' in op.filter) {
        searchFilter.memoryType = op.filter['memory_type'];
      }
    }

    try {
      const response = await this._client.searchMemories(this._spaceId, searchFilter);
      return this._convertSearchResultsToItems(
        response?.results ?? [],
        op.namespacePrefix,
      );
    } catch (error) {
      logger.exception(`Failed to search memories: ${_errorText(error)}`);
      return [];
    }
  }

  /** Async version of {@link _handleSearch}. */
  protected async _asyncHandleSearch(op: SearchOperation): Promise<SearchItem[]> {
    if (!op.query) {
      return await this._asyncHandleSearchWithoutQuery(op);
    }

    const searchFilter = new MemorySearchFilter({
      query: op.query,
      topK: op.limit ?? null,
      minScore: 0.0,
    });

    if (op.filter) {
      if ('actor_id' in op.filter) {
        searchFilter.actorId = op.filter['actor_id'];
      }
      if ('assistant_id' in op.filter) {
        searchFilter.assistantId = op.filter['assistant_id'];
      }
      if ('session_id' in op.filter) {
        searchFilter.sessionId = op.filter['session_id'];
      }
      if ('strategy_type' in op.filter) {
        searchFilter.strategyType = op.filter['strategy_type'];
      }
      if ('memory_type' in op.filter) {
        searchFilter.memoryType = op.filter['memory_type'];
      }
    }

    try {
      const response = await this._asyncClient.searchMemories(this._spaceId, searchFilter);
      return this._convertSearchResultsToItems(
        response?.results ?? [],
        op.namespacePrefix,
      );
    } catch (error) {
      logger.exception(`Failed to search memories: ${_errorText(error)}`);
      return [];
    }
  }

  /** Handle `SearchOperation` without a query using `listMemories`. */
  protected async _handleSearchWithoutQuery(op: SearchOperation): Promise<SearchItem[]> {
    const listFilter = new MemoryListFilter();
    if (op.filter) {
      if ('actor_id' in op.filter) {
        listFilter.actorId = op.filter['actor_id'];
      }
      if ('assistant_id' in op.filter) {
        listFilter.assistantId = op.filter['assistant_id'];
      }
      if ('session_id' in op.filter) {
        listFilter.sessionId = op.filter['session_id'];
      }
      if ('strategy_type' in op.filter) {
        listFilter.strategyType = op.filter['strategy_type'];
      }
    }

    // memory_type post-filter (`MemoryListFilter` has no memory_type field).
    const targetMemoryType = op.filter ? op.filter['memory_type'] : null;

    try {
      const response = await this._client.listMemories(
        this._spaceId,
        op.limit ?? 10,
        op.offset ?? 0,
        listFilter,
      );

      const items: SearchItem[] = [];
      for (const mem of response?.items ?? []) {
        if (targetMemoryType !== null && targetMemoryType !== undefined) {
          if (this._getRecordAttr(mem, 'memory_type', 'memoryType') !== targetMemoryType) {
            continue;
          }
        }
        items.push({
          namespace: op.namespacePrefix,
          key: this._getAttr(mem, 'id'),
          value: {
            content: this._getRecordAttr(mem, 'content', 'content', ''),
            strategy_type: this._getRecordAttr(mem, 'strategy_type', 'strategyType'),
            actor_id: this._getRecordAttr(mem, 'actor_id', 'actorId'),
            assistant_id: this._getRecordAttr(mem, 'assistant_id', 'assistantId'),
            session_id: this._getRecordAttr(mem, 'session_id', 'sessionId'),
            memory_type: this._getRecordAttr(mem, 'memory_type', 'memoryType'),
          },
          createdAt: this._parseDatetime(
            this._getRecordAttr(mem, 'created_at', 'createdAt'),
          ),
          updatedAt: this._parseDatetime(
            this._getRecordAttr(mem, 'updated_at', 'updatedAt'),
          ),
          score: null,
        });
      }
      return items;
    } catch (error) {
      logger.exception(`Failed to list memories: ${_errorText(error)}`);
      return [];
    }
  }

  /** Async version of {@link _handleSearchWithoutQuery}. */
  protected async _asyncHandleSearchWithoutQuery(op: SearchOperation): Promise<SearchItem[]> {
    const listFilter = new MemoryListFilter();
    if (op.filter) {
      if ('actor_id' in op.filter) {
        listFilter.actorId = op.filter['actor_id'];
      }
      if ('assistant_id' in op.filter) {
        listFilter.assistantId = op.filter['assistant_id'];
      }
      if ('session_id' in op.filter) {
        listFilter.sessionId = op.filter['session_id'];
      }
      if ('strategy_type' in op.filter) {
        listFilter.strategyType = op.filter['strategy_type'];
      }
    }

    // memory_type post-filter (`MemoryListFilter` has no memory_type field).
    const targetMemoryType = op.filter ? op.filter['memory_type'] : null;

    try {
      const response = await this._asyncClient.listMemories(
        this._spaceId,
        op.limit ?? 10,
        op.offset ?? 0,
        listFilter,
      );

      const items: SearchItem[] = [];
      for (const mem of response?.items ?? []) {
        if (targetMemoryType !== null && targetMemoryType !== undefined) {
          if (this._getRecordAttr(mem, 'memory_type', 'memoryType') !== targetMemoryType) {
            continue;
          }
        }
        items.push({
          namespace: op.namespacePrefix,
          key: this._getAttr(mem, 'id'),
          value: {
            content: this._getRecordAttr(mem, 'content', 'content', ''),
            strategy_type: this._getRecordAttr(mem, 'strategy_type', 'strategyType'),
            actor_id: this._getRecordAttr(mem, 'actor_id', 'actorId'),
            assistant_id: this._getRecordAttr(mem, 'assistant_id', 'assistantId'),
            session_id: this._getRecordAttr(mem, 'session_id', 'sessionId'),
            memory_type: this._getRecordAttr(mem, 'memory_type', 'memoryType'),
          },
          createdAt: this._parseDatetime(
            this._getRecordAttr(mem, 'created_at', 'createdAt'),
          ),
          updatedAt: this._parseDatetime(
            this._getRecordAttr(mem, 'updated_at', 'updatedAt'),
          ),
          score: null,
        });
      }
      return items;
    } catch (error) {
      logger.exception(`Failed to list memories: ${_errorText(error)}`);
      return [];
    }
  }

  /**
   * Handle `ListNamespacesOperation` by extracting unique namespace combinations.
   *
   * Uses `listMemories`, extracts `store_namespace` from the memory metadata and
   * applies the prefix/suffix/max-depth filtering.
   */
  protected async _handleListNamespaces(
    op: ListNamespacesOperation,
  ): Promise<string[][]> {
    const maxLimit = Math.min(op.limit * 10, 1000);

    try {
      const response = await this._client.listMemories(this._spaceId, maxLimit, 0);

      const seen = new Map<string, string[]>();
      for (const mem of response?.items ?? []) {
        const namespace = this._extractNamespaceFromMemory(mem);
        if (namespace && namespace.length > 0) {
          seen.set(JSON.stringify(namespace), namespace);
        }
      }

      let namespaces = [...seen.values()].sort(_compareNamespace);

      if (op.matchConditions && op.matchConditions.length > 0) {
        namespaces = namespaces.filter((ns) =>
          op.matchConditions!.every((condition) => this._matchesCondition(ns, condition)),
        );
      }

      if (op.maxDepth !== null && op.maxDepth !== undefined) {
        const truncated = new Map<string, string[]>();
        for (const ns of namespaces) {
          const sliced = ns.slice(0, op.maxDepth);
          truncated.set(JSON.stringify(sliced), sliced);
        }
        namespaces = [...truncated.values()].sort(_compareNamespace);
      }

      return namespaces.slice(op.offset, op.offset + op.limit);
    } catch (error) {
      logger.exception(`Failed to list namespaces: ${_errorText(error)}`);
      return [];
    }
  }

  /** Async version of {@link _handleListNamespaces}. */
  protected async _asyncHandleListNamespaces(
    op: ListNamespacesOperation,
  ): Promise<string[][]> {
    const maxLimit = Math.min(op.limit * 10, 1000);

    try {
      const response = await this._asyncClient.listMemories(this._spaceId, maxLimit, 0);

      const seen = new Map<string, string[]>();
      for (const mem of response?.items ?? []) {
        const namespace = this._extractNamespaceFromMemory(mem);
        if (namespace && namespace.length > 0) {
          seen.set(JSON.stringify(namespace), namespace);
        }
      }

      let namespaces = [...seen.values()].sort(_compareNamespace);

      if (op.matchConditions && op.matchConditions.length > 0) {
        namespaces = namespaces.filter((ns) =>
          op.matchConditions!.every((condition) => this._matchesCondition(ns, condition)),
        );
      }

      if (op.maxDepth !== null && op.maxDepth !== undefined) {
        const truncated = new Map<string, string[]>();
        for (const ns of namespaces) {
          const sliced = ns.slice(0, op.maxDepth);
          truncated.set(JSON.stringify(sliced), sliced);
        }
        namespaces = [...truncated.values()].sort(_compareNamespace);
      }

      return namespaces.slice(op.offset, op.offset + op.limit);
    } catch (error) {
      logger.exception(`Failed to list namespaces: ${_errorText(error)}`);
      return [];
    }
  }

  /** Convert a `MemoryInfo` to a LangGraph `Item`. */
  protected _convertMemoryToItem(memoryInfo: MemoryInfo, namespace: string[]): Item {
    return {
      namespace,
      key: this._getAttr(memoryInfo, 'id'),
      value: {
        content: this._getRecordAttr(memoryInfo, 'content', 'content', ''),
        strategy_type: this._getRecordAttr(memoryInfo, 'strategy_type', 'strategyType'),
        actor_id: this._getRecordAttr(memoryInfo, 'actor_id', 'actorId'),
        assistant_id: this._getRecordAttr(memoryInfo, 'assistant_id', 'assistantId'),
        session_id: this._getRecordAttr(memoryInfo, 'session_id', 'sessionId'),
      },
      createdAt: this._parseDatetime(
        this._getRecordAttr(memoryInfo, 'created_at', 'createdAt'),
      ),
      updatedAt: this._parseDatetime(
        this._getRecordAttr(memoryInfo, 'updated_at', 'updatedAt'),
      ),
    };
  }

  /** Convert search results to a LangGraph `SearchItem` list. */
  protected _convertSearchResultsToItems(
    results: JsonDict[],
    namespace: string[],
  ): SearchItem[] {
    const items: SearchItem[] = [];

    for (const result of results) {
      const record = result?.['record'];
      const score = result?.['score'];

      if (!record) {
        continue;
      }

      const recordNamespace = this._extractNamespaceFromMemory(record) ?? namespace;

      const recordId = this._getAttr(record, 'id');
      const recordContent = this._getAttr(record, 'content', '');
      const recordStrategyType = this._getRecordAttr(record, 'strategy_type', 'strategyType');
      const recordActorId = this._getRecordAttr(record, 'actor_id', 'actorId');
      const recordAssistantId = this._getRecordAttr(record, 'assistant_id', 'assistantId');
      const recordSessionId = this._getRecordAttr(record, 'session_id', 'sessionId');
      const recordCreatedAt = this._getRecordAttr(record, 'created_at', 'createdAt');
      const recordUpdatedAt = this._getRecordAttr(record, 'updated_at', 'updatedAt');

      items.push({
        namespace: recordNamespace,
        key: recordId,
        value: {
          content: recordContent,
          strategy_type: recordStrategyType,
          actor_id: recordActorId,
          assistant_id: recordAssistantId,
          session_id: recordSessionId,
        },
        createdAt: this._parseDatetime(recordCreatedAt),
        updatedAt: this._parseDatetime(recordUpdatedAt),
        score: score !== null && score !== undefined ? Number(score) : null,
      });
    }

    return items;
  }

  /** Get an attribute from a record (plain object or SDK model), Python `_get_attr`. */
  protected _getAttr(obj: any, attr: string, defaultValue: any = null): any {
    if (obj === null || obj === undefined) {
      return defaultValue;
    }
    if (typeof obj === 'object' || typeof obj === 'function') {
      const value = obj[attr];
      return value === undefined ? defaultValue : value;
    }
    return defaultValue;
  }

  /**
   * Read a backend record field.
   *
   * Search results carry the raw backend payload (snake_case keys), while SDK
   * models such as `MemoryInfo` expose camelCase fields; both are accepted.
   */
  protected _getRecordAttr(
    record: any,
    snakeKey: string,
    camelKey: string,
    defaultValue: any = null,
  ): any {
    if (record === null || record === undefined || typeof record !== 'object') {
      return defaultValue;
    }
    const snakeValue = record[snakeKey];
    if (snakeValue !== undefined && snakeValue !== null) {
      return snakeValue;
    }
    const camelValue = record[camelKey];
    return camelValue === undefined ? defaultValue : camelValue;
  }

  /** Extract the store namespace from the memory metadata. */
  protected _extractNamespaceFromMemory(memoryInfo: any): string[] | null {
    try {
      const meta = this._getAttr(memoryInfo, 'meta');
      if (meta) {
        // The backend may return `meta` either as a JSON string or as an object.
        const metaDict = typeof meta === 'string' ? JSON.parse(meta) : meta;
        const storeNamespace = metaDict?.['store_namespace'];
        if (storeNamespace && Array.isArray(storeNamespace)) {
          return storeNamespace as string[];
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  /** Parse a datetime string/`Date`, falling back to the epoch (`1970-01-01`). */
  protected _parseDatetime(dt: string | Date | null | undefined): Date {
    if (dt === null || dt === undefined) {
      return EPOCH;
    }

    if (dt instanceof Date) {
      return dt;
    }

    if (typeof dt === 'string') {
      const ms = Date.parse(dt);
      if (Number.isNaN(ms)) {
        logger.debug(`Failed to parse datetime: ${dt}`);
        return EPOCH;
      }
      return new Date(ms);
    }

    return EPOCH;
  }

  /** Check whether a namespace matches a match condition (with `*` wildcards). */
  protected _matchesCondition(namespace: string[], condition: any): boolean {
    const matchType =
      this._getAttr(condition, 'matchType') ?? this._getAttr(condition, 'match_type');
    const path = this._getAttr(condition, 'path');

    if (!matchType || !path || path.length === 0) {
      return true;
    }

    if (matchType === 'prefix') {
      if (namespace.length < path.length) {
        return false;
      }
      return this._matchPathWithWildcards(namespace.slice(0, path.length), path);
    }
    if (matchType === 'suffix') {
      if (namespace.length < path.length) {
        return false;
      }
      return this._matchPathWithWildcards(namespace.slice(-path.length), path);
    }

    return true;
  }

  /**
   * Match a namespace path against a pattern with `*` wildcards.
   *
   * `*` matches any single namespace segment.
   */
  protected _matchPathWithWildcards(namespace: string[], path: string[]): boolean {
    if (namespace.length !== path.length) {
      return false;
    }
    for (let index = 0; index < namespace.length; index += 1) {
      const pathPart = path[index]!;
      if (pathPart !== '*' && pathPart !== namespace[index]) {
        return false;
      }
    }
    return true;
  }
}

/** Python `type(op)` for error messages. */
function _describeType(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  const name = (value as any)?.constructor?.name;
  if (typeof name === 'string' && name.length > 0) {
    return name;
  }
  return typeof value;
}
