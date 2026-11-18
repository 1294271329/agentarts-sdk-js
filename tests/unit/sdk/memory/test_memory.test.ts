/**
 * Tests for the memory module.
 *
 * Ported 1:1 from `tests/unit/sdk/memory/test_memory.py`.
 *
 * Porting notes:
 * - `unittest.mock.patch(...)` on a class method -> `vi.spyOn(Class.prototype, ...)`.
 *   `MagicMock(spec=_ControlPlane)` -> a plain object with `vi.fn()` members.
 * - Python `with MemoryClient() as client:` has no Node.js equivalent: `client.ts`
 *   documents `try { ... } finally { await client.close(); }` and the class exposes
 *   no `Symbol.asyncDispose`, so the context-manager tests assert the same
 *   "exit runs close()" guarantee through the explicit idiom.
 * - `MemorySession.__init__` creates the backend session eagerly in Python; the
 *   Node.js port defers it to `ensureInitialized()` (lazy initialization), so the
 *   auto-create test awaits it before asserting.
 * - `requests.Session` does not exist in the Node.js port (requests go through the
 *   global `fetch`); `MemoryHttpService.close()` releases the optional TLS
 *   dispatcher instead of a session, which is what the close tests observe.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  MemoryClient,
  MemorySearchFilter,
  MemorySession,
  MessageInfo,
  MessageRequest,
  SessionCreateRequest,
  SessionInfo,
  SpaceCreateRequest,
  SpaceUpdateRequest,
} from 'agentarts-sdk/sdk/memory';
import { _ControlPlane } from 'agentarts-sdk/sdk/memory/inner/controlplane';
import { _DataPlane } from 'agentarts-sdk/sdk/memory/inner/dataplane';
import {
  ControlPlaneAuthenticationStrategy,
  MemoryHttpService,
} from 'agentarts-sdk/sdk/service/memory-service';

const REGION = 'cn-north-4';
const API_KEY = 'test-api-key';

/** Create a client exactly like the Python tests do. */
function newClient(): MemoryClient {
  return new MemoryClient({ regionName: REGION, apiKey: API_KEY });
}

/** Create a data-plane `MemoryHttpService` (no AK/SK signing). */
function newDataService(): MemoryHttpService {
  return new MemoryHttpService({ regionName: REGION, endpointType: 'data', apiKey: API_KEY });
}

