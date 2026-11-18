/**
 * Unit tests for the runtime context.
 *
 * Ported 1:1 from `tests/unit/sdk/runtime/test_context.py`.
 *
 * Python uses `contextvars`; the Node.js port uses `AsyncLocalStorage` with a
 * module-level fallback store, so reads outside a request scope behave like
 * Python's default context.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { AgentArtsRuntimeContext } from 'agentarts-sdk/sdk/runtime/context';

beforeEach(() => {
  AgentArtsRuntimeContext.clear();
});

describe('TestContext', () => {
  it('user id context', () => {
    // GIVEN: Initial state (should be None)
    expect(AgentArtsRuntimeContext.getUserId()).toBeNull();

    // WHEN: Setting user_id
    AgentArtsRuntimeContext.setUserId('test-user-123');

    // THEN: getUserId should return the value
    expect(AgentArtsRuntimeContext.getUserId()).toBe('test-user-123');

    // WHEN: Setting it back to None
    AgentArtsRuntimeContext.setUserId(null);
    expect(AgentArtsRuntimeContext.getUserId()).toBeNull();
  });

  it('user token context', () => {
    // GIVEN: Initial state (should be None)
    expect(AgentArtsRuntimeContext.getUserToken()).toBeNull();

    // WHEN: Setting user_token
    AgentArtsRuntimeContext.setUserToken('test-token-xyz');

    // THEN: getUserToken should return the value
    expect(AgentArtsRuntimeContext.getUserToken()).toBe('test-token-xyz');

    // WHEN: Setting it back to None
    AgentArtsRuntimeContext.setUserToken(null);
    expect(AgentArtsRuntimeContext.getUserToken()).toBeNull();
  });

  it('oauth2 custom state context', () => {
    // GIVEN: Initial state (should be None)
    expect(AgentArtsRuntimeContext.getOauth2CustomState()).toBeNull();

    // WHEN: Setting oauth2_custom_state
    AgentArtsRuntimeContext.setOauth2CustomState('test-state');

    // THEN: getOauth2CustomState should return the value
    expect(AgentArtsRuntimeContext.getOauth2CustomState()).toBe('test-state');

    // WHEN: Setting it back to None
    AgentArtsRuntimeContext.setOauth2CustomState(null);
    expect(AgentArtsRuntimeContext.getOauth2CustomState()).toBeNull();
  });

  it('request id context', () => {
    AgentArtsRuntimeContext.clear();
    expect(AgentArtsRuntimeContext.getRequestId()).toBeNull();
    AgentArtsRuntimeContext.setRequestId('req-123');
    expect(AgentArtsRuntimeContext.getRequestId()).toBe('req-123');
    AgentArtsRuntimeContext.setRequestId(null);
    expect(AgentArtsRuntimeContext.getRequestId()).toBeNull();
  });

  it('session id context', () => {
    AgentArtsRuntimeContext.clear();
    expect(AgentArtsRuntimeContext.getSessionId()).toBeNull();
    AgentArtsRuntimeContext.setSessionId('sess-123');
    expect(AgentArtsRuntimeContext.getSessionId()).toBe('sess-123');
    AgentArtsRuntimeContext.setSessionId(null);
    expect(AgentArtsRuntimeContext.getSessionId()).toBeNull();
  });
});
