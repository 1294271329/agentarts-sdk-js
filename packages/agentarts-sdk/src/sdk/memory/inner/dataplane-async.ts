/**
 * Agent Memory SDK - Async Data Plane.
 *
 * Async data plane: handles messages, memories and other operations.
 *
 * Mirrors `agentarts/sdk/memory/inner/dataplane_async.py`. All request
 * parameters and response handling are identical to `_DataPlane`; only the
 * underlying HTTP client differs (`AsyncMemoryHttpService`).
 */

import { AsyncMemoryHttpService } from '../../service/memory-service-async.js';

import { _DataPlane } from './dataplane.js';
import type { DataPlaneOptions } from './dataplane.js';

export { Message } from './dataplane.js';

/**
 * Async Data Plane API - all parameters identical to `_DataPlane`.
 */
export class _AsyncDataPlane extends _DataPlane<AsyncMemoryHttpService> {
  constructor(options: DataPlaneOptions = {}) {
    super(options);
  }

  protected override _getLogName(): string {
    return 'AsyncDataPlane';
  }

  protected override _createHttpClient(options: DataPlaneOptions): AsyncMemoryHttpService {
    return new AsyncMemoryHttpService({
      regionName: options.regionName,
      endpointType: 'data',
      apiKey: options.apiKey,
      verifySsl: options.verifySsl ?? true,
      endpoint: options.endpoint,
    });
  }
}
