/**
 * AgentArts memory plugins package.
 *
 * Ported from `agentarts/toolkit/plugins/memory/__init__.py`.
 *
 * Sub-packages: `ai_agent` (platform-specific plugin assets), `mcp` (MCP
 * server), `resources` (manifests + shared hook scripts), `installer` (unified
 * installer CLI).
 */

export * as aiAgent from './ai_agent/hermes/index.js';
export * as installer from './installer/index.js';
export * as mcp from './mcp/index.js';
export {
  AgentArtsMemoryClient,
  DEFAULT_ASSISTANT_ID,
  DEFAULT_LIST_LIMIT,
  DEFAULT_MIN_SCORE,
  DEFAULT_REGION,
  DEFAULT_TOP_K,
  SESSION_CACHE_DIR,
  SESSION_CACHE_FILE,
  SESSION_TTL_SECONDS,
  importMemorySdk,
} from './agentarts-client.js';
export type {
  AddMessagesResult,
  AgentArtsMemoryClientOptions,
  MemoryHealth,
  MemorySdkNamespace,
  NormalizedListResult,
  NormalizedSearchResult,
} from './agentarts-client.js';
export {
  getMemoryAssetPath,
  memoryAssetsRoot,
  memoryModuleRoot,
  readMemoryAsset,
  resolveMemoryModuleFile,
} from './resources.js';
