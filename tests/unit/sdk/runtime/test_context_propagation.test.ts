/**
 * Tests for context propagation in AgentArtsRuntimeApp together with the
 * `requireAccessToken` helper.
 *
 * Ported 1:1 from `tests/unit/sdk/runtime/test_context_propagation.py`.
 *
 * Verifies that the workload access token is correctly propagated when:
 * 1. The request comes through `_handleInvocation`
 * 2. The handler uses the `requireAccessToken` decorator
 * 3. The handler is a sync or async function
 *
 * Python patches `agentarts.sdk.identity.auth.IdentityClient`; here the whole
 * identity-client module is mocked, so `requireAccessToken` never touches the
 * network. `contextvars` become `AsyncLocalStorage` (`runInNewContext`), which
 * provides the same per-task isolation as `asyncio.gather` + `copy_context`.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  AgentArtsRuntimeApp,
  AgentArtsRuntimeContext,
  RequestContext,
} from 'agentarts-sdk/sdk/runtime';
import { getWorkloadAccessToken, requireAccessToken } from 'agentarts-sdk/sdk/identity/auth';
import { runAsyncInSyncContext } from 'agentarts-sdk/sdk/runtime/context';

/** Shared `IdentityClient` double (Python's `mock_identity_client_for_app`). */
const identity = vi.hoisted(() => ({
  getResourceOauth2Token: vi.fn(async (_options: any) => 'oauth2-result-token'),
  getResourceApiKey: vi.fn(async (_options: any) => 'mock-api-key'),
  getResourceStsToken: vi.fn(async (_options: any) => ({})),
  createWorkloadIdentity: vi.fn(async () => ({ name: 'mock-workload-identity' })),
  createWorkloadAccessToken: vi.fn(async () => 'mock-workload-token'),
}));

vi.mock('agentarts-sdk/sdk/service/identity/identity-client', () => ({
  IdentityClient: class {
    getResourceOauth2Token = identity.getResourceOauth2Token;
    getResourceApiKey = identity.getResourceApiKey;
    getResourceStsToken = identity.getResourceStsToken;
    createWorkloadIdentity = identity.createWorkloadIdentity;
    createWorkloadAccessToken = identity.createWorkloadAccessToken;
  },
}));

beforeEach(() => {
  identity.getResourceOauth2Token.mockImplementation(async () => 'oauth2-result-token');
  identity.getResourceApiKey.mockImplementation(async () => 'mock-api-key');
  identity.getResourceStsToken.mockImplementation(async () => ({}));
  identity.createWorkloadIdentity.mockImplementation(async () => ({
    name: 'mock-workload-identity',
  }));
  identity.createWorkloadAccessToken.mockImplementation(async () => 'mock-workload-token');
  AgentArtsRuntimeContext.clear();
});

/** Build a `Request`-like object for the invocation endpoint. */
function makeRequest(
  body: any,
  headers: Record<string, string> = {},
): { headers: Record<string, string>; json: () => Promise<any> } {
  return { headers, json: async () => body };
}

function jsonBody(response: { body: string | Buffer | null }): any {
  return JSON.parse(String(response.body));
}

