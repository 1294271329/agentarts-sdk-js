/**
 * Agent Memory SDK Configuration Module.
 *
 * Mirrors `agentarts/sdk/memory/inner/config.py`: SDK configuration and data
 * class definitions. Every data class exposes `toDict()` (server wire format,
 * snake_case, non-empty fields only) and a static `fromDict()`.
 */

/** A plain JSON object as sent to / received from the service. */
export type JsonDict = Record<string, any>;

/** Anything that can be serialized to the service wire format. */
export interface ToDictCapable {
  toDict(): JsonDict;
}

/** Memory strategy type. */
export enum StrategyType {
  SEMANTIC = 'semantic',
  SUMMARY = 'summary',
  USER_PREFERENCE = 'user_preference',
  EPISODIC = 'episodic',
  EVENT = 'event',
  CUSTOM = 'custom',
}

/** Message role. */
export enum MessageRole {
  USER = 'user',
  ASSISTANT = 'assistant',
  TOOL = 'tool',
  SYSTEM = 'system',
}

function hasOwn(dict: JsonDict, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(dict, key);
}

/**
 * Python `dict.get(key, default)` semantics: the default only applies when the
 * key is *absent* (an explicit `null` value is preserved).
 */
function pick(dict: JsonDict, key: string, fallback: any = null): any {
  return hasOwn(dict, key) ? dict[key] : fallback;
}

/** Serialize a list, delegating to `toDict()` for model instances. */
function serializeList(items?: Array<any> | null): any[] | undefined {
  if (items === undefined || items === null) {
    return undefined;
  }
  return items.map((item) =>
    item && typeof item.toDict === 'function' ? item.toDict() : item,
  );
}

/** Friendly type description used in validation error messages. */
export function describeType(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (value === undefined) {
    return 'undefined';
  }
  const ctor = (value as any)?.constructor;
  return typeof ctor?.name === 'string' && ctor.name ? ctor.name : typeof value;
}

/** Create memory request. */
export class CreateMemoryRequest {
  content!: string;
  strategyType!: string;
  strategyId!: string;

  actorId?: string | null;
  assistantId?: string | null;
  sessionId?: string | null;
  metadata?: JsonDict | null;

  constructor(init?: Partial<CreateMemoryRequest>) {
    Object.assign(this, init ?? {});
  }

  toDict(): JsonDict {
    const result: JsonDict = {
      content: this.content,
      strategy_type: this.strategyType,
      strategy_id: this.strategyId,
    };
    if (this.actorId) {
      result['actor_id'] = this.actorId;
    }
    if (this.assistantId) {
      result['assistant_id'] = this.assistantId;
    }
    if (this.sessionId) {
      result['session_id'] = this.sessionId;
    }
    if (this.metadata) {
      result['metadata'] = this.metadata;
    }
    return result;
  }

  static fromDict(dict?: JsonDict | null): CreateMemoryRequest {
    const data = dict ?? {};
    return new CreateMemoryRequest({
      content: data['content'],
      strategyType: pick(data, 'strategy_type'),
      strategyId: pick(data, 'strategy_id'),
      actorId: pick(data, 'actor_id'),
      assistantId: pick(data, 'assistant_id'),
      sessionId: pick(data, 'session_id'),
      metadata: pick(data, 'metadata'),
    });
  }
}

/** Tag data class. */
export class Tag {
  key!: string;
  value!: string;

  constructor(init?: Partial<Tag>) {
    Object.assign(this, init ?? {});
  }

  toDict(): Record<string, string> {
    return { key: this.key, value: this.value };
  }

  static fromDict(dict?: JsonDict | null): Tag {
    const data = dict ?? {};
    return new Tag({ key: data['key'], value: data['value'] });
  }
}

/** Memory strategy configuration data class. */
export class MemoryStrategy {
  type!: string;
  parameters?: JsonDict | null;

  constructor(init?: Partial<MemoryStrategy>) {
    Object.assign(this, init ?? {});
  }

  toDict(): JsonDict {
    return { type: this.type, ...(this.parameters ?? {}) };
  }

  static fromDict(dict?: JsonDict | null): MemoryStrategy {
    const data = dict ?? {};
    return new MemoryStrategy({
      type: data['type'],
      parameters: pick(data, 'parameters'),
    });
  }
}

/** Session metadata data class. */
export class SessionMetadata {
  data: JsonDict = {};

  constructor(init?: Partial<SessionMetadata>) {
    Object.assign(this, init ?? {});
  }

  toDict(): JsonDict {
    return { ...this.data };
  }

  static fromDict(dict?: JsonDict | null): SessionMetadata {
    const data = dict ?? {};
    return new SessionMetadata({ data: { ...(data['data'] ?? data) } });
  }
}

/** Memory search filter data class - all `searchMemories` API parameters. */
export class MemorySearchFilter {
  query?: string | null;
  strategyType?: string | null;
  strategyId?: string | null;
  actorId?: string | null;
  assistantId?: string | null;
  sessionId?: string | null;
  memoryType?: 'memory' | 'episode' | 'reflection' | null;
  startTime?: number | null;
  endTime?: number | null;
  topK?: number | null;
  minScore?: number | null;
  onlyActived = false;
  rerank = true;

  constructor(init?: Partial<MemorySearchFilter>) {
    Object.assign(this, init ?? {});
  }

  /** Convert to API request body format, skipping unset values. */
  toDict(): JsonDict {
    const result: JsonDict = {};
    if (this.query !== undefined && this.query !== null) result['query'] = this.query;
    if (this.strategyType !== undefined && this.strategyType !== null) {
      result['strategy_type'] = this.strategyType;
    }
    if (this.strategyId !== undefined && this.strategyId !== null) {
      result['strategy_id'] = this.strategyId;
    }
    if (this.actorId !== undefined && this.actorId !== null) result['actor_id'] = this.actorId;
    if (this.assistantId !== undefined && this.assistantId !== null) {
      result['assistant_id'] = this.assistantId;
    }
    if (this.sessionId !== undefined && this.sessionId !== null) {
      result['session_id'] = this.sessionId;
    }
    if (this.memoryType !== undefined && this.memoryType !== null) {
      result['memory_type'] = this.memoryType;
    }
    if (this.startTime !== undefined && this.startTime !== null) {
      result['start_time'] = this.startTime;
    }
    if (this.endTime !== undefined && this.endTime !== null) result['end_time'] = this.endTime;
    if (this.topK !== undefined && this.topK !== null) result['top_k'] = this.topK;
    if (this.minScore !== undefined && this.minScore !== null) {
      result['min_score'] = this.minScore;
    }
    if (this.onlyActived !== undefined && this.onlyActived !== null) {
      result['only_actived'] = this.onlyActived;
    }
    if (this.rerank !== undefined && this.rerank !== null) result['rerank'] = this.rerank;
    return result;
  }

