/**
 * Unit tests for the `requireApiKey` factory.
 *
 * Ported 1:1 from `tests/unit/sdk/identity/auth/test_require_api_key.py`.
 *
 * Behavioural mapping:
 * - The Python decorator injects the API key as a keyword argument named by
 *   `into`; the TypeScript factory appends the injected key as the *final
 *   positional argument* (TypeScript has no keyword arguments), so `into` is
 *   documentation-only in the port.
 * - Python patches `agentarts.sdk.identity.auth.IdentityClient`; here the
 *   identity-client module is mocked and never performs network I/O.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { requireApiKey } from 'agentarts-sdk/sdk/identity/auth';
import { AgentArtsRuntimeContext } from 'agentarts-sdk/sdk/runtime/context';

/** Shared `IdentityClient` double (Python's `mock_identity_client` fixture). */
const identity = vi.hoisted(() => ({
  constructorCalls: [] as any[][],
  getResourceApiKey: vi.fn(),
}));

vi.mock('agentarts-sdk/sdk/service/identity/identity-client', () => ({
  IdentityClient: class {
    constructor(...args: any[]) {
      identity.constructorCalls.push(args);
    }

    getResourceApiKey = (...args: any[]): any => identity.getResourceApiKey(...args);
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

describe('requireApiKey', () => {
  it('test_require_api_key_injects_into_async_function', async () => {
    // GIVEN: A mock identity service and a valid workload token in context
    identity.getResourceApiKey.mockResolvedValue('mock-api-key-123');
    vi.spyOn(AgentArtsRuntimeContext, 'getWorkloadAccessToken').mockReturnValue(
      'workload-token',
    );

    const decoratedFunc = requireApiKey({ providerName: 'test-provider' })(
      async (apiKey?: string) => apiKey,
    );

    // WHEN: The decorated async function is called
    const result = await decoratedFunc();

    // THEN: The injected key should match the mock
    expect(result).toBe('mock-api-key-123');
    expect(identity.getResourceApiKey).toHaveBeenCalledTimes(1);
  });

  it('test_require_api_key_injects_into_sync_function', async () => {
    // GIVEN: A mock identity service and a valid workload token in context
    identity.getResourceApiKey.mockResolvedValue('sync-api-key');
    vi.spyOn(AgentArtsRuntimeContext, 'getWorkloadAccessToken').mockReturnValue(
      'workload-token',
    );

    const decoratedFunc = requireApiKey({ providerName: 'test-provider' })(
      (apiKey?: string) => apiKey,
    );

    const result = await decoratedFunc();

    expect(result).toBe('sync-api-key');
  });

  it('test_require_api_key_custom_parameter_name', async () => {
    // GIVEN: A custom parameter name 'my_key' for injection
    identity.getResourceApiKey.mockResolvedValue('custom-key');
    vi.spyOn(AgentArtsRuntimeContext, 'getWorkloadAccessToken').mockReturnValue(
      'workload-token',
    );

    const decoratedFunc = requireApiKey({ providerName: 'test', into: 'myKey' })(
      (myKey?: string) => myKey,
    );

    const result = await decoratedFunc();

    expect(result).toBe('custom-key');
  });

  it('test_require_api_key_calls_identity_client_correctly', async () => {
    // GIVEN
    identity.getResourceApiKey.mockResolvedValue('key');
    vi.spyOn(AgentArtsRuntimeContext, 'getWorkloadAccessToken').mockReturnValue(
      'workload-token',
    );

    const decoratedFunc = requireApiKey({ providerName: 'specific-provider' })(
      (_apiKey?: string) => undefined,
    );

    // WHEN
    await decoratedFunc();

    // THEN: Python passes keyword arguments; the port passes one options object.
    expect(identity.getResourceApiKey).toHaveBeenCalledTimes(1);
    expect(identity.getResourceApiKey).toHaveBeenCalledWith({
      providerName: 'specific-provider',
      workloadAccessToken: 'workload-token',
    });
  });
});