describe('TestContextPropagationWithRequireAccessToken', () => {
  it('sync handler with require access token gets token from context', async () => {
    const app = new AgentArtsRuntimeApp();

    const decorated = requireAccessToken({
      providerName: 'test-provider',
      authFlow: 'M2M',
    })((payload: any, accessToken?: string) => ({
      received_token: accessToken,
      payload,
    }));

    app.entrypoint(decorated as any);

    identity.getResourceOauth2Token.mockResolvedValue('oauth2-result-token');

    try {
      const response = await app._handleInvocation(
        makeRequest(
          { input: 'test' },
          { 'X-HW-AgentGateway-Workload-Access-Token': 'workload-token-from-header' },
        ),
      );

      expect(response.statusCode).toBe(200);
      const body = jsonBody(response);
      expect(body['received_token']).toBe('oauth2-result-token');
      expect(body['payload']).toEqual({ input: 'test' });
    } finally {
      AgentArtsRuntimeContext.clear();
    }
  });

  it('async handler with require access token gets token from context', async () => {
    const app = new AgentArtsRuntimeApp();

    const decorated = requireAccessToken({
      providerName: 'test-provider',
      authFlow: 'M2M',
    })(async (payload: any, accessToken?: string) => ({
      received_token: accessToken,
      payload,
    }));

    app.entrypoint(decorated as any);

    identity.getResourceOauth2Token.mockResolvedValue('oauth2-result-token');

    try {
      const response = await app._handleInvocation(
        makeRequest(
          { input: 'async-test' },
          { 'X-HW-AgentGateway-Workload-Access-Token': 'workload-token-from-header' },
        ),
      );

      expect(response.statusCode).toBe(200);
      const body = jsonBody(response);
      expect(body['received_token']).toBe('oauth2-result-token');
    } finally {
      AgentArtsRuntimeContext.clear();
    }
  });

  it('sync handler checks workload token in context', async () => {
    const app = new AgentArtsRuntimeApp();

    const captured: { token: string | null } = { token: null };

    app.entrypoint(() => {
      captured.token = AgentArtsRuntimeContext.getWorkloadAccessToken();
      return { captured_token: captured.token };
    });

    try {
      const response = await app._handleInvocation(
        makeRequest(
          { input: 'test' },
          { 'X-HW-AgentGateway-Workload-Access-Token': 'direct-token-test' },
        ),
      );

      expect(response.statusCode).toBe(200);
      expect(captured.token).toBe('direct-token-test');
    } finally {
      AgentArtsRuntimeContext.clear();
    }
  });

  it('require access token wrapper reads context directly', async () => {
    AgentArtsRuntimeContext.clear();
    AgentArtsRuntimeContext.setWorkloadAccessToken('context-token-direct');

    try {
      const token = await getWorkloadAccessToken({} as any);
      expect(token).toBe('context-token-direct');
    } finally {
      AgentArtsRuntimeContext.clear();
    }
  });

  it('invoke handler copies context to thread', async () => {
    // Python copies contextvars with `copy_context()` before running the sync
    // handler in the thread pool; here the handler always runs inside the
    // caller's `AsyncLocalStorage` scope, which `runInNewContext` emulates.
    const app = new AgentArtsRuntimeApp();

    let capturedValue: string | null = null;

    await AgentArtsRuntimeContext.runInNewContext(async () => {
      AgentArtsRuntimeContext.setSessionId('value-set-in-async');

      const syncHandler = () => {
        capturedValue = AgentArtsRuntimeContext.getSessionId();
        return { captured: capturedValue };
      };

      const context = new RequestContext({
        sessionId: 'test',
        requestId: 'req-1',
        request: null,
      });
      const result = await app._invokeHandler(syncHandler, context, false, {});

      expect(result['captured']).toBe('value-set-in-async');
    });

    expect(capturedValue).toBe('value-set-in-async');
  });

  it('run async in sync context preserves context', async () => {
    // `run_async_in_sync_context` has no blocking equivalent in Node.js: it
    // returns the promise. The important part is that the context is preserved
    // across the async boundary.
    const result = await AgentArtsRuntimeContext.runInNewContext(async () => {
      AgentArtsRuntimeContext.setUserId('value-in-sync-context');

      const asyncCoro = (async () => {
        await Promise.resolve();
        return AgentArtsRuntimeContext.getUserId();
      })();

      return runAsyncInSyncContext(asyncCoro);
    });

    expect(result).toBe('value-in-sync-context');
  });

  it('consecutive requests context isolation', async () => {
    const app = new AgentArtsRuntimeApp();

    const capturedTokens: Array<string | null> = [];

    app.entrypoint(() => {
      capturedTokens.push(AgentArtsRuntimeContext.getWorkloadAccessToken());
      return { status: 'ok' };
    });

    AgentArtsRuntimeContext.clear();

    const response1 = await app._handleInvocation(
      makeRequest({ input: 'first' }, { 'X-HW-AgentGateway-Workload-Access-Token': 'first-request-token' }),
    );
    expect(response1.statusCode).toBe(200);
    expect(capturedTokens[capturedTokens.length - 1]).toBe('first-request-token');

    const response2 = await app._handleInvocation(makeRequest({ input: 'second' }));
    expect(response2.statusCode).toBe(200);

    expect(
      capturedTokens[capturedTokens.length - 1],
      'Second request should NOT have workload_access_token from first request.',
    ).toBeNull();

    AgentArtsRuntimeContext.clear();
  });

  it('consecutive requests different tokens', async () => {
    const app = new AgentArtsRuntimeApp();

    const capturedTokens: Array<string | null> = [];

    app.entrypoint(() => {
      capturedTokens.push(AgentArtsRuntimeContext.getWorkloadAccessToken());
      return { status: 'ok' };
    });

    AgentArtsRuntimeContext.clear();

    const response1 = await app._handleInvocation(
      makeRequest({ input: 'first' }, { 'X-HW-AgentGateway-Workload-Access-Token': 'token-A' }),
    );
    expect(response1.statusCode).toBe(200);

    const response2 = await app._handleInvocation(
      makeRequest({ input: 'second' }, { 'X-HW-AgentGateway-Workload-Access-Token': 'token-B' }),
    );
    expect(response2.statusCode).toBe(200);

    expect(capturedTokens, 'Each request should have its own token.').toEqual([
      'token-A',
      'token-B',
    ]);

    AgentArtsRuntimeContext.clear();
  });

  it('require api key context isolation', async () => {
    // `requireApiKey` benefits from context clearing: the token from the first
    // request must not leak into the second one.
    const app = new AgentArtsRuntimeApp();

    const capturedWorkloadTokens: Array<string | null> = [];

    app.entrypoint(() => {
      capturedWorkloadTokens.push(AgentArtsRuntimeContext.getWorkloadAccessToken());
      return { status: 'ok' };
    });

    AgentArtsRuntimeContext.clear();

    const response1 = await app._handleInvocation(
      makeRequest({ input: 'first' }, { 'X-HW-AgentGateway-Workload-Access-Token': 'token-A' }),
    );
    expect(response1.statusCode).toBe(200);
    expect(capturedWorkloadTokens[capturedWorkloadTokens.length - 1]).toBe('token-A');

    const response2 = await app._handleInvocation(makeRequest({ input: 'second' }));
    expect(response2.statusCode).toBe(200);
    expect(
      capturedWorkloadTokens[capturedWorkloadTokens.length - 1],
      'Second request should NOT see token from first request.',
    ).toBeNull();

    AgentArtsRuntimeContext.clear();
  });

  it('require sts token context isolation', async () => {
    // `requireStsToken` benefits from context clearing: the token from the first
    // request must not leak into the second one.
    const app = new AgentArtsRuntimeApp();

    const capturedWorkloadTokens: Array<string | null> = [];

    app.entrypoint(() => {
      capturedWorkloadTokens.push(AgentArtsRuntimeContext.getWorkloadAccessToken());
      return { status: 'ok' };
    });

    AgentArtsRuntimeContext.clear();

    const response1 = await app._handleInvocation(
      makeRequest({ input: 'first' }, { 'X-HW-AgentGateway-Workload-Access-Token': 'token-A' }),
    );
    expect(response1.statusCode).toBe(200);
    expect(capturedWorkloadTokens[capturedWorkloadTokens.length - 1]).toBe('token-A');

    const response2 = await app._handleInvocation(makeRequest({ input: 'second' }));
    expect(response2.statusCode).toBe(200);
    expect(
      capturedWorkloadTokens[capturedWorkloadTokens.length - 1],
      'Second request should NOT see token from first request.',
    ).toBeNull();

    AgentArtsRuntimeContext.clear();
  });

  it('concurrent requests have isolated context', async () => {
    const app = new AgentArtsRuntimeApp();

    const results: Record<string, string | null> = {};

    app.entrypoint((payload) => {
      const token = AgentArtsRuntimeContext.getWorkloadAccessToken();
      results[payload['id']] = token;
      return { id: payload['id'], token };
    });

    AgentArtsRuntimeContext.clear();

    const makeRequestFor = (requestId: string, tokenValue: string | null) =>
      makeRequest(
        { id: requestId },
        tokenValue ? { 'X-HW-AgentGateway-Workload-Access-Token': tokenValue } : {},
      );

    await Promise.all([
      app._handleInvocation(makeRequestFor('req-A', 'token-A')),
      app._handleInvocation(makeRequestFor('req-B', 'token-B')),
      app._handleInvocation(makeRequestFor('req-C', null)),
    ]);

    expect(results['req-A']).toBe('token-A');
    expect(results['req-B']).toBe('token-B');
    expect(results['req-C']).toBeNull();

    AgentArtsRuntimeContext.clear();
  });

  it('decorator reads same token as invocation header', async () => {
    const app = new AgentArtsRuntimeApp();

    const invocationToken = 'workload-token-from-invocation-header';

    const decorated = requireAccessToken({
      providerName: 'test-provider',
      authFlow: 'M2M',
    })((payload: any, accessToken?: string) => ({ received_oauth_token: accessToken }));

    app.entrypoint(decorated as any);

    identity.getResourceOauth2Token.mockResolvedValue('oauth2-result-token');

    try {
      const response = await app._handleInvocation(
        makeRequest(
          { input: 'test' },
          { 'X-HW-AgentGateway-Workload-Access-Token': invocationToken },
        ),
      );

      expect(response.statusCode).toBe(200);

      expect(identity.getResourceOauth2Token).toHaveBeenCalledOnce();

      const callOptions = identity.getResourceOauth2Token.mock.calls[0][0];

      expect(
        callOptions.workloadAccessToken,
        'Decorator should use the SAME token from invocation header.',
      ).toBe(invocationToken);

      const body = jsonBody(response);
      expect(body['received_oauth_token']).toBe('oauth2-result-token');
    } finally {
      AgentArtsRuntimeContext.clear();
    }
  });

  it('async decorator reads same token as invocation header', async () => {
    const app = new AgentArtsRuntimeApp();

    const invocationToken = 'async-workload-token-from-header';

    const decorated = requireAccessToken({
      providerName: 'test-provider',
      authFlow: 'M2M',
    })(async (payload: any, accessToken?: string) => ({ received_oauth_token: accessToken }));

    app.entrypoint(decorated as any);

    identity.getResourceOauth2Token.mockResolvedValue('oauth2-result-token');

    try {
      const response = await app._handleInvocation(
        makeRequest(
          { input: 'async-test' },
          { 'X-HW-AgentGateway-Workload-Access-Token': invocationToken },
        ),
      );

      expect(response.statusCode).toBe(200);

      const callOptions = identity.getResourceOauth2Token.mock.calls[0][0];

      expect(
        callOptions.workloadAccessToken,
        'Async decorator should use the SAME token from invocation header.',
      ).toBe(invocationToken);
    } finally {
      AgentArtsRuntimeContext.clear();
    }
  });
});
