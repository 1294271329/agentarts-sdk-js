/**
 * Agent Memory SDK - Async MemorySession.
 *
 * Mirrors `agentarts/sdk/memory/async_session.py`: async version of
 * `MemorySession` for non-blocking operations. All request parameters and
 * response handling are identical.
 */

import { _AsyncDataPlane } from './inner/dataplane-async.js';
import type { DataPlaneOptions } from './inner/dataplane.js';
import { MemorySession, RetrievalConfig } from './session.js';
import type { MemorySessionOptions } from './session.js';

/** Async retrieval configuration - identical to `RetrievalConfig`. */
export class AsyncRetrievalConfig extends RetrievalConfig {
  override toString(): string {
    return (
      `AsyncRetrievalConfig(user_id=${this.userId}, max_tokens=${this.maxTokens}, ` +
      `top_k=${this.topK}, score_threshold=${this.scoreThreshold})`
    );
  }
}

/**
 * Async Memory session wrapper class - non-blocking version of
 * `MemorySession`.
 */
export class AsyncMemorySession extends MemorySession<_AsyncDataPlane> {
  constructor(
    first: MemorySessionOptions | string,
    actorId = '',
    sessionId?: string | null,
    regionName?: string | null,
    apiKey?: string | null,
  ) {
    super(first, actorId, sessionId, regionName, apiKey);
  }

  /** The async data plane used by this session. */
  get asyncDataPlane(): _AsyncDataPlane {
    return this._dataPlane;
  }

  protected override _createDataPlane(options: DataPlaneOptions): _AsyncDataPlane {
    return new _AsyncDataPlane(options);
  }

  /** Factory method - identical to `MemorySession.of`, async data plane. */
  static override async of(options: MemorySessionOptions): Promise<AsyncMemorySession>;
  static override async of(
    spaceId: string,
    actorId: string,
    sessionId?: string | null,
    regionName?: string | null,
    apiKey?: string | null,
  ): Promise<AsyncMemorySession>;
  static override async of(
    first: MemorySessionOptions | string,
    actorId?: string,
    sessionId?: string | null,
    regionName?: string | null,
    apiKey?: string | null,
  ): Promise<AsyncMemorySession> {
    const session = new AsyncMemorySession(
      first as MemorySessionOptions,
      actorId ?? '',
      sessionId,
      regionName,
      apiKey,
    );
    await session.ensureInitialized();
    return session;
  }

  /** Python `__repr__` equivalent (session ID may still be pending). */
  override toString(): string {
    const sessionId = this.sessionId ?? '<pending>';
    return (
      `AsyncMemorySession(space_id='${this.spaceId}', session_id='${sessionId}', ` +
      `region_name='${this.regionName}')`
    );
  }
}
