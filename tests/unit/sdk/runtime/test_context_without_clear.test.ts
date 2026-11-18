/**
 * Demonstration test showing what happens WITHOUT context clearing.
 *
 * Ported 1:1 from `tests/unit/sdk/runtime/test_context_without_clear.py`.
 *
 * This test simulates the original bug scenario where:
 * 1. Request 1 sets workload_access_token
 * 2. Request ends WITHOUT clearing context
 * 3. Request 2 sees Request 1's token (LEAKED!)
 *
 * The normal `/invocations` flow always clears the context (`finally` block in
 * `_handleInvocation`), so these tests bypass it and call `_buildRequestContext`
 * + `_invokeHandler` directly, exactly like the Python originals.
 */

import { describe, it, expect } from 'vitest';

import { AgentArtsRuntimeApp, AgentArtsRuntimeContext } from 'agentarts-sdk/sdk/runtime';

/** Build a `Request`-like object for the invocation helpers. */
function makeRequest(
  body: any,
  headers: Record<string, string> = {},
): { headers: Record<string, string>; json: () => Promise<any> } {
  return { headers, json: async () => body };
}

function lastCaptured(tokens: Array<string | null>): string | null {
  return tokens[tokens.length - 1];
}

describe('TestContextWithoutClearing', () => {
  it('token leaks without clear', async () => {
    const app = new AgentArtsRuntimeApp();

    const capturedTokens: Array<string | null> = [];

    const syncHandler = app.entrypoint(() => {
      capturedTokens.push(AgentArtsRuntimeContext.getWorkloadAccessToken());
      return { status: 'ok' };
    });

    AgentArtsRuntimeContext.clear();

    const requestContext1 = app._buildRequestContext(
      makeRequest(
        { input: 'first' },
        { 'X-HW-AgentGateway-Workload-Access-Token': 'expired-token-from-request-1' },
      ),
    );
    await app._invokeHandler(syncHandler, requestContext1, false, { input: 'first' });

    expect(lastCaptured(capturedTokens)).toBe('expired-token-from-request-1');

    AgentArtsRuntimeContext.setWorkloadAccessToken('expired-token-from-request-1');

    const requestContext2 = app._buildRequestContext(makeRequest({ input: 'second' }));
    await app._invokeHandler(syncHandler, requestContext2, false, { input: 'second' });

    // BUG: Request 2 sees the token from Request 1.
    expect(
      lastCaptured(capturedTokens),
      'BUG: Request 2 sees token from Request 1!',
    ).toBe('expired-token-from-request-1');

    AgentArtsRuntimeContext.clear();
  });

  it('real world scenario without clear', async () => {
    const app = new AgentArtsRuntimeApp();

    const syncHandler = app.entrypoint((payload) => ({
      user: payload?.['user'],
      token_used: AgentArtsRuntimeContext.getWorkloadAccessToken(),
    }));

    AgentArtsRuntimeContext.clear();

    const requestContextA = app._buildRequestContext(
      makeRequest(
        { user: 'User-A' },
        { 'X-HW-AgentGateway-Workload-Access-Token': 'user-a-token-WILL-EXPIRE' },
      ),
    );
    const resultA = await app._invokeHandler(syncHandler, requestContextA, false, {
      user: 'User-A',
    });

    expect(resultA['token_used']).toBe('user-a-token-WILL-EXPIRE');

    AgentArtsRuntimeContext.setWorkloadAccessToken('user-a-token-WILL-EXPIRE');

    const requestContextB = app._buildRequestContext(makeRequest({ user: 'User-B' }));
    const resultB = await app._invokeHandler(syncHandler, requestContextB, false, {
      user: 'User-B',
    });

    // BUG: User-B is using User-A's expired token.
    expect(resultB['token_used'], "BUG: User-B is using User-A's token!").toBe(
      'user-a-token-WILL-EXPIRE',
    );

    AgentArtsRuntimeContext.clear();
  });

  it('with clear fixes the problem', async () => {
    const app = new AgentArtsRuntimeApp();

    const capturedTokens: Array<string | null> = [];

    const syncHandler = app.entrypoint(() => {
      capturedTokens.push(AgentArtsRuntimeContext.getWorkloadAccessToken());
      return { status: 'ok' };
    });

    AgentArtsRuntimeContext.clear();

    const requestContext1 = app._buildRequestContext(
      makeRequest({ input: 'first' }, { 'X-HW-AgentGateway-Workload-Access-Token': 'token-A' }),
    );
    await app._invokeHandler(syncHandler, requestContext1, false, { input: 'first' });

    expect(lastCaptured(capturedTokens)).toBe('token-A');

    AgentArtsRuntimeContext.clear();

    const requestContext2 = app._buildRequestContext(makeRequest({ input: 'second' }));
    await app._invokeHandler(syncHandler, requestContext2, false, { input: 'second' });

    // FIXED: Request 2 must NOT see the token from Request 1.
    expect(
      lastCaptured(capturedTokens),
      'FIXED: Request 2 should NOT see token from Request 1.',
    ).toBeNull();

    AgentArtsRuntimeContext.clear();
  });
});
