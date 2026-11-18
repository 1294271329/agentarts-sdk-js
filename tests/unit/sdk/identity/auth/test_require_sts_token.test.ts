/**
 * Unit tests for the `requireStsToken` factory.
 *
 * Ported 1:1 from `tests/unit/sdk/identity/auth/test_require_sts_token.py`.
 *
 * Behavioural mapping:
 * - Verified with the real `getResourceStsToken` options contract: the port
 *   always forwards all eight fields, using `null` for omitted optional values
 *   (Python does the same with `None`), so the assertions stay exact.
 * - Python injects credentials as a keyword argument named by `into`; the
 *   TypeScript factory appends them as the *final positional argument*, so
 *   `into` is documentation-only in the port.
 * - The identity-client module is mocked, so no network access happens.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GetResourceStsTokenResponseBodyCredentials,
  StsTag,
} from 'huaweicloud-sdk-agentidentity';

import { requireStsToken } from 'agentarts-sdk/sdk/identity/auth';
import { AgentArtsRuntimeContext } from 'agentarts-sdk/sdk/runtime/context';

/** Shared `IdentityClient` double (Python's `mock_identity_client` fixture). */
const identity = vi.hoisted(() => ({
  constructorCalls: [] as any[][],
  getResourceStsToken: vi.fn(),
}));

vi.mock('agentarts-sdk/sdk/service/identity/identity-client', () => ({
  IdentityClient: class {
    constructor(...args: any[]) {
      identity.constructorCalls.push(args);
    }

    getResourceStsToken = (...args: any[]): any => identity.getResourceStsToken(...args);
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

describe('requireStsToken', () => {
  it('test_require_sts_token_injects_into_async_function', async () => {
    // GIVEN: A mock identity service and a valid workload token in context
    // Python's dict uses wire keys (access_key/secret_key/security_token);
    // the port injects the typed model with camelCase fields.
    const mockCredentials = new GetResourceStsTokenResponseBodyCredentials({
      accessKeyId: 'ak',
      secretAccessKey: 'sk',
      securityToken: 'token',
    });
    identity.getResourceStsToken.mockResolvedValue(mockCredentials);
    vi.spyOn(AgentArtsRuntimeContext, 'getWorkloadAccessToken').mockReturnValue(
      'workload-token',
    );

    const decoratedFunc = requireStsToken({
      providerName: 'test-provider',
      agencySessionName: 'test-session',
    })(async (stsCredentials?: GetResourceStsTokenResponseBodyCredentials) => stsCredentials);

    // WHEN: The decorated async function is called
    const result = await decoratedFunc();

    // THEN: The injected credentials should match the mock
    expect(result).toEqual(mockCredentials);
    expect(identity.getResourceStsToken).toHaveBeenCalledTimes(1);
  });

  it('test_require_sts_token_injects_into_sync_function', async () => {
    // GIVEN
    const mockCredentials = new GetResourceStsTokenResponseBodyCredentials({
      accessKeyId: 'sync-ak',
      secretAccessKey: 'sync-sk',
    });
    identity.getResourceStsToken.mockResolvedValue(mockCredentials);
    vi.spyOn(AgentArtsRuntimeContext, 'getWorkloadAccessToken').mockReturnValue(
      'workload-token',
    );

    const decoratedFunc = requireStsToken({
      providerName: 'test-provider',
      agencySessionName: 'test-session',
    })((stsCredentials?: GetResourceStsTokenResponseBodyCredentials) => stsCredentials);

    const result = await decoratedFunc();

    expect(result).toEqual(mockCredentials);
  });

  it('test_require_sts_token_custom_parameter_name', async () => {
    // GIVEN: A custom parameter name 'my_sts' for injection
    const mockCredentials = new GetResourceStsTokenResponseBodyCredentials({
      securityToken: 'custom',
    });
    identity.getResourceStsToken.mockResolvedValue(mockCredentials);
    vi.spyOn(AgentArtsRuntimeContext, 'getWorkloadAccessToken').mockReturnValue(
      'workload-token',
    );

    const decoratedFunc = requireStsToken({
      providerName: 'test',
      agencySessionName: 'test-session',
      into: 'mySts',
    })((mySts?: GetResourceStsTokenResponseBodyCredentials) => mySts);

    const result = await decoratedFunc();

    expect(result).toEqual(mockCredentials);
  });

  it('test_require_sts_token_calls_identity_client_correctly', async () => {
    // GIVEN
    identity.getResourceStsToken.mockResolvedValue({});
    vi.spyOn(AgentArtsRuntimeContext, 'getWorkloadAccessToken').mockReturnValue(
      'workload-token',
    );

    const decoratedFunc = requireStsToken({
      providerName: 'specific-provider',
      agencySessionName: 'test-session',
      durationSeconds: 3600,
    })((_stsCredentials?: any) => undefined);

    await decoratedFunc();

    // THEN: omitted optional values are forwarded as `null` (Python's `None`).
    expect(identity.getResourceStsToken).toHaveBeenCalledTimes(1);
    expect(identity.getResourceStsToken).toHaveBeenCalledWith({
      providerName: 'specific-provider',
      workloadAccessToken: 'workload-token',
      agencySessionName: 'test-session',
      durationSeconds: 3600,
      policy: null,
      sourceIdentity: null,
      tags: null,
      transitiveTagKeys: null,
    });
  });

  it('test_require_sts_token_passes_all_parameters', async () => {
    // GIVEN
    identity.getResourceStsToken.mockResolvedValue({});
    vi.spyOn(AgentArtsRuntimeContext, 'getWorkloadAccessToken').mockReturnValue(
      'workload-token',
    );
    const tags = [new StsTag({ key: 'test-key', value: 'test-value' })];

    const decoratedFunc = requireStsToken({
      providerName: 'p',
      agencySessionName: 'test-session',
      policy: 'pol',
      sourceIdentity: 'src',
      tags,
      transitiveTagKeys: ['tk1'],
    })((_stsCredentials?: any) => undefined);

    await decoratedFunc();

    // THEN
    expect(identity.getResourceStsToken).toHaveBeenCalledTimes(1);
    expect(identity.getResourceStsToken).toHaveBeenCalledWith({
      providerName: 'p',
      workloadAccessToken: 'workload-token',
      agencySessionName: 'test-session',
      durationSeconds: null,
      policy: 'pol',
      sourceIdentity: 'src',
      tags,
      transitiveTagKeys: ['tk1'],
    });
  });
});
