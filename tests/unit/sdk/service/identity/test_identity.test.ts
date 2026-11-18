/**
 * Unit tests for the Agent Identity client.
 *
 * Ported 1:1 from `tests/unit/sdk/service/identity/test_identity.py`.
 *
 * The Python suite injects a `MagicMock(spec=AgentIdentityClient)` into the
 * constructor; the port accepts the same `client` argument, so every SDK call is
 * observed on a mocked instance. `_shouldRetry` is a static method in TS
 * (`IdentityClient._shouldRetry`) instead of an instance method.
 *
 * The Python client is built eagerly in `__init__`; the port creates it lazily in
 * `_ensureClient()`, so tests that need the built configuration drive one public
 * call to trigger creation.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SdkException } from '@huaweicloud/huaweicloud-sdk-core/exception/SdkException.js';
import { ServiceResponseException } from '@huaweicloud/huaweicloud-sdk-core/exception/ServiceResponseException.js';
import {
  AgentIdentityClient,
  CompleteResourceTokenAuthRequest,
  CreateStsCredentialProviderRequest,
  GetResourceStsTokenRequest,
  StsTag,
  Tag,
  UserIdentifier,
} from 'huaweicloud-sdk-agentidentity';

import { IdentityClient } from 'agentarts-sdk/sdk/service/identity/identity-client';

const REGION = 'ap-southeast-4';

/** An empty object doubling as a `MagicMock(spec=AgentIdentityClient)`. */
function createMockSdkClient(): any {
  return {};
}

function createIdentityClient(mockSdkClient: any): IdentityClient {
  return new IdentityClient(REGION, undefined, mockSdkClient);
}

