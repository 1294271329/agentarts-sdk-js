/**
 * Unit tests for the `requireAccessToken` factory.
 *
 * Ported 1:1 from `tests/unit/sdk/identity/auth/test_require_access_token.py`.
 *
 * Behavioural mapping:
 * - The Python decorator injects the token as a keyword argument named by
 *   `into`; the TypeScript factory returns a wrapper that appends the injected
 *   value as the *final positional argument* (TypeScript has no keyword
 *   arguments). `into` stays on the options object for documentation/parity.
 * - Python patches `agentarts.sdk.identity.auth.IdentityClient`; here the
 *   identity-client module is mocked, so `requireAccessToken` never touches the
 *   network (the port builds its `IdentityClient` lazily, so mocking the class
 *   is enough to keep it offline).
 * - Python patches `AgentArtsRuntimeContext.get_workload_access_token` with
 *   `patch.object`; that becomes `vi.spyOn` on the `AgentArtsRuntimeContext`
 *   static method.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { requireAccessToken } from 'agentarts-sdk/sdk/identity/auth';
import { Config } from 'agentarts-sdk/sdk/identity/config';
import { AgentArtsRuntimeContext } from 'agentarts-sdk/sdk/runtime/context';

/** Shared `IdentityClient` double (Python's `mock_identity_client` fixture). */
const identity = vi.hoisted(() => ({
  /** Arguments of every `new IdentityClient(...)` call. */
  constructorCalls: [] as any[][],
  getResourceOauth2Token: vi.fn(),
  getResourceApiKey: vi.fn(),
  createWorkloadIdentity: vi.fn(),
  createWorkloadAccessToken: vi.fn(),
}));

vi.mock('agentarts-sdk/sdk/service/identity/identity-client', () => ({
  IdentityClient: class {
    constructor(...args: any[]) {
      identity.constructorCalls.push(args);
    }

    getResourceOauth2Token = (...args: any[]): any => identity.getResourceOauth2Token(...args);
    createWorkloadIdentity = (...args: any[]): any => identity.createWorkloadIdentity(...args);
    createWorkloadAccessToken = (...args: any[]): any =>
      identity.createWorkloadAccessToken(...args);
  },
}));

beforeEach(() => {
  AgentArtsRuntimeContext.clear();
  identity.constructorCalls.length = 0;
});

afterEach(() => {
  AgentArtsRuntimeContext.clear();
  vi.unstubAllEnvs();
});

