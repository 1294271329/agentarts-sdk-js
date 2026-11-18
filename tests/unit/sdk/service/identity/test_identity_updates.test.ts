/**
 * Unit tests for Agent Identity workload identity updates.
 *
 * Ported 1:1 from `tests/unit/sdk/service/identity/test_identity_updates.py`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UpdateWorkloadIdentityRequest } from 'huaweicloud-sdk-agentidentity';

import { IdentityClient } from 'agentarts-sdk/sdk/service/identity/identity-client';

const REGION = 'ap-southeast-4';

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

describe('IdentityClient.updateWorkloadIdentity', () => {
  it('forwards the allowed return urls and returns the workload identity', async () => {
    // GIVEN
    const mockSdkClient = createMockSdkClient();
    const mockWorkload = { name: 'test-workload' };
    mockSdkClient.updateWorkloadIdentity = vi.fn(async () => ({ workloadIdentity: mockWorkload }));
    const identityClient = createIdentityClient(mockSdkClient);
    const name = 'test-workload';
    const urls = ['https://example.com/callback'];

    // WHEN
    const result = await identityClient.updateWorkloadIdentity(name, urls);

    // THEN
    expect(result).toBe(mockWorkload);
    expect(mockSdkClient.updateWorkloadIdentity).toHaveBeenCalledTimes(1);
    const request = mockSdkClient.updateWorkloadIdentity.mock
      .calls[0]![0] as UpdateWorkloadIdentityRequest;
    expect(request.workloadIdentityName).toBe(name);
    expect(request.body?.allowedResourceOauth2ReturnUrls).toBe(urls);
  });

  it('leaves the allowed return urls unset when omitted', async () => {
    // GIVEN
    const mockSdkClient = createMockSdkClient();
    const mockWorkload = { name: 'test-workload' };
    mockSdkClient.updateWorkloadIdentity = vi.fn(async () => ({ workloadIdentity: mockWorkload }));
    const identityClient = createIdentityClient(mockSdkClient);
    const name = 'test-workload';

    // WHEN
    const result = await identityClient.updateWorkloadIdentity(name);

    // THEN
    expect(result).toBe(mockWorkload);
    expect(mockSdkClient.updateWorkloadIdentity).toHaveBeenCalledTimes(1);
    const request = mockSdkClient.updateWorkloadIdentity.mock
      .calls[0]![0] as UpdateWorkloadIdentityRequest;
    expect(request.workloadIdentityName).toBe(name);
    // Python defaults the field to `None`; the port leaves the property unset.
    expect(request.body?.allowedResourceOauth2ReturnUrls).toBeUndefined();
  });

  it('propagates SDK errors', async () => {
    // GIVEN
    const mockSdkClient = createMockSdkClient();
    mockSdkClient.updateWorkloadIdentity = vi.fn(async () => {
      throw new Error('SDK Error');
    });
    const identityClient = createIdentityClient(mockSdkClient);

    // WHEN / THEN
    await expect(identityClient.updateWorkloadIdentity('test-workload')).rejects.toThrow(
      'SDK Error',
    );
  });
});
