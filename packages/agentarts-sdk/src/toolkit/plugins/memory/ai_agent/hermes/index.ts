/**
 * AgentArts Memory Provider plugin for Hermes Agent.
 *
 * Ported from
 * `agentarts/toolkit/plugins/memory/ai_agent/hermes/__init__.py`.
 */

export { AgentArtsMemoryProvider, register } from './provider.js';
export {
  CONFIG_SCHEMA,
  DEFAULT_LIST_LIMIT,
  DEFAULT_MIN_SCORE,
  DEFAULT_REGION,
  DEFAULT_TOP_K,
  ENV_API_KEY,
  ENV_REGION,
  ENV_SPACE_ID,
  PROVIDER_ASSISTANT_ID,
  PROVIDER_NAME,
  SYSTEM_PROMPT_BLOCK,
  TOOL_SCHEMAS,
  importMemorySdk,
  saveConfig,
} from './provider.js';