beforeEach(() => {
  vi.stubEnv('HUAWEICLOUD_SDK_AK', 'test-ak');
  vi.stubEnv('HUAWEICLOUD_SDK_SK', 'test-sk');
  vi.stubEnv('HUAWEICLOUD_SDK_PROJECT_ID', 'test-project');
  vi.stubEnv('HUAWEICLOUD_SDK_REGION', REGION);
  vi.stubEnv('HUAWEICLOUD_SDK_DOMAIN_ID', 'test-domain');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('IdentityClient', () => {
  it('completeResourceTokenAuth forwards the session uri and user identifier', async () => {
    // GIVEN
    const mockSdkClient = createMockSdkClient();
    const mockResponse = { sessionStatus: 'COMPLETED' };
    mockSdkClient.completeResourceTokenAuth = vi.fn(async () => mockResponse);
    const identityClient = createIdentityClient(mockSdkClient);
    const userIdentifier = new UserIdentifier({ userId: 'user-123', userToken: 'token-456' });
    const sessionUri = 'https://example.com/session';

    // WHEN
    const result = await identityClient.completeResourceTokenAuth(sessionUri, userIdentifier);

    // THEN
    expect(result).toBe(mockResponse);
    expect(mockSdkClient.completeResourceTokenAuth).toHaveBeenCalledTimes(1);
    const request = mockSdkClient.completeResourceTokenAuth.mock
      .calls[0]![0] as CompleteResourceTokenAuthRequest;
    expect(request.body?.sessionUri).toBe(sessionUri);
    expect(request.body?.userIdentifier).toBe(userIdentifier);
  });

  it('_shouldRetry retries throttling, server errors and connection errors only', () => {
    // Scenario 1: No exception, no response.
    expect(IdentityClient._shouldRetry(undefined, undefined)).toBe(false);

    // Scenario 2: ServiceResponseException with 429.
    const serviceError = new ServiceResponseException(429, 'Throttled', 'Throttling', 'req-1');
    expect(IdentityClient._shouldRetry(undefined, serviceError)).toBe(true);

    // Scenario 3: ServiceResponseException with 500.
    expect(IdentityClient._shouldRetry(undefined, new ServiceResponseException(500, 'Throttled'))).toBe(
      true,
    );

    // Scenario 4: ServiceResponseException with 400 (should not retry).
    expect(IdentityClient._shouldRetry(undefined, new ServiceResponseException(400, 'Throttled'))).toBe(
      false,
    );

    // Scenario 5: any other SDK exception, e.g. a connection error (should retry).
    const connectionError = new SdkException('Connection error');
    expect(IdentityClient._shouldRetry(undefined, connectionError)).toBe(true);

    // Scenario 6: Response with statusCode 429.
    expect(IdentityClient._shouldRetry({ statusCode: 429 }, undefined)).toBe(true);

    // Scenario 7: Response with statusCode 200 (should not retry).
    expect(IdentityClient._shouldRetry({ statusCode: 200 }, undefined)).toBe(false);
  });

  it('getResourceStsToken forwards every parameter', async () => {
    // GIVEN
    const mockSdkClient = createMockSdkClient();
    const mockCredentials = { accessKeyId: 'ak-1', secretAccessKey: 'sk-1' };
    const mockResponse = { credentials: mockCredentials };
    const mockInvoker: any = {};
    mockInvoker.withRetry = vi.fn(() => mockInvoker);
    mockInvoker.invoke = vi.fn(async () => mockResponse);
    mockSdkClient.getResourceStsTokenInvoker = vi.fn(() => mockInvoker);

    const identityClient = createIdentityClient(mockSdkClient);
    const providerName = 'test-provider';
    const workloadAccessToken = 'test-token';
    const agencySessionName = 'test-session';
    const durationSeconds = 3600;
    const policy = '{"Version": "1.1", "Statement": []}';
    const sourceIdentity = 'test-source-identity';
    const tags = [new StsTag({ key: 'key1', value: 'value1' })];
    const transitiveTagKeys = ['key1'];

    // WHEN
    const result = await identityClient.getResourceStsToken({
      providerName,
      workloadAccessToken,
      agencySessionName,
      durationSeconds,
      policy,
      sourceIdentity,
      tags,
      transitiveTagKeys,
    });

    // THEN
    expect(result).toBe(mockCredentials);
    expect(mockSdkClient.getResourceStsTokenInvoker).toHaveBeenCalledTimes(1);
    const request = mockSdkClient.getResourceStsTokenInvoker.mock
      .calls[0]![0] as GetResourceStsTokenRequest;
    const body = request.body!;
    expect(body.resourceCredentialProviderName).toBe(providerName);
    expect(body.workloadAccessToken).toBe(workloadAccessToken);
    expect(body.agencySessionName).toBe(agencySessionName);
    expect(body.durationSeconds).toBe(durationSeconds);
    expect(body.policy).toBe(policy);
    expect(body.sourceIdentity).toBe(sourceIdentity);
    expect(body.tags).toBe(tags);
    expect(body.transitiveTagKeys).toBe(transitiveTagKeys);
  });

  it('passes ignoreSslVerification to the SDK options when the client is created', async () => {
    // Python patches `HttpConfig` / `AgentIdentityClient` and asserts the flag on
    // the HTTP config at construction time. The port defers client creation, so
    // the assertion happens on the first public call.
    const builtClient: any = {
      listWorkloadIdentities: vi.fn(async () => ({ workloadIdentities: [] })),
    };
    const builder: any = {
      withRegion: vi.fn(() => builder),
      withOptions: vi.fn(() => builder),
      withCredential: vi.fn(() => builder),
      build: vi.fn(() => builtClient),
    };
    vi.spyOn(AgentIdentityClient, 'newBuilder').mockReturnValue(builder);

    // WHEN - passing true (ignore verification -> rejectUnauthorized false).
    await new IdentityClient(REGION, true).listWorkloadIdentities();
    expect(
      builder.withOptions.mock.calls[0]![0].axiosRequestConfig?.httpsAgent?.options
        ?.rejectUnauthorized,
    ).toBe(false);

    // WHEN - passing false (verify -> default agent, no httpsAgent override).
    await new IdentityClient(REGION, false).listWorkloadIdentities();
    expect(builder.withOptions.mock.calls[1]![0].axiosRequestConfig).toBeUndefined();
  });

  it('createStsCredentialProvider returns the credential provider and forwards the tags', async () => {
    // GIVEN
    const mockSdkClient = createMockSdkClient();
    const mockCredentialProvider = { name: 'test-sts-provider' };
    mockSdkClient.createStsCredentialProvider = vi.fn(async () => ({
      credentialProvider: mockCredentialProvider,
    }));
    const identityClient = createIdentityClient(mockSdkClient);
    const name = 'test-sts-provider';
    const agencyUrn = 'iam::123456789:agency:test-agency';
    const tags = [new Tag({ key: 'env', value: 'test' })];

    // WHEN
    const result = await identityClient.createStsCredentialProvider(name, agencyUrn, tags);

    // THEN
    expect(result).toBe(mockCredentialProvider);
    expect(mockSdkClient.createStsCredentialProvider).toHaveBeenCalledTimes(1);
    const request = mockSdkClient.createStsCredentialProvider.mock
      .calls[0]![0] as CreateStsCredentialProviderRequest;
    expect(request.body?.name).toBe(name);
    expect(request.body?.agencyUrn).toBe(agencyUrn);
    expect(request.body?.tags).toBe(tags);
  });

  it('createStsCredentialProvider leaves the tags unset when omitted', async () => {
    // GIVEN
    const mockSdkClient = createMockSdkClient();
    const mockCredentialProvider = { name: 'test-sts-provider' };
    mockSdkClient.createStsCredentialProvider = vi.fn(async () => ({
      credentialProvider: mockCredentialProvider,
    }));
    const identityClient = createIdentityClient(mockSdkClient);
    const name = 'test-sts-provider';
    const agencyUrn = 'iam::123456789:agency:test-agency';

    // WHEN
    const result = await identityClient.createStsCredentialProvider(name, agencyUrn);

    // THEN
    expect(result).toBe(mockCredentialProvider);
    expect(mockSdkClient.createStsCredentialProvider).toHaveBeenCalledTimes(1);
    const request = mockSdkClient.createStsCredentialProvider.mock
      .calls[0]![0] as CreateStsCredentialProviderRequest;
    expect(request.body?.name).toBe(name);
    expect(request.body?.agencyUrn).toBe(agencyUrn);
    expect(request.body?.tags).toBeUndefined();
  });
});