  static fromDict(dict?: JsonDict | null): MemorySearchFilter {
    const data = dict ?? {};
    return new MemorySearchFilter({
      query: pick(data, 'query'),
      strategyType: pick(data, 'strategy_type'),
      strategyId: pick(data, 'strategy_id'),
      actorId: pick(data, 'actor_id'),
      assistantId: pick(data, 'assistant_id'),
      sessionId: pick(data, 'session_id'),
      memoryType: pick(data, 'memory_type'),
      startTime: pick(data, 'start_time'),
      endTime: pick(data, 'end_time'),
      topK: pick(data, 'top_k'),
      minScore: pick(data, 'min_score'),
      onlyActived: pick(data, 'only_actived', false),
      rerank: pick(data, 'rerank', true),
    });
  }
}

/** Memory list filter data class - all `listMemories` filter parameters. */
export class MemoryListFilter {
  strategyType?: string | null;
  strategyId?: string | null;
  actorId?: string | null;
  assistantId?: string | null;
  sessionId?: string | null;
  startTime?: number | null;
  endTime?: number | null;
  sortBy?: 'created_at' | 'updated_at' | null;
  sortOrder?: 'asc' | 'desc' | null;

  constructor(init?: Partial<MemoryListFilter>) {
    Object.assign(this, init ?? {});
  }

  /** Convert to API request parameters, skipping unset values. */
  toDict(): JsonDict {
    const result: JsonDict = {};
    if (this.strategyType !== undefined && this.strategyType !== null) {
      result['strategy_type'] = this.strategyType;
    }
    if (this.strategyId !== undefined && this.strategyId !== null) {
      result['strategy_id'] = this.strategyId;
    }
    if (this.actorId !== undefined && this.actorId !== null) result['actor_id'] = this.actorId;
    if (this.assistantId !== undefined && this.assistantId !== null) {
      result['assistant_id'] = this.assistantId;
    }
    if (this.sessionId !== undefined && this.sessionId !== null) {
      result['session_id'] = this.sessionId;
    }
    if (this.startTime !== undefined && this.startTime !== null) {
      result['start_time'] = this.startTime;
    }
    if (this.endTime !== undefined && this.endTime !== null) result['end_time'] = this.endTime;
    if (this.sortBy !== undefined && this.sortBy !== null) result['sort_by'] = this.sortBy;
    if (this.sortOrder !== undefined && this.sortOrder !== null) {
      result['sort_order'] = this.sortOrder;
    }
    return result;
  }

  static fromDict(dict?: JsonDict | null): MemoryListFilter {
    const data = dict ?? {};
    return new MemoryListFilter({
      strategyType: pick(data, 'strategy_type'),
      strategyId: pick(data, 'strategy_id'),
      actorId: pick(data, 'actor_id'),
      assistantId: pick(data, 'assistant_id'),
      sessionId: pick(data, 'session_id'),
      startTime: pick(data, 'start_time'),
      endTime: pick(data, 'end_time'),
      sortBy: pick(data, 'sort_by'),
      sortOrder: pick(data, 'sort_order'),
    });
  }
}

/**
 * Space creation request.
 *
 * Users only care about the basic Space configuration; the SDK handles API Key
 * creation internally.
 */
export class SpaceCreateRequest {
  name!: string;
  messageTtlHours = 168;

  description?: string | null;
  memoryExtractIdleSeconds?: number | null;
  memoryExtractMaxTokens?: number | null;
  memoryExtractMaxMessages?: number | null;

  tags?: Array<Record<string, string>> | null;

  publicAccessEnable = true;
  privateVpcId?: string | null;
  privateSubnetId?: string | null;

  memoryStrategiesBuiltin?: string[] | null;
  memoryStrategiesCustomized?: JsonDict[] | null;

  constructor(init?: Partial<SpaceCreateRequest>) {
    Object.assign(this, init ?? {});
  }

  /** Convert to the backend API request dictionary. */
  toDict(): JsonDict {
    const result: JsonDict = {
      name: this.name,
      message_ttl_hours: this.messageTtlHours,
    };

    if (this.description !== undefined && this.description !== null) {
      result['description'] = this.description;
    }
    if (
      this.memoryExtractIdleSeconds !== undefined &&
      this.memoryExtractIdleSeconds !== null
    ) {
      result['memory_extract_idle_seconds'] = this.memoryExtractIdleSeconds;
    }
    if (this.memoryExtractMaxTokens !== undefined && this.memoryExtractMaxTokens !== null) {
      result['memory_extract_max_tokens'] = this.memoryExtractMaxTokens;
    }
    if (
      this.memoryExtractMaxMessages !== undefined &&
      this.memoryExtractMaxMessages !== null
    ) {
      result['memory_extract_max_messages'] = this.memoryExtractMaxMessages;
    }

    if (this.memoryStrategiesBuiltin !== undefined && this.memoryStrategiesBuiltin !== null) {
      result['memory_strategies_builtin'] = this.memoryStrategiesBuiltin;
    }
    if (
      this.memoryStrategiesCustomized !== undefined &&
      this.memoryStrategiesCustomized !== null
    ) {
      result['memory_strategies_customized'] = this.memoryStrategiesCustomized;
    }

    if (this.tags !== undefined && this.tags !== null) {
      result['tags'] = this.tags;
    }

    const networkAccess: JsonDict = {
      public_access_enable: this.publicAccessEnable,
    };
    if (
      this.privateVpcId !== undefined &&
      this.privateVpcId !== null &&
      this.privateSubnetId !== undefined &&
      this.privateSubnetId !== null
    ) {
      networkAccess['private_access_config'] = {
        enable: true,
        vpc_id: this.privateVpcId,
        subnet_id: this.privateSubnetId,
      };
    }
    result['network_access'] = networkAccess;

    return result;
  }

  static fromDict(dict?: JsonDict | null): SpaceCreateRequest {
    const data = dict ?? {};
    return new SpaceCreateRequest({
      name: data['name'],
      messageTtlHours: pick(data, 'message_ttl_hours', 168),
      description: pick(data, 'description'),
      memoryExtractIdleSeconds: pick(data, 'memory_extract_idle_seconds'),
      memoryExtractMaxTokens: pick(data, 'memory_extract_max_tokens'),
      memoryExtractMaxMessages: pick(data, 'memory_extract_max_messages'),
      tags: pick(data, 'tags'),
      publicAccessEnable: pick(data, 'public_access_enable', true),
      privateVpcId: pick(data, 'private_vpc_id'),
      privateSubnetId: pick(data, 'private_subnet_id'),
      memoryStrategiesBuiltin: pick(data, 'memory_strategies_builtin'),
      memoryStrategiesCustomized: pick(data, 'memory_strategies_customized'),
    });
  }
}

/** Space update request. */
export class SpaceUpdateRequest {
  name?: string | null;
  description?: string | null;
  messageTtlHours?: number | null;

