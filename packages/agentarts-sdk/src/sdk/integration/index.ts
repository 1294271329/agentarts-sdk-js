/**
 * AgentArts Framework Integration Module.
 *
 * Mirrors the *intent* of `agentarts/sdk/integration/__init__.py` (lazy adapters
 * for agent frameworks), but only the LangGraph integration exists in this port:
 *
 * - Python's `integration/__init__.py` also re-exports `BaseAdapter` and
 *   `WrappedAgent` from an `agentarts.sdk.integration.base` module that does not
 *   exist in the Python sources, so those names are intentionally **not** ported
 *   (they would only expose broken imports).
 * - The Google ADK integration (`AgentArtsSessionService`,
 *   `AgentArtsMemoryService`) has **not been ported** to this package yet; those
 *   exports are intentionally absent until it is.
 *
 * `@langchain/langgraph` and `@langchain/core` are optional peer dependencies.
 * Importing `agentarts-sdk` (or `agentarts-sdk/sdk`) never loads this module, and
 * this module never loads the LangGraph packages eagerly: the integration is
 * loaded on first use through {@link loadLangGraphIntegration} (or one of the
 * `get*` accessors), which raises a friendly error explaining what to install
 * when the peers are missing.
 *
 * ```ts
 * import { loadLangGraphIntegration } from 'agentarts-sdk/sdk/integration';
 *
 * const { AgentArtsMemorySessionSaver, CheckpointerConfig } =
 *   await loadLangGraphIntegration();
 *
 * const config = CheckpointerConfig.fromRunnableConfig({
 *   configurable: { thread_id: 'conv-123' },
 * });
 * const checkpointer = new AgentArtsMemorySessionSaver({ spaceId: 'your-space-id' });
 * ```
 */

import type * as LangGraphIntegrationModule from './langgraph/index.js';

// `CheckpointerConfig` (and its types) has no dependency on the LangGraph
// packages, so it can be exported eagerly.
export { CheckpointerConfig } from './langgraph/config.js';
export type { RunnableConfigInput, RunnableConfigLike } from './langgraph/config.js';

/** Type of the LangGraph integration module (see {@link loadLangGraphIntegration}). */
export type LangGraphIntegration = typeof LangGraphIntegrationModule;

let cachedIntegration: LangGraphIntegration | undefined;

/**
 * Lazily load the LangGraph integration module.
 *
 * @returns The `sdk/integration/langgraph` module namespace.
 * @throws Error when the optional peer dependencies are not installed.
 */
export async function loadLangGraphIntegration(): Promise<LangGraphIntegration> {
  if (cachedIntegration === undefined) {
    try {
      cachedIntegration = await import('./langgraph/index.js');
    } catch (error) {
      const original = error instanceof Error ? error.message : String(error);
      throw new Error(
        'The AgentArts LangGraph integration requires the optional peer ' +
          "dependencies '@langchain/langgraph' and '@langchain/core'. " +
          'Install them with:\n' +
          '  npm install @langchain/langgraph @langchain/core\n' +
          `Original error: ${original}`,
        { cause: error },
      );
    }
  }
  return cachedIntegration;
}

/** Lazily load `AgentArtsMemorySessionSaver` (checkpoint saver). */
export async function getAgentArtsMemorySessionSaver(): Promise<
  LangGraphIntegration['AgentArtsMemorySessionSaver']
> {
  return (await loadLangGraphIntegration()).AgentArtsMemorySessionSaver;
}

/** Lazily load `AgentArtsMemoryStore` (cross-thread memory store). */
export async function getAgentArtsMemoryStore(): Promise<
  LangGraphIntegration['AgentArtsMemoryStore']
> {
  return (await loadLangGraphIntegration()).AgentArtsMemoryStore;
}

/** Lazily load `langgraphToMemoryMessage`. */
export async function getLanggraphToMemoryMessage(): Promise<
  LangGraphIntegration['langgraphToMemoryMessage']
> {
  return (await loadLangGraphIntegration()).langgraphToMemoryMessage;
}

/** Lazily load `memoryToLanggraphMessage`. */
export async function getMemoryToLanggraphMessage(): Promise<
  LangGraphIntegration['memoryToLanggraphMessage']
> {
  return (await loadLangGraphIntegration()).memoryToLanggraphMessage;
}

/** Lazily load `langgraphMessagesToMemory`. */
export async function getLanggraphMessagesToMemory(): Promise<
  LangGraphIntegration['langgraphMessagesToMemory']
> {
  return (await loadLangGraphIntegration()).langgraphMessagesToMemory;
}

/** Lazily load `memoryMessagesToLanggraph`. */
export async function getMemoryMessagesToLanggraph(): Promise<
  LangGraphIntegration['memoryMessagesToLanggraph']
> {
  return (await loadLangGraphIntegration()).memoryMessagesToLanggraph;
}
