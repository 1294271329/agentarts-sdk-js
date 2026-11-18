/**
 * Unit tests for Agent Identity workload identity reads.
 *
 * Ported 1:1 from `tests/unit/sdk/service/identity/test_workload_identities.py`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GetWorkloadIdentityRequest,
  ListWorkloadIdentitiesRequest,
} from 'huaweicloud-sdk-agentidentity';

import { IdentityClient } from 'agentarts-sdk/sdk/service/identity/identity-client';

const REGION = 'ap-southeast-4';

function createMockSdkClient(): any {
  return {};
}

function buildIdentityClient(mockSdkClient: any): IdentityClient {
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

describe('IdentityClient workload identities', () => {
  it('getWorkloadIdentity returns the workload identity', async () => {
    // GIVEN
    const mockSdkClient = createMockSdkClient();
    const identityClient = buildIdentityClient(mockSdkClient);
    const mockWorkload = { name: 'test-workload' };
    mockSdkClient.getWorkloadIdentity = vi.fn(async () => ({ workloadIdentity: mockWorkload }));
    const name = 'test-workload';

    // WHEN
    const result = await identityClient.getWorkloadIdentity(name);

    // THEN
    expect(result).toBe(mockWorkload);
    expect(mockSdkClient.getWorkloadIdentity).toHaveBeenCalledTimes(1);
    const request = mockSdkClient.getWorkloadIdentity.mock.calls[0]![0] as GetWorkloadIdentityRequest;
    expect(request.workloadIdentityName).toBe(name);
  });

  it('listWorkloadIdentities returns the workloads and forwards the pagination', async () => {
    // GIVEN
    const mockSdkClient = createMockSdkClient();
    const identityClient = buildIdentityClient(mockSdkClient);
    const mockWorkloads = [{ name: 'wl-1' }, { name: 'wl-2' }];
    mockSdkClient.listWorkloadIdentities = vi.fn(async () => ({
      workloadIdentities: mockWorkloads,
    }));

    // WHEN
    const result = await identityClient.listWorkloadIdentities(10, 'next-page');

    // THEN
    expect(result).toBe(mockWorkloads);
    expect(mockSdkClient.listWorkloadIdentities).toHaveBeenCalledTimes(1);
    const request = mockSdkClient.listWorkloadIdentities.mock
      .calls[0]![0] as ListWorkloadIdentitiesRequest;
    expect(request.limit).toBe(10);
    expect(request.marker).toBe('next-page');
  });

  it('listWorkloadIdentities returns an empty list when the response is empty', async () => {
    // GIVEN
    const mockSdkClient = createMockSdkClient();
    const identityClient = buildIdentityClient(mockSdkClient);
    mockSdkClient.listWorkloadIdentities = vi.fn(async () => ({ workloadIdentities: null }));

    // WHEN
    const result = await identityClient.listWorkloadIdentities();

    // THEN
    expect(result).toEqual([]);
    expect(mockSdkClient.listWorkloadIdentities).toHaveBeenCalledTimes(1);
    const request = mockSdkClient.listWorkloadIdentities.mock
      .calls[0]![0] as ListWorkloadIdentitiesRequest;
    expect(request.limit).toBeUndefined();
    expect(request.marker).toBeUndefined();
  });
});