  memoryExtractEnabled?: boolean | null;
  memoryExtractIdleSeconds?: number | null;
  memoryExtractMaxTokens?: number | null;
  memoryExtractMaxMessages?: number | null;

  tags?: Array<Record<string, string>> | null;

  memoryStrategiesBuiltin?: string[] | null;

  constructor(init?: Partial<SpaceUpdateRequest>) {
    Object.assign(this, init ?? {});
  }

  /** Convert to dictionary, skipping unset values (OpenAPI conformant). */
  toDict(): JsonDict {
    const result: JsonDict = {};

    if (this.name !== undefined && this.name !== null) result['name'] = this.name;
    if (this.description !== undefined && this.description !== null) {
      result['description'] = this.description;
    }
    if (this.messageTtlHours !== undefined && this.messageTtlHours !== null) {
      result['message_ttl_hours'] = this.messageTtlHours;
    }

    if (this.memoryExtractEnabled !== undefined && this.memoryExtractEnabled !== null) {
      result['memory_extract_enabled'] = this.memoryExtractEnabled;
    }
    if (
      this.memoryExtractIdleSeconds !== undefined &&
      this.memoryExtractIdleSeconds !== null
    ) {
      result['memory_extract_idle_seconds'] = this.memoryExtractIdleSeconds;
    }
    if (this.memoryExtractMaxTokens !== undefined && this.memoryExtractMaxTokens !== null) {
      result['memory_extract_max_tokens'] = this.memoryExtractMaxTokens;
    }
    if (
      this.memoryExtractMaxMessages !== undefined &&
      this.memoryExtractMaxMessages !== null
    ) {
      result['memory_extract_max_messages'] = this.memoryExtractMaxMessages;
    }

    if (this.memoryStrategiesBuiltin !== undefined && this.memoryStrategiesBuiltin !== null) {
      result['memory_strategies_builtin'] = this.memoryStrategiesBuiltin;
    }

    if (this.tags !== undefined && this.tags !== null) {
      result['tags'] = this.tags;
    }

    return result;
  }

  static fromDict(dict?: JsonDict | null): SpaceUpdateRequest {
    const data = dict ?? {};
    return new SpaceUpdateRequest({
      name: pick(data, 'name'),
      description: pick(data, 'description'),
      messageTtlHours: pick(data, 'message_ttl_hours'),
      memoryExtractEnabled: pick(data, 'memory_extract_enabled'),
      memoryExtractIdleSeconds: pick(data, 'memory_extract_idle_seconds'),
      memoryExtractMaxTokens: pick(data, 'memory_extract_max_tokens'),
      memoryExtractMaxMessages: pick(data, 'memory_extract_max_messages'),
      tags: pick(data, 'tags'),
      memoryStrategiesBuiltin: pick(data, 'memory_strategies_builtin'),
    });
  }
}

/** Session creation request. */
export class SessionCreateRequest {
  id?: string | null;
  actorId?: string | null;
  assistantId?: string | null;
  meta?: JsonDict | null;

  constructor(init?: Partial<SessionCreateRequest>) {
    Object.assign(this, init ?? {});
  }

  /** Convert to dictionary, skipping unset values. */
  toDict(): JsonDict {
    const result: JsonDict = {};
    if (this.id !== undefined && this.id !== null) result['id'] = this.id;
    if (this.actorId !== undefined && this.actorId !== null) result['actor_id'] = this.actorId;
    if (this.assistantId !== undefined && this.assistantId !== null) {
      result['assistant_id'] = this.assistantId;
    }
    if (this.meta !== undefined && this.meta !== null) result['meta'] = this.meta;
    return result;
  }

  static fromDict(dict?: JsonDict | null): SessionCreateRequest {
    const data = dict ?? {};
    return new SessionCreateRequest({
      id: pick(data, 'id'),
      actorId: pick(data, 'actor_id'),
      assistantId: pick(data, 'assistant_id'),
      meta: pick(data, 'meta'),
    });
  }
}

/** Asset reference (file, image, audio). */
export class AssetRef {
  assetId = '';
  uri = '';
  mime = '';
  size = 0;
  filename?: string | null;
  meta?: JsonDict | null;

  constructor(init?: Partial<AssetRef>) {
    Object.assign(this, init ?? {});
  }

  toDict(): JsonDict {
    const result: JsonDict = {
      asset_id: this.assetId,
      uri: this.uri,
      mime: this.mime,
      size: this.size,
    };
    if (this.filename) result['filename'] = this.filename;
    if (this.meta) result['meta'] = this.meta;
    return result;
  }

  static fromDict(dict?: JsonDict | null): AssetRef {
    const data = dict ?? {};
    return new AssetRef({
      assetId: pick(data, 'asset_id', ''),
      uri: pick(data, 'uri', ''),
      mime: pick(data, 'mime', ''),
      size: pick(data, 'size', 0),
      filename: pick(data, 'filename'),
      meta: pick(data, 'meta'),
    });
  }
}

/** Data message part (summary, offload index, custom data). */
export class DataMessage {
  type = 'data';
  kind = 'custom';
  covers?: string[] | null;
  content?: JsonDict | null;
  meta?: JsonDict | null;

  constructor(init?: Partial<DataMessage>) {
    Object.assign(this, init ?? {});
  }

  toDict(): JsonDict {
    const result: JsonDict = { type: this.type, kind: this.kind };
    if (this.covers) result['covers'] = this.covers;
    if (this.content) result['content'] = this.content;
    if (this.meta) result['meta'] = this.meta;
    return result;
  }

  static fromDict(dict?: JsonDict | null): DataMessage {
    const data = dict ?? {};
    return new DataMessage({
      type: pick(data, 'type', 'data'),
      kind: pick(data, 'kind', 'custom'),
      covers: pick(data, 'covers'),
      content: pick(data, 'content'),
      meta: pick(data, 'meta'),
    });
  }
}

/** Tool call message part (OpenAPI conformant). */
export class ToolCallMessage {
  type = 'tool_call';
  id = '';
  name = '';
  /** JSON-encoded arguments string, as required by the OpenAPI spec. */
  arguments: string = '';
  meta?: string | null;

  constructor(init?: Partial<ToolCallMessage> & { arguments?: any }) {
    Object.assign(this, init ?? {});
    if (this.arguments === null || this.arguments === undefined) {
      this.arguments = '';
    } else if (typeof this.arguments !== 'string') {
      this.arguments = JSON.stringify(this.arguments);
    }
  }

  toDict(): JsonDict {
    const toolCall = {
      id: this.id,
      name: this.name,
      arguments: this.arguments,
    };
    const result: JsonDict = {
      role: 'tool',
      parts: [{ type: 'tool_call', tool_call: toolCall }],
    };
    if (this.meta) result['meta'] = this.meta;
    return result;
  }

