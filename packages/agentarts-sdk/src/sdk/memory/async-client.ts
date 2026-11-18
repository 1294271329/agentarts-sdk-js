/**
 * Agent Memory SDK - AsyncMemoryClient.
 *
 * Mirrors `agentarts/sdk/memory/async_client.py`: non-blocking version of
 * `MemoryClient`. All request parameters and response handling are identical;
 * only the data plane HTTP client differs (`_AsyncDataPlane`).
 *
 * Control plane operations (Space management) use the same lazily initialized
 * `_ControlPlane` as the sync client, exactly like the Python implementation.
 */

import { _AsyncDataPlane } from './inner/dataplane-async.js';
import type { DataPlaneOptions } from './inner/dataplane.js';
import { MemoryClient } from './client.js';
import type { MemoryClientOptions } from './client.js';

/**
 * Async Memory Client - non-blocking version of {@link MemoryClient}.
 *
 * Every method returns a `Promise`; the API surface is identical.
 */
export class AsyncMemoryClient extends MemoryClient<_AsyncDataPlane> {
  constructor(
    first?: MemoryClientOptions | string | null,
    apiKey?: string | null,
    verifySsl: boolean | string = true,
  ) {
    super(first, apiKey, verifySsl);
  }

  /** The async data plane used by this client. */
  get asyncDataPlane(): _AsyncDataPlane {
    return this._dataPlane;
  }

  protected override _createDataPlane(options: DataPlaneOptions): _AsyncDataPlane {
    return new _AsyncDataPlane(options);
  }
}