describe('requireAccessToken', () => {
  it('test_require_access_token_injects_token_into_async_function', async () => {
    // GIVEN: A mock identity service and a valid workload token in context
    identity.getResourceOauth2Token.mockResolvedValue('mock-token-123');
    vi.spyOn(AgentArtsRuntimeContext, 'getWorkloadAccessToken').mockReturnValue(
      'workload-token',
    );

    const decoratedFunc = requireAccessToken({
      providerName: 'test-provider',
      scopes: ['read'],
      authFlow: 'M2M',
    })(async (accessToken?: string) => accessToken);

    // WHEN: The decorated async function is called
    const result = await decoratedFunc();

    // THEN: The injected token should match the mock, and the client should be called correctly
    expect(result).toBe('mock-token-123');
    expect(identity.getResourceOauth2Token).toHaveBeenCalledTimes(1);

    // Verify arguments passed to IdentityClient
    const args = identity.getResourceOauth2Token.mock.calls[0]![0] as Record<string, any>;
    expect(args['providerName']).toBe('test-provider');
    expect(args['scopes']).toEqual(['read']);
  });

  it('test_require_access_token_injects_token_into_sync_function', async () => {
    // GIVEN: A mock identity service and a valid workload token in context
    identity.getResourceOauth2Token.mockResolvedValue('sync-mock-token');
    vi.spyOn(AgentArtsRuntimeContext, 'getWorkloadAccessToken').mockReturnValue(
      'workload-token',
    );

    const decoratedFunc = requireAccessToken({
      providerName: 'test-provider',
      scopes: ['read'],
      authFlow: 'M2M',
    })((accessToken?: string) => accessToken);

    // WHEN: The decorated sync function is called
    const result = await decoratedFunc();

    // THEN: The injected token should match the mock
    expect(result).toBe('sync-mock-token');
  });

  it('test_require_access_token_injects_into_custom_parameter_name', async () => {
    // GIVEN: A custom parameter name 'my_special_token' for injection
    identity.getResourceOauth2Token.mockResolvedValue('custom-token');
    vi.spyOn(AgentArtsRuntimeContext, 'getWorkloadAccessToken').mockReturnValue(
      'workload-token',
    );

    const decoratedFunc = requireAccessToken({
      providerName: 'test',
      scopes: ['read'],
      authFlow: 'M2M',
      into: 'mySpecialToken',
    })(async (mySpecialToken?: string) => mySpecialToken);

    // WHEN: The decorated function is called
    const result = await decoratedFunc();

    // THEN: The token should be injected into the specified parameter name
    expect(result).toBe('custom-token');
  });

  it('test_require_access_token_falls_back_to_local_auth_when_context_is_empty', async () => {
    // GIVEN: No workload token in context and no existing local config
    identity.createWorkloadIdentity.mockResolvedValue({ name: 'new-workload' });
    identity.createWorkloadAccessToken.mockResolvedValue('local-workload-token');
    identity.getResourceOauth2Token.mockResolvedValue('final-resource-token');

    vi.spyOn(AgentArtsRuntimeContext, 'getWorkloadAccessToken').mockReturnValue(null);

    const config = new Config();
    config.workloadIdentityName = null;
    config.userId = null;
    const save = vi.spyOn(config, 'save').mockImplementation(() => undefined);
    vi.spyOn(Config, 'load').mockReturnValue(config);

    const decoratedFunc = requireAccessToken({
      providerName: 'test',
      scopes: ['read'],
      authFlow: 'M2M',
    })(async (accessToken?: string) => accessToken);

    // WHEN: The decorated function is called
    const result = await decoratedFunc();

    // THEN: It should fallback to local identity creation and save the config
    expect(result).toBe('final-resource-token');
    expect(identity.createWorkloadIdentity).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalled();
  });

  it('test_require_access_token_uses_user_id_from_context_in_local_fallback', async () => {
    // GIVEN: No workload token, but a user id in context
    vi.spyOn(AgentArtsRuntimeContext, 'getWorkloadAccessToken').mockReturnValue(null);
    AgentArtsRuntimeContext.setUserId('context-user-id');

    const config = new Config({ workloadIdentityName: 'test-workload' });
    vi.spyOn(config, 'save').mockImplementation(() => undefined);
    vi.spyOn(Config, 'load').mockReturnValue(config);

    identity.createWorkloadAccessToken.mockResolvedValue('local-workload-token');
    identity.getResourceOauth2Token.mockResolvedValue('final-token');

    const decoratedFunc = requireAccessToken({
      providerName: 'test',
      scopes: ['read'],
      authFlow: 'M2M',
    })(async (accessToken?: string) => accessToken);

    try {
      // WHEN: Calling the decorated function
      const result = await decoratedFunc();

      // THEN: It should use the user id from context.
      // Python calls `create_workload_access_token(name, user_id=...)`; the port
      // has no keyword arguments, so the user id is the third positional argument.
      expect(result).toBe('final-token');
      expect(identity.createWorkloadAccessToken).toHaveBeenCalledTimes(1);
      expect(identity.createWorkloadAccessToken).toHaveBeenCalledWith(
        'test-workload',
        undefined,
        'context-user-id',
      );
    } finally {
      AgentArtsRuntimeContext.setUserId(null);
    }
  });

  it('test_require_access_token_passes_ignore_ssl_verification', async () => {
    // Explicitly set the region env variable so the test is deterministic
    vi.stubEnv('HUAWEICLOUD_SDK_REGION', 'ap-southeast-4');

    vi.spyOn(AgentArtsRuntimeContext, 'getWorkloadAccessToken').mockReturnValue(
      'workload-token',
    );
    identity.getResourceOauth2Token.mockResolvedValue('mock-token');

    const decoratedFunc = requireAccessToken({
      providerName: 'test',
      scopes: ['read'],
      authFlow: 'M2M',
      ignoreSslVerification: true,
    })((accessToken?: string) => accessToken);

    // WHEN: The decorated function is called
    const result = await decoratedFunc();

    // THEN: IdentityClient should be constructed with ignoreSslVerification=true.
    // Python uses keyword arguments; the port passes them positionally.
    expect(result).toBe('mock-token');
    expect(identity.constructorCalls).toEqual([['ap-southeast-4', true]]);
  });
});