  static fromDict(dict?: JsonDict | null): ToolCallMessage {
    const data = dict ?? {};
    const parts: any[] = data['parts'] ?? [];
    const toolCall = parts[0]?.tool_call ?? {};
    return new ToolCallMessage({
      type: pick(data, 'type', 'tool_call'),
      id: pick(toolCall, 'id', ''),
      name: pick(toolCall, 'name', ''),
      arguments: pick(toolCall, 'arguments', ''),
      meta: pick(data, 'meta'),
    });
  }
}

/** Tool result message part (OpenAPI conformant). */
export class ToolResultMessage {
  type = 'tool_result';
  toolCallId = '';
  content = '';
  assetRef?: AssetRef | JsonDict | null;
  meta?: string | null;

  constructor(init?: Partial<ToolResultMessage>) {
    Object.assign(this, init ?? {});
  }

  toDict(): JsonDict {
    const assetRef =
      this.assetRef && typeof (this.assetRef as any).toDict === 'function'
        ? (this.assetRef as AssetRef).toDict()
        : (this.assetRef ?? null);
    const toolResult = {
      tool_call_id: this.toolCallId,
      content: this.content,
      asset_ref: assetRef,
    };
    const result: JsonDict = {
      role: 'tool',
      parts: [{ type: 'tool_result', tool_result: toolResult }],
    };
    if (this.meta) result['meta'] = this.meta;
    return result;
  }

  static fromDict(dict?: JsonDict | null): ToolResultMessage {
    const data = dict ?? {};
    const parts: any[] = data['parts'] ?? [];
    const toolResult = parts[0]?.tool_result ?? {};
    const assetRef = pick(toolResult, 'asset_ref');
    return new ToolResultMessage({
      type: pick(data, 'type', 'tool_result'),
      toolCallId: pick(toolResult, 'tool_call_id', ''),
      content: pick(toolResult, 'content', ''),
      assetRef: assetRef ? AssetRef.fromDict(assetRef) : assetRef,
      meta: pick(data, 'meta'),
    });
  }
}

/** A message part: any object exposing `toDict()`. */
export interface MessagePart {
  toDict(): JsonDict;
}

/** Message request (parts format; supports all message part types). */
export class MessageRequest {
  role!: string;
  parts: MessagePart[] = [];
  actorId?: string | null;
  assistantId?: string | null;
  meta?: JsonDict | null;

  constructor(init?: Partial<MessageRequest>) {
    Object.assign(this, init ?? {});

    if (!this.parts || this.parts.length === 0) {
      throw new Error('Must contain at least one message part');
    }
    if (this.parts.length > 5) {
      throw new Error('Message can contain at most 5 parts');
    }
    for (const part of this.parts) {
      if (!part || typeof part.toDict !== 'function') {
        throw new Error(
          `Message part must support toDict method, actual type: ${describeType(part)}`,
        );
      }
    }
  }

  /** Convert to dictionary, compatible with the OpenAPI spec. */
  toDict(): JsonDict {
    const result: JsonDict = {
      role: this.role,
      parts: this.parts.map((part) => part.toDict()),
    };
    if (this.actorId !== undefined && this.actorId !== null) {
      result['actor_id'] = this.actorId;
    }
    if (this.assistantId !== undefined && this.assistantId !== null) {
      result['assistant_id'] = this.assistantId;
    }
    if (this.meta !== undefined && this.meta !== null) result['meta'] = this.meta;
    return result;
  }

  static fromDict(dict?: JsonDict | null): MessageRequest {
    const data = dict ?? {};
    const rawParts: any[] = data['parts'] ?? [];
    const parts: MessagePart[] = rawParts.map((part) =>
      part && typeof part.toDict === 'function' ? part : { toDict: () => part },
    );
    return new MessageRequest({
      role: data['role'],
      parts,
      actorId: pick(data, 'actor_id'),
      assistantId: pick(data, 'assistant_id'),
      meta: pick(data, 'meta'),
    });
  }
}

/** Batch add messages request. */
export class AddMessagesRequest {
  messages: MessageRequest[] = [];
  timestamp?: number | null;
  idempotencyKey?: string | null;
  isForceExtract = false;

  constructor(init?: Partial<AddMessagesRequest>) {
    Object.assign(this, init ?? {});

    if (!this.messages || this.messages.length === 0) {
      throw new Error('Must contain at least one message');
    }
    if (this.messages.length > 100) {
      throw new Error('Batch messages can contain at most 100');
    }
    for (const message of this.messages) {
      if (!(message instanceof MessageRequest)) {
        throw new Error(
          `Message must be MessageRequest type, actual type: ${describeType(message)}`,
        );
      }
    }
  }

  /** Convert to dictionary, compatible with the OpenAPI spec. */
  toDict(): JsonDict {
    const result: JsonDict = {
      messages: this.messages.map((message) => message.toDict()),
      is_force_extract: this.isForceExtract,
    };
    if (this.timestamp !== undefined && this.timestamp !== null) {
      result['timestamp'] = this.timestamp;
    }
    if (this.idempotencyKey !== undefined && this.idempotencyKey !== null) {
      result['idempotency_key'] = this.idempotencyKey;
    }
    return result;
  }

  static fromDict(dict?: JsonDict | null): AddMessagesRequest {
    const data = dict ?? {};
    const rawMessages: any[] = data['messages'] ?? [];
    return new AddMessagesRequest({
      messages: rawMessages.map((message) => MessageRequest.fromDict(message)),
      timestamp: pick(data, 'timestamp'),
      idempotencyKey: pick(data, 'idempotency_key'),
      isForceExtract: pick(data, 'is_force_extract', false),
    });
  }
}

/** Memory search request. */
export class MemorySearchRequest {
  query?: string | null;
  topK = 10;
  minScore = 0.5;
  strategyType?: string | null;
  strategyId?: string | null;
  actorId?: string | null;
  assistantId?: string | null;
  sessionId?: string | null;
  memoryType?: string | null;
  startTime?: number | null;
  endTime?: number | null;

  constructor(init?: Partial<MemorySearchRequest>) {
    Object.assign(this, init ?? {});
  }

  /** Convert to dictionary, skipping unset values and using API defaults. */
  toDict(): JsonDict {
    const result: JsonDict = {};

    if (this.query !== undefined && this.query !== null && this.query !== '') {
      result['query'] = this.query;
    }
    if (this.topK !== 10) result['top_k'] = this.topK;
    if (this.minScore !== 0.5) result['min_score'] = this.minScore;
    if (this.strategyType !== undefined && this.strategyType !== null) {
      result['strategy_type'] = this.strategyType;
    }
    if (this.strategyId !== undefined && this.strategyId !== null) {
      result['strategy_id'] = this.strategyId;
    }
    if (this.actorId !== undefined && this.actorId !== null) result['actor_id'] = this.actorId;
    if (this.assistantId !== undefined && this.assistantId !== null) {
      result['assistant_id'] = this.assistantId;
    }
    if (this.sessionId !== undefined && this.sessionId !== null) {
      result['session_id'] = this.sessionId;
    }
    if (this.memoryType !== undefined && this.memoryType !== null) {
      result['memory_type'] = this.memoryType;
    }
    if (this.startTime !== undefined && this.startTime !== null) {
      result['start_time'] = this.startTime;
    }
    if (this.endTime !== undefined && this.endTime !== null) result['end_time'] = this.endTime;

    if (Object.keys(result).length === 0) {
      return { top_k: 10, min_score: 0.5 };
    }
    return result;
  }

