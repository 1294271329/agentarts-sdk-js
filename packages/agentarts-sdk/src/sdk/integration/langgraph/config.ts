/**
 * Configuration for AgentArts LangGraph Integration.
 *
 * Mirrors `agentarts/sdk/integration/langgraph/config.py`: configuration classes
 * used by the checkpoint saver and the other LangGraph integration components.
 *
 * This module deliberately has **no** import of `@langchain/langgraph` /
 * `@langchain/core` (they are optional peer dependencies), not even type-only
 * ones: {@link RunnableConfigLike} is a minimal structural view of LangGraph's
 * `RunnableConfig`. A real `RunnableConfig` is assignable to it, so the
 * integration barrel can re-export this module without forcing the peers.
 */

/**
 * Minimal structural view of LangGraph's `RunnableConfig`.
 *
 * Python uses `langchain_core.runnables.RunnableConfig` (a `TypedDict`) and falls
 * back to `dict[str, Any]` when langchain is missing; TypeScript only needs the
 * `configurable` bag here, so a local interface keeps this file dependency free.
 */
export interface RunnableConfigLike {
  /** Runtime values for attributes previously made configurable on the Runnable. */
  configurable?: Record<string, any> | null;
}

/** Anything accepted where Python accepts a `RunnableConfig`. */
export type RunnableConfigInput = RunnableConfigLike | Record<string, any>;

/** The `RunnableConfig` object produced by {@link CheckpointerConfig.toRunnableConfig}. */
export interface RunnableConfigData {
  configurable: Record<string, any>;
}

/**
 * Runtime configuration for checkpoint operations.
 *
 * Holds the runtime parameters extracted from LangGraph's `RunnableConfig` and
 * used during checkpoint save/load operations.
 *
 * - `threadId`: thread/conversation ID for session management (required)
 * - `actorId`: actor/user ID participating in the conversation
 * - `assistantId`: assistant ID participating in the conversation
 * - `checkpointNs`: checkpoint namespace for isolation
 * - `checkpointId`: specific checkpoint ID for retrieval
 *
 * ```ts
 * const config = CheckpointerConfig.fromRunnableConfig({
 *   configurable: { thread_id: 'conv-123' },
 * });
 * console.log(config.threadId); // "conv-123"
 * ```
 */
export class CheckpointerConfig {
  threadId!: string;
  actorId?: string | null;
  assistantId?: string | null;
  checkpointNs?: string | null;
  checkpointId?: string | null;

  constructor(init?: Partial<CheckpointerConfig>) {
    Object.assign(this, init ?? {});
  }

  /** Python `session_id` property: the thread ID doubles as the session ID. */
  get sessionId(): string {
    return this.threadId;
  }

  /**
   * Extract a `CheckpointerConfig` from a LangGraph `RunnableConfig`.
   *
   * @param config LangGraph `RunnableConfig` (or a plain object) containing the
   *   `configurable` parameters.
   * @returns The extracted configuration.
   * @throws Error when `configurable` is missing/empty or has no `thread_id`
   *   (Python raises `ValueError` here; JavaScript has no `ValueError`, so a
   *   plain `Error` is thrown with the exact Python message).
   */
  static fromRunnableConfig(config: RunnableConfigInput): CheckpointerConfig {
    const configurable = (config as RunnableConfigLike | null | undefined)?.configurable;
    if (
      configurable === null ||
      configurable === undefined ||
      Object.keys(configurable).length === 0
    ) {
      throw new Error(
        'RunableConfig has no configurable parameters in AgentArtsMemorySessionSaver',
      );
    }
    const threadId = configurable['thread_id'];
    if (!threadId) {
      throw new Error(
        'RunableConfig has no thread_id parameter in AgentArtsMemorySessionSaver',
      );
    }

    return new CheckpointerConfig({
      threadId,
      actorId: configurable['actor_id'] ?? null,
      assistantId: configurable['assistant_id'] ?? null,
      checkpointNs: configurable['checkpoint_ns'] ?? null,
      checkpointId: configurable['checkpoint_id'] ?? null,
    });
  }

  /**
   * Convert back to the LangGraph `RunnableConfig` format.
   *
   * The `configurable` keys stay snake_case on purpose: they are the LangGraph
   * protocol names (same as Python), not SDK field names.
   */
  toRunnableConfig(): RunnableConfigData {
    const configurable: Record<string, any> = { thread_id: this.threadId };

    if (this.actorId) {
      configurable['actor_id'] = this.actorId;
    }
    if (this.checkpointNs !== undefined && this.checkpointNs !== null) {
      configurable['checkpoint_ns'] = this.checkpointNs;
    }
    if (this.checkpointId !== undefined && this.checkpointId !== null) {
      configurable['checkpoint_id'] = this.checkpointId;
    }

    return { configurable };
  }
}