beforeEach(() => {
  // Unit tests must never reach the cloud: any unmocked request fails loudly.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new Error('unexpected network call in unit test');
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ============================================================
// Module level tests (Python: plain functions)
// ============================================================

describe('memory module', () => {
  it('test_memory_client_import', () => {
    // Python: `from agentarts.sdk import MemoryClient`.
    expect(MemoryClient).toBeTruthy();
  });

  it('test_memory_client_creation', () => {
    const client = newClient();
    expect(client).toBeTruthy();
  });

  it('test_memory_types_import', () => {
    // Python: `from agentarts.sdk.memory import (...)`.
    expect(SpaceCreateRequest).toBeTruthy();
    expect(SpaceUpdateRequest).toBeTruthy();
    expect(SessionCreateRequest).toBeTruthy();
    expect(MessageRequest).toBeTruthy();
  });
});

// ============================================================
// MemoryClient close
// ============================================================

describe('TestMemoryClientClose', () => {
  it('test_memory_client_close_without_control_plane', async () => {
    const client = newClient();

    expect(client.controlPlane).toBeNull();
    expect(client.dataPlane).toBeTruthy();

    await client.close();

    expect(client.controlPlane).toBeNull();
  });

  it('test_memory_client_close_with_control_plane', async () => {
    const client = newClient();

    const mockControlPlane = { close: vi.fn(async () => undefined) };
    (client as unknown as { _controlPlane: unknown })._controlPlane = mockControlPlane;

    await client.close();

    expect(mockControlPlane.close).toHaveBeenCalledTimes(1);
  });

  it('test_memory_client_context_manager', async () => {
    // Python: `with MemoryClient(...) as client: assert client is not None`.
    const client = newClient();
    try {
      expect(client).toBeTruthy();
      expect(client.regionName).toBe(REGION);
    } finally {
      // `__exit__` equivalent (documented in client.ts).
      await client.close();
    }
  });

  it('test_memory_client_context_manager_calls_close', async () => {
    const client = newClient();
    const dataPlaneClose = vi.spyOn(client.dataPlane, 'close');

    try {
      expect(client).toBeTruthy();
    } finally {
      await client.close();
    }

    // Leaving the context releases the underlying resources exactly once.
    expect(dataPlaneClose).toHaveBeenCalledTimes(1);
  });
});

// ============================================================
// _DataPlane close
// ============================================================

describe('TestDataPlaneClose', () => {
  it('test_dataplane_close', async () => {
    const dataplane = new _DataPlane({ regionName: REGION, apiKey: API_KEY });

    expect(dataplane.client).toBeTruthy();

    await dataplane.close();
  });

  it('test_dataplane_close_calls_client_close', async () => {
    const dataplane = new _DataPlane({ regionName: REGION, apiKey: API_KEY });
    const closeSpy = vi.spyOn(dataplane.client, 'close');

    await dataplane.close();

    expect(closeSpy).toHaveBeenCalledTimes(1);
  });
});

// ============================================================
// _ControlPlane close
// ============================================================

describe('TestControlPlaneClose', () => {
  beforeEach(() => {
    // Python: patch("...ControlPlaneAuthenticationStrategy.setup_credentials").
    // The Node.js port runs credential setup from the constructor (it cannot be
    // awaited there), so the failure surfaces on the first request instead.
    vi.spyOn(
      ControlPlaneAuthenticationStrategy.prototype,
      'setupCredentials',
    ).mockResolvedValue(undefined);
  });

  it('test_controlplane_close', async () => {
    const controlplane = new _ControlPlane({ regionName: REGION });

    expect(controlplane.client).toBeTruthy();

    await controlplane.close();
  });

  it('test_controlplane_close_calls_client_close', async () => {
    const controlplane = new _ControlPlane({ regionName: REGION });
    const closeSpy = vi.spyOn(controlplane.client, 'close');

    await controlplane.close();

    expect(closeSpy).toHaveBeenCalledTimes(1);
  });
});

// ============================================================
// MemoryHttpService close
// ============================================================

describe('TestMemoryHttpServiceClose', () => {
  it('test_memory_http_service_close', async () => {
    const service = newDataService();

    // Python asserts `service.session is not None`. The Node.js port has no
    // `requests.Session`; it is stateless (global fetch) and keeps an optional
    // TLS dispatcher, so assert the configured transport identity instead.
    expect(service.endpointType).toBe('data');

    await service.close();
  });

  it('test_memory_http_service_close_calls_session_close', async () => {
    const service = new MemoryHttpService({
      regionName: REGION,
      endpointType: 'data',
      apiKey: API_KEY,
      verifySsl: false,
    });

    // Python spies on `service.session.close` (a real requests.Session). The
    // transport handle of the Node.js port is the undici dispatcher created for
    // `verifySsl: false`; replace its `close` with a mock. (undici's
    // `DispatcherBase.close()` resolves its promise overload by re-entering
    // `this.close(callback)`, so `vi.spyOn` would legitimately observe 2 calls.)
    const dispatcher = (
      service as unknown as { _getDispatcher(): { close: () => Promise<void> } }
    )._getDispatcher();
    expect(dispatcher).toBeTruthy();
    const dispatcherClose = vi.fn(async (): Promise<void> => undefined);
    dispatcher.close = dispatcherClose;

    await service.close();

    // close() closes the underlying transport exactly once and drops the handle.
    expect(dispatcherClose).toHaveBeenCalledTimes(1);
    expect((service as unknown as { _dispatcher?: unknown })._dispatcher).toBeUndefined();
  });

  it('test_memory_http_service_close_control_plane', async () => {
    vi.spyOn(
      ControlPlaneAuthenticationStrategy.prototype,
      'setupCredentials',
    ).mockResolvedValue(undefined);

    const service = new MemoryHttpService({ regionName: REGION, endpointType: 'control' });

    expect(service.endpointType).toBe('control');

    await service.close();
  });

  it('test_memory_http_service_close_safe_when_no_session', async () => {
    const service = newDataService();

    // Python sets `service.session = None`. The equivalent transport handle of
    // the Node.js port is the (not yet created) dispatcher.
    (service as unknown as { _dispatcher?: unknown })._dispatcher = undefined;

    await expect(service.close()).resolves.toBeUndefined();
  });
});

// ============================================================
// close() propagation from MemoryClient to the session
// ============================================================

describe('TestCloseMethodChaining', () => {
  it('test_close_method_chain', async () => {
    const client = newClient();

    const mockControlPlane = { close: vi.fn(async () => undefined) };
    (client as unknown as { _controlPlane: unknown })._controlPlane = mockControlPlane;

    const sessionClose = vi.spyOn(client.dataPlane.client, 'close');

    await client.close();

    expect(mockControlPlane.close).toHaveBeenCalledTimes(1);
    expect(sessionClose).toHaveBeenCalledTimes(1);
  });
});

// ============================================================
// MemorySession (sync)
// ============================================================

describe('TestMemorySession', () => {
  it('test_session_auto_create_passes_request_object', async () => {
    // Regression: initialization must pass a SessionCreateRequest object to the
    // data plane, not a pre-converted dict (the data plane calls toDict()).
    const createSpy = vi.spyOn(_DataPlane.prototype, 'createMemorySession').mockResolvedValue(
      new SessionInfo({ id: 'new-session-123', spaceId: 'space-123', actorId: 'user-1' }),
    );

    const session = new MemorySession({
      spaceId: 'space-123',
      actorId: 'user-1',
      apiKey: 'test-key',
    });

    // Python creates the session in `__init__`; the Node.js port initializes
    // lazily, so the id is undefined until the session is initialized.
    expect(session.sessionId).toBeUndefined();
    await session.ensureInitialized();

    expect(session.sessionId).toBe('new-session-123');
    expect(createSpy).toHaveBeenCalledTimes(1);
    const callArgs = createSpy.mock.calls[0];
    expect(callArgs[0]).toBe('space-123');
    expect(callArgs[1]).toBeInstanceOf(SessionCreateRequest);
    expect(callArgs[1].actorId).toBe('user-1');
  });

  it('test_session_get_message_arg_order', async () => {
    // Regression: getMessage must forward args as (messageId, spaceId,
    // sessionId) to match the data plane signature.
    const getMessageSpy = vi
      .spyOn(_DataPlane.prototype, 'getMessage')
      .mockResolvedValue(new MessageInfo({ id: 'msg-1', sessionId: 'session-456', seq: 1 }));

    const session = new MemorySession({
      spaceId: 'space-123',
      actorId: 'user-1',
      sessionId: 'session-456',
      apiKey: 'test-key',
    });

    await session.getMessage('msg-1');

    expect(getMessageSpy).toHaveBeenCalledTimes(1);
    expect(getMessageSpy).toHaveBeenCalledWith('msg-1', 'space-123', 'session-456');
  });
});

// ============================================================
// MemorySearchFilter
// ============================================================

describe('TestMemorySearchFilter', () => {
  it('test_only_actived_defaults_to_false', () => {
    // By default search returns all matched memories.
    const filters = new MemorySearchFilter({ query: 'test query' });

    expect(filters.onlyActived).toBe(false);
    expect(filters.toDict()['only_actived']).toBe(false);
  });

  it('test_only_actived_true_is_included_in_request', () => {
    const filters = new MemorySearchFilter({ query: 'test query', onlyActived: true });

    expect(filters.toDict()['only_actived']).toBe(true);
  });

  it('test_search_memories_forwards_only_actived_to_http_service', async () => {
    const dataPlane = new _DataPlane({ regionName: REGION, apiKey: API_KEY });

    const searchSpy = vi
      .spyOn(dataPlane.client, 'searchMemories')
      .mockResolvedValue({ records: [], total: 0 });

    await dataPlane.searchMemories(
      'space-123',
      new MemorySearchFilter({ query: 'test query', onlyActived: true }),
    );

    expect(searchSpy).toHaveBeenCalledTimes(1);
    const body = searchSpy.mock.calls[0][1];
    expect(body['only_actived']).toBe(true);
  });

  it('test_rerank_defaults_to_true', () => {
    // Reranking is enabled by default.
    const filters = new MemorySearchFilter({ query: 'test query' });

    expect(filters.rerank).toBe(true);
    expect(filters.toDict()['rerank']).toBe(true);
  });

  it('test_rerank_false_is_included_in_request', () => {
    const filters = new MemorySearchFilter({ query: 'test query', rerank: false });

    expect(filters.toDict()['rerank']).toBe(false);
  });

  it('test_search_memories_forwards_rerank_to_http_service', async () => {
    const dataPlane = new _DataPlane({ regionName: REGION, apiKey: API_KEY });

    const searchSpy = vi
      .spyOn(dataPlane.client, 'searchMemories')
      .mockResolvedValue({ records: [], total: 0 });

    await dataPlane.searchMemories(
      'space-123',
      new MemorySearchFilter({ query: 'test query', rerank: false }),
    );

    expect(searchSpy).toHaveBeenCalledTimes(1);
    const body = searchSpy.mock.calls[0][1];
    expect(body['rerank']).toBe(false);
  });
});