  static fromDict(dict?: JsonDict | null): MemorySearchRequest {
    const data = dict ?? {};
    return new MemorySearchRequest({
      query: pick(data, 'query'),
      topK: pick(data, 'top_k', 10),
      minScore: pick(data, 'min_score', 0.5),
      strategyType: pick(data, 'strategy_type'),
      strategyId: pick(data, 'strategy_id'),
      actorId: pick(data, 'actor_id'),
      assistantId: pick(data, 'assistant_id'),
      sessionId: pick(data, 'session_id'),
      memoryType: pick(data, 'memory_type'),
      startTime: pick(data, 'start_time'),
      endTime: pick(data, 'end_time'),
    });
  }
}

/** Memory creation request. */
export class MemoryCreateRequest {
  content!: string;
  actorId?: string | null;
  assistantId?: string | null;
  sessionId?: string | null;
  extractionMeta?: JsonDict | null;

  constructor(init?: Partial<MemoryCreateRequest>) {
    Object.assign(this, init ?? {});
    if (typeof this.content === 'string' && this.content.length > 10000) {
      throw new Error('Memory content cannot exceed 10000 characters');
    }
  }

  /** Convert to dictionary, compatible with the OpenAPI spec. */
  toDict(): JsonDict {
    const result: JsonDict = { content: this.content };
    if (this.actorId !== undefined && this.actorId !== null) {
      result['actor_id'] = this.actorId;
    }
    if (this.assistantId !== undefined && this.assistantId !== null) {
      result['assistant_id'] = this.assistantId;
    }
    if (this.sessionId !== undefined && this.sessionId !== null) {
      result['session_id'] = this.sessionId;
    }
    if (this.extractionMeta !== undefined && this.extractionMeta !== null) {
      result['extraction_meta'] = this.extractionMeta;
    }
    return result;
  }

  static fromDict(dict?: JsonDict | null): MemoryCreateRequest {
    const data = dict ?? {};
    return new MemoryCreateRequest({
      content: data['content'],
      actorId: pick(data, 'actor_id'),
      assistantId: pick(data, 'assistant_id'),
      sessionId: pick(data, 'session_id'),
      extractionMeta: pick(data, 'extraction_meta'),
    });
  }
}

/** Memory update request. */
export class MemoryUpdateRequest {
  content?: string | null;
  extractionMeta?: JsonDict | null;

  constructor(init?: Partial<MemoryUpdateRequest>) {
    Object.assign(this, init ?? {});
    if (typeof this.content === 'string' && this.content.length > 10000) {
      throw new Error('Memory content cannot exceed 10000 characters');
    }
  }

  /** Convert to dictionary, compatible with the OpenAPI spec. */
  toDict(): JsonDict {
    const result: JsonDict = {};
    if (this.content !== undefined && this.content !== null) {
      result['content'] = this.content;
    }
    if (this.extractionMeta !== undefined && this.extractionMeta !== null) {
      result['extraction_meta'] = this.extractionMeta;
    }
    return result;
  }

  static fromDict(dict?: JsonDict | null): MemoryUpdateRequest {
    const data = dict ?? {};
    return new MemoryUpdateRequest({
      content: pick(data, 'content'),
      extractionMeta: pick(data, 'extraction_meta'),
    });
  }
}

/** Context compression configuration. */
export class CompressConfig {
  msgThreshold = 100;
  maxToken = 131072;
  tokenRatio = 0.75;
  lastKeep = 50;
  largePayloadThreshold = 5000;
  customPrompt?: JsonDict | null;

  constructor(init?: Partial<CompressConfig>) {
    Object.assign(this, init ?? {});
  }

  /** Convert to dictionary, skipping unset values. */
  toDict(): JsonDict {
    const result: JsonDict = {
      msg_threshold: this.msgThreshold,
      max_token: this.maxToken,
      token_ratio: this.tokenRatio,
      last_keep: this.lastKeep,
      large_payload_threshold: this.largePayloadThreshold,
    };
    if (this.customPrompt !== undefined && this.customPrompt !== null) {
      result['custom_prompt'] = this.customPrompt;
    }
    return result;
  }

  static fromDict(dict?: JsonDict | null): CompressConfig {
    const data = dict ?? {};
    return new CompressConfig({
      msgThreshold: pick(data, 'msg_threshold', 100),
      maxToken: pick(data, 'max_token', 131072),
      tokenRatio: pick(data, 'token_ratio', 0.75),
      lastKeep: pick(data, 'last_keep', 50),
      largePayloadThreshold: pick(data, 'large_payload_threshold', 5000),
      customPrompt: pick(data, 'custom_prompt'),
    });
  }
}

/** Space detailed information (return value). */
export class SpaceInfo {
  id!: string;
  name!: string;
  description?: string | null;
  messageTtlHours = 168;
  status?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;

  memoryExtractEnabled = false;
  memoryExtractIdleSeconds?: number | null;
  memoryExtractMaxTokens?: number | null;
  memoryExtractMaxMessages?: number | null;

  memoryStrategiesBuiltin?: string[] | null;
  memoryStrategiesCustomized?: JsonDict[] | null;

  vpcId?: string | null;
  subnetId?: string | null;
  publicAccess?: JsonDict | null;
  privateAccess?: JsonDict | null;

  apiKey?: string | null;
  apiKeyId?: string | null;

  publicDomain?: string | null;
  privateDomain?: string | null;
  privateIp?: string | null;

  constructor(init?: Partial<SpaceInfo>) {
    Object.assign(this, init ?? {});
  }

