/**
 * Agent Memory SDK - v2.0
 *
 * Public interface of the memory module (mirrors
 * `agentarts/sdk/memory/__init__.py`).
 *
 * Recommended usage:
 * - `MemoryClient`: unified entry point providing all methods.
 * - `AsyncMemoryClient`: async version for non-blocking operations.
 *
 * ```ts
 * import { MemoryClient, TextMessage, SpaceCreateRequest } from 'agentarts-sdk/sdk/memory';
 *
 * const client = new MemoryClient({ apiKey: 'your-api-key', regionName: 'cn-southwest-2' });
 * const space = await client.createSpace('my-space', { messageTtlHours: 168 });
 * const session = await client.createMemorySession(space.id, undefined, 'user-1');
 * await client.addMessages(space.id, session.id, [new TextMessage({ role: 'user', content: 'Hello' })]);
 * await client.close();
 * ```
 */

// Public interface
// Internal classes (for advanced users)
export { MemoryHttpService } from '../service/memory-service.js';
export { AsyncMemoryHttpService } from '../service/memory-service-async.js';
export type {
  MemoryHttpServiceOptions,
  MakeRequestOptions,
  HttpSendOptions,
} from '../service/memory-service.js';

export { AsyncMemoryClient } from './async-client.js';
export { AsyncMemorySession, AsyncRetrievalConfig } from './async-session.js';
export { MemoryClient } from './client.js';
export type {
  ClientAddMessagesOptions,
  ClientMessage,
  CreateSpaceOptions,
  MemoryClientOptions,
  UpdateSpaceOptions,
} from './client.js';

// Data types (config models and enums)
export {
  AddMessagesRequest,
  ApiKeyInfo,
  AssetRef,
  CompressConfig,
  ContextChainResponse,
  ContextCompressionResponse,
  CreateMemoryRequest,
  DataMessage,
  MemoryCreateRequest,
  MemoryInfo,
  MemoryListFilter,
  MemoryListResponse,
  MemorySearchFilter,
  MemorySearchRequest,
  MemorySearchResponse,
  MemoryStrategy,
  MemoryUpdateRequest,
  MessageBatchResponse,
  MessageInfo,
  MessageListResponse,
  MessageRequest,
  MessageRole,
  SessionCreateRequest,
  SessionInfo,
  SessionListResponse,
  SessionMetadata,
  SpaceCreateRequest,
  SpaceInfo,
  SpaceListResponse,
  SpaceUpdateRequest,
  StrategyType,
  Tag,
  TextMessage,
  ToolCallMessage,
  ToolResultMessage,
} from './inner/config.js';
export type {
  JsonDict,
  MessagePart,
  ToDictCapable,
} from './inner/config.js';

export { MemorySession, RetrievalConfig } from './session.js';
export type {
  AddMessagesOptions,
  MemorySessionOptions,
  SessionMessage,
} from './session.js';