  toDict(): JsonDict {
    const result: JsonDict = {
      id: this.id,
      name: this.name,
      message_ttl_hours: this.messageTtlHours,
      memory_extract_enabled: this.memoryExtractEnabled,
    };
    if (this.description !== undefined && this.description !== null) {
      result['description'] = this.description;
    }
    if (this.status !== undefined && this.status !== null) result['status'] = this.status;
    if (this.createdAt !== undefined && this.createdAt !== null) {
      result['created_at'] = this.createdAt;
    }
    if (this.updatedAt !== undefined && this.updatedAt !== null) {
      result['updated_at'] = this.updatedAt;
    }
    if (
      this.memoryExtractIdleSeconds !== undefined &&
      this.memoryExtractIdleSeconds !== null
    ) {
      result['memory_extract_idle_seconds'] = this.memoryExtractIdleSeconds;
    }
    if (this.memoryExtractMaxTokens !== undefined && this.memoryExtractMaxTokens !== null) {
      result['memory_extract_max_tokens'] = this.memoryExtractMaxTokens;
    }
    if (
      this.memoryExtractMaxMessages !== undefined &&
      this.memoryExtractMaxMessages !== null
    ) {
      result['memory_extract_max_messages'] = this.memoryExtractMaxMessages;
    }
    if (this.memoryStrategiesBuiltin !== undefined && this.memoryStrategiesBuiltin !== null) {
      result['memory_strategies_builtin'] = this.memoryStrategiesBuiltin;
    }
    if (
      this.memoryStrategiesCustomized !== undefined &&
      this.memoryStrategiesCustomized !== null
    ) {
      result['memory_strategies_customized'] = this.memoryStrategiesCustomized;
    }
    if (this.vpcId !== undefined && this.vpcId !== null) result['vpc_id'] = this.vpcId;
    if (this.subnetId !== undefined && this.subnetId !== null) {
      result['subnet_id'] = this.subnetId;
    }
    if (this.publicAccess !== undefined && this.publicAccess !== null) {
      result['public_access'] = this.publicAccess;
    }
    if (this.privateAccess !== undefined && this.privateAccess !== null) {
      result['private_access'] = this.privateAccess;
    }
    if (this.apiKey !== undefined && this.apiKey !== null) result['api_key'] = this.apiKey;
    if (this.apiKeyId !== undefined && this.apiKeyId !== null) {
      result['api_key_id'] = this.apiKeyId;
    }
    if (this.publicDomain !== undefined && this.publicDomain !== null) {
      result['public_domain'] = this.publicDomain;
    }
    if (this.privateDomain !== undefined && this.privateDomain !== null) {
      result['private_domain'] = this.privateDomain;
    }
    if (this.privateIp !== undefined && this.privateIp !== null) {
      result['private_ip'] = this.privateIp;
    }
    return result;
  }

  /** Create SpaceInfo from an OpenAPI response dictionary. */
  static fromDict(dict?: JsonDict | null): SpaceInfo {
    const data = dict ?? {};
    const publicAccess = data['public_access'] || {};
    const privateAccess = data['private_access'] || {};

    return new SpaceInfo({
      id: data['id'],
      name: data['name'],
      description: pick(data, 'description'),
      messageTtlHours: pick(data, 'message_ttl_hours', 168),
      status: pick(data, 'status'),
      createdAt: pick(data, 'created_at'),
      updatedAt: pick(data, 'updated_at'),

      memoryExtractEnabled: pick(data, 'memory_extract_enabled', false),
      memoryExtractIdleSeconds: pick(data, 'memory_extract_idle_seconds'),
      memoryExtractMaxTokens: pick(data, 'memory_extract_max_tokens'),
      memoryExtractMaxMessages: pick(data, 'memory_extract_max_messages'),

      memoryStrategiesBuiltin: pick(data, 'memory_strategies_builtin'),
      memoryStrategiesCustomized: pick(data, 'memory_strategies_customized'),

      vpcId: pick(data, 'vpc_id'),
      subnetId: pick(data, 'subnet_id'),
      publicAccess,
      privateAccess,

      apiKey: pick(data, 'api_key'),
      apiKeyId: pick(data, 'api_key_id'),

      publicDomain: publicAccess ? (publicAccess['domain'] ?? null) : null,
      privateDomain: privateAccess ? (privateAccess['domain'] ?? null) : null,
      privateIp: privateAccess ? (privateAccess['ip'] ?? null) : null,
    });
  }
}

/** Space list response. */
export class SpaceListResponse {
  items: SpaceInfo[];
  total: number;
  limit: number;
  offset: number;

  constructor(init?: Partial<SpaceListResponse>) {
    this.items = init?.items ?? [];
    this.total = init?.total ?? 0;
    this.limit = init?.limit ?? 20;
    this.offset = init?.offset ?? 0;
  }

  toDict(): JsonDict {
    return {
      spaces: this.items.map((item) => item.toDict()),
      total: this.total,
      limit: this.limit,
      offset: this.offset,
    };
  }

  /** Create SpaceListResponse from an OpenAPI response dictionary. */
  static fromDict(dict?: JsonDict | null): SpaceListResponse {
    const data = dict ?? {};
    return new SpaceListResponse({
      items: (data['spaces'] ?? []).map((item: JsonDict) => SpaceInfo.fromDict(item)),
      total: pick(data, 'total', 0),
      limit: pick(data, 'limit', 20),
      offset: pick(data, 'offset', 0),
    });
  }
}

/** Session detailed information (return value). */
export class SessionInfo {
  id!: string;
  spaceId!: string;
  actorId?: string | null;
  assistantId?: string | null;
  meta?: JsonDict | null;
  createdAt?: string | null;
  updatedAt?: string | null;

  constructor(init?: Partial<SessionInfo>) {
    Object.assign(this, init ?? {});
  }

  toDict(): JsonDict {
    const result: JsonDict = { id: this.id, space_id: this.spaceId };
    if (this.actorId !== undefined && this.actorId !== null) result['actor_id'] = this.actorId;
    if (this.assistantId !== undefined && this.assistantId !== null) {
      result['assistant_id'] = this.assistantId;
    }
    if (this.meta !== undefined && this.meta !== null) result['meta'] = this.meta;
    if (this.createdAt !== undefined && this.createdAt !== null) {
      result['created_at'] = this.createdAt;
    }
    if (this.updatedAt !== undefined && this.updatedAt !== null) {
      result['updated_at'] = this.updatedAt;
    }
    return result;
  }

  /** Create SessionInfo from an OpenAPI response dictionary. */
  static fromDict(dict?: JsonDict | null): SessionInfo {
    const data = dict ?? {};
    return new SessionInfo({
      id: data['id'],
      spaceId: data['space_id'],
      actorId: pick(data, 'actor_id'),
      assistantId: pick(data, 'assistant_id'),
      meta: pick(data, 'meta'),
      createdAt: pick(data, 'created_at'),
      updatedAt: pick(data, 'updated_at'),
    });
  }
}

/** Session list response. */
export class SessionListResponse {
  items: SessionInfo[];
  total: number;
  limit: number;
  offset: number;

  constructor(init?: Partial<SessionListResponse>) {
    this.items = init?.items ?? [];
    this.total = init?.total ?? 0;
    this.limit = init?.limit ?? 20;
    this.offset = init?.offset ?? 0;
  }

  toDict(): JsonDict {
    return {
      items: this.items.map((item) => item.toDict()),
      total: this.total,
      limit: this.limit,
      offset: this.offset,
    };
  }

  /** Create SessionListResponse from an OpenAPI response dictionary. */
  static fromDict(dict?: JsonDict | null): SessionListResponse {
    const data = dict ?? {};
    return new SessionListResponse({
      items: (data['items'] ?? []).map((item: JsonDict) => SessionInfo.fromDict(item)),
      total: pick(data, 'total', 0),
      limit: pick(data, 'limit', 20),
      offset: pick(data, 'offset', 0),
    });
  }
}

/** Message detailed information (return value). */
export class MessageInfo {
  id!: string;
  sessionId!: string;
  seq!: number;
  actorId?: string | null;
  assistantId?: string | null;
  role = 'user';
  parts?: JsonDict[] | null;
  idempotencyKey?: string | null;
  meta?: JsonDict | null;
  messageTime?: number | null;
  createdAt?: string | null;

  constructor(init?: Partial<MessageInfo>) {
    Object.assign(this, init ?? {});
  }

  toDict(): JsonDict {
    const result: JsonDict = {
      id: this.id,
      session_id: this.sessionId,
      seq: this.seq,
      role: this.role,
    };
    if (this.actorId !== undefined && this.actorId !== null) result['actor_id'] = this.actorId;
    if (this.assistantId !== undefined && this.assistantId !== null) {
      result['assistant_id'] = this.assistantId;
    }
    if (this.parts !== undefined && this.parts !== null) result['parts'] = this.parts;
    if (this.idempotencyKey !== undefined && this.idempotencyKey !== null) {
      result['idempotency_key'] = this.idempotencyKey;
    }
    if (this.meta !== undefined && this.meta !== null) result['meta'] = this.meta;
    if (this.messageTime !== undefined && this.messageTime !== null) {
      result['message_time'] = this.messageTime;
    }
    if (this.createdAt !== undefined && this.createdAt !== null) {
      result['created_at'] = this.createdAt;
    }
    return result;
  }

  /** Create MessageInfo from an OpenAPI response dictionary. */
  static fromDict(dict?: JsonDict | null): MessageInfo {
    const data = dict ?? {};
    return new MessageInfo({
      id: data['id'],
      sessionId: data['session_id'],
      seq: pick(data, 'seq', 0),
      actorId: pick(data, 'actor_id'),
      assistantId: pick(data, 'assistant_id'),
      role: pick(data, 'role', 'user'),
      parts: pick(data, 'parts'),
      idempotencyKey: pick(data, 'idempotency_key'),
      meta: pick(data, 'meta'),
      messageTime: pick(data, 'message_time'),
      createdAt: pick(data, 'created_at'),
    });
  }
}

/** Message list response. */
export class MessageListResponse {
  items: MessageInfo[];
  total: number;
  limit: number;
  offset: number;

  constructor(init?: Partial<MessageListResponse>) {
    this.items = init?.items ?? [];
    this.total = init?.total ?? 0;
    this.limit = init?.limit ?? 20;
    this.offset = init?.offset ?? 0;
  }

  toDict(): JsonDict {
    return {
      items: this.items.map((item) => item.toDict()),
      total: this.total,
      limit: this.limit,
      offset: this.offset,
    };
  }

  /** Create MessageListResponse from an OpenAPI response dictionary. */
  static fromDict(dict?: JsonDict | null): MessageListResponse {
    const data = dict ?? {};
    return new MessageListResponse({
      items: (data['items'] ?? []).map((item: JsonDict) => MessageInfo.fromDict(item)),
      total: pick(data, 'total', 0),
      limit: pick(data, 'limit', 20),
      offset: pick(data, 'offset', 0),
    });
  }
}

/** Message batch response. */
export class MessageBatchResponse {
  items: MessageInfo[];

  constructor(init?: Partial<MessageBatchResponse>) {
    this.items = init?.items ?? [];
  }

  toDict(): JsonDict {
    return { messages: this.items.map((item) => item.toDict()) };
  }

  /** Create MessageBatchResponse from an OpenAPI response dictionary. */
  static fromDict(dict?: JsonDict | null): MessageBatchResponse {
    const data = dict ?? {};
    return new MessageBatchResponse({
      items: (data['messages'] ?? []).map((item: JsonDict) => MessageInfo.fromDict(item)),
    });
  }
}

/** Memory record detailed information (return value). */
export class MemoryInfo {
  id!: string;
  spaceId!: string;
  strategyId!: string;
  strategyType?: string | null;
  actorId?: string | null;
  assistantId?: string | null;
  sessionId?: string | null;
  content = '';
  memoryType = 'memory';
  isolationLevel = 'actor';
  createdAt?: string | null;
  updatedAt?: string | null;

  constructor(init?: Partial<MemoryInfo>) {
    Object.assign(this, init ?? {});
  }

  toDict(): JsonDict {
    const result: JsonDict = {
      id: this.id,
      space_id: this.spaceId,
      strategy_id: this.strategyId,
      content: this.content,
      memory_type: this.memoryType,
      isolation_level: this.isolationLevel,
    };
    if (this.strategyType !== undefined && this.strategyType !== null) {
      result['strategy_type'] = this.strategyType;
    }
    if (this.actorId !== undefined && this.actorId !== null) result['actor_id'] = this.actorId;
    if (this.assistantId !== undefined && this.assistantId !== null) {
      result['assistant_id'] = this.assistantId;
    }
    if (this.sessionId !== undefined && this.sessionId !== null) {
      result['session_id'] = this.sessionId;
    }
    if (this.createdAt !== undefined && this.createdAt !== null) {
      result['created_at'] = this.createdAt;
    }
    if (this.updatedAt !== undefined && this.updatedAt !== null) {
      result['updated_at'] = this.updatedAt;
    }
    return result;
  }

  /** Create MemoryInfo from an OpenAPI response dictionary. */
  static fromDict(dict?: JsonDict | null): MemoryInfo {
    const data = dict ?? {};
    return new MemoryInfo({
      id: data['id'],
      spaceId: data['space_id'],
      strategyId: data['strategy_id'],
      strategyType: pick(data, 'strategy_type'),
      actorId: pick(data, 'actor_id'),
      assistantId: pick(data, 'assistant_id'),
      sessionId: pick(data, 'session_id'),
      content: pick(data, 'content', ''),
      memoryType: pick(data, 'memory_type', 'memory'),
      isolationLevel: pick(data, 'isolation_level', 'actor'),
      createdAt: pick(data, 'created_at'),
      updatedAt: pick(data, 'updated_at'),
    });
  }
}

/** Memory list response. */
export class MemoryListResponse {
  items: MemoryInfo[];
  total: number;
  limit: number;
  offset: number;

  constructor(init?: Partial<MemoryListResponse>) {
    this.items = init?.items ?? [];
    this.total = init?.total ?? 0;
    this.limit = init?.limit ?? 20;
    this.offset = init?.offset ?? 0;
  }

  toDict(): JsonDict {
    return {
      items: this.items.map((item) => item.toDict()),
      total: this.total,
      limit: this.limit,
      offset: this.offset,
    };
  }

  /** Create MemoryListResponse from an OpenAPI response dictionary. */
  static fromDict(dict?: JsonDict | null): MemoryListResponse {
    const data = dict ?? {};
    return new MemoryListResponse({
      items: (data['items'] ?? []).map((item: JsonDict) => MemoryInfo.fromDict(item)),
      total: pick(data, 'total', 0),
      limit: pick(data, 'limit', 20),
      offset: pick(data, 'offset', 0),
    });
  }
}

/** Memory search response. */
export class MemorySearchResponse {
  results: JsonDict[];
  total = 0;
  query?: string | null;

  constructor(init?: Partial<MemorySearchResponse>) {
    this.results = init?.results ?? [];
    this.total = init?.total ?? 0;
    this.query = init?.query ?? null;
  }

  toDict(): JsonDict {
    const result: JsonDict = { results: this.results, total: this.total };
    if (this.query !== undefined && this.query !== null) result['query'] = this.query;
    return result;
  }

  /** Create MemorySearchResponse from an OpenAPI response dictionary. */
  static fromDict(dict?: JsonDict | null): MemorySearchResponse {
    const data = dict ?? {};
    let searchResults: JsonDict[] = [];
    if (hasOwn(data, 'records')) {
      for (const record of data['records'] ?? []) {
        if (record && typeof record === 'object') {
          searchResults.push({ record: record['record'], score: record['score'] });
        }
      }
    } else if (hasOwn(data, 'results')) {
      searchResults = data['results'] ?? [];
    }

    return new MemorySearchResponse({
      results: searchResults,
      query: pick(data, 'query'),
      total: pick(data, 'total', 0),
    });
  }
}

/**
 * SDK text message - the most commonly used message type, easy to use and
 * extend.
 */
export class TextMessage {
  role: 'user' | 'assistant' | 'system' = 'user';
  content = '';
  actorId?: string | null;
  assistantId?: string | null;
  meta?: string | null;

  constructor(init?: Partial<TextMessage>) {
    Object.assign(this, init ?? {});
  }

  /** Convert to an OpenAPI format message request. */
  toDict(): JsonDict {
    if (!this.content) {
      throw new Error('Text message content cannot be empty');
    }

    const result: JsonDict = {
      role: this.role,
      parts: [{ type: 'text', text: this.content }],
    };
    if (this.actorId !== undefined && this.actorId !== null) {
      result['actor_id'] = this.actorId;
    }
    if (this.assistantId !== undefined && this.assistantId !== null) {
      result['assistant_id'] = this.assistantId;
    }
    if (this.meta) result['meta'] = this.meta;
    return result;
  }

  static fromDict(dict?: JsonDict | null): TextMessage {
    const data = dict ?? {};
    const parts: any[] = data['parts'] ?? [];
    const textPart = parts.find((part) => part?.type === 'text') ?? parts[0] ?? {};
    return new TextMessage({
      role: pick(data, 'role', 'user'),
      content: pick(textPart, 'text', ''),
      actorId: pick(data, 'actor_id'),
      assistantId: pick(data, 'assistant_id'),
      meta: pick(data, 'meta'),
    });
  }
}

/** Context chain response. */
export class ContextChainResponse {
  messages: MessageInfo[];
  totalTokenCount: number;
  compressed = false;

  constructor(init?: Partial<ContextChainResponse>) {
    this.messages = init?.messages ?? [];
    this.totalTokenCount = init?.totalTokenCount ?? 0;
    this.compressed = init?.compressed ?? false;
  }

  toDict(): JsonDict {
    return {
      messages: this.messages.map((item) => item.toDict()),
      total_token_count: this.totalTokenCount,
      compressed: this.compressed,
    };
  }

  /** Create ContextChainResponse from an OpenAPI response dictionary. */
  static fromDict(dict?: JsonDict | null): ContextChainResponse {
    const data = dict ?? {};
    return new ContextChainResponse({
      messages: (data['messages'] ?? []).map((item: JsonDict) => MessageInfo.fromDict(item)),
      totalTokenCount: pick(data, 'total_token_count', 0),
      compressed: pick(data, 'compressed', false),
    });
  }
}

/** Context compression response. */
export class ContextCompressionResponse {
  compressionId?: string | null;
  status?: string | null;
  compressedMessages?: MessageInfo[] | null;
  compressionRatio?: number | null;
  originalTokenCount?: number | null;
  compressedTokenCount?: number | null;

  constructor(init?: Partial<ContextCompressionResponse>) {
    Object.assign(this, init ?? {});
  }

  toDict(): JsonDict {
    const result: JsonDict = {};
    if (this.compressionId !== undefined && this.compressionId !== null) {
      result['compression_id'] = this.compressionId;
    }
    if (this.status !== undefined && this.status !== null) result['status'] = this.status;
    if (this.compressedMessages !== undefined && this.compressedMessages !== null) {
      result['compressed_messages'] = serializeList(this.compressedMessages);
    }
    if (this.compressionRatio !== undefined && this.compressionRatio !== null) {
      result['compression_ratio'] = this.compressionRatio;
    }
    if (this.originalTokenCount !== undefined && this.originalTokenCount !== null) {
      result['original_token_count'] = this.originalTokenCount;
    }
    if (this.compressedTokenCount !== undefined && this.compressedTokenCount !== null) {
      result['compressed_token_count'] = this.compressedTokenCount;
    }
    return result;
  }

  /** Create ContextCompressionResponse from an OpenAPI response dictionary. */
  static fromDict(dict?: JsonDict | null): ContextCompressionResponse {
    const data = dict ?? {};
    return new ContextCompressionResponse({
      compressionId: pick(data, 'compression_id'),
      status: pick(data, 'status'),
      compressedMessages: (data['compressed_messages'] ?? []).map((item: JsonDict) =>
        MessageInfo.fromDict(item),
      ),
      compressionRatio: pick(data, 'compression_ratio'),
      originalTokenCount: pick(data, 'original_token_count'),
      compressedTokenCount: pick(data, 'compressed_token_count'),
    });
  }
}

/** API Key information (return value). */
export class ApiKeyInfo {
  id!: string;
  apiKey!: string;

  constructor(init?: Partial<ApiKeyInfo>) {
    Object.assign(this, init ?? {});
  }

  toDict(): JsonDict {
    return { id: this.id, api_key: this.apiKey };
  }

  /** Create ApiKeyInfo from an OpenAPI response dictionary. */
  static fromDict(dict?: JsonDict | null): ApiKeyInfo {
    const data = dict ?? {};
    return new ApiKeyInfo({
      id: data['id'],
      apiKey: pick(data, 'api_key', ''),
    });
  }
}
