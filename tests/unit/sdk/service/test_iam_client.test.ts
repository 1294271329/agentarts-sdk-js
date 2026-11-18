/**
 * Unit tests for the IAM client.
 *
 * Ported 1:1 from `tests/unit/sdk/service/test_iam_client.py`.
 *
 * The Python suite patches `IAMClient._get_iam_client` and
 * `huaweicloudsdkiam.v5.IamClient.new_builder`; the port exposes the same seams
 * (`_getIamClient`, `IamClient.newBuilder`) and they are stubbed with
 * `vi.spyOn`. Environment credentials are stubbed so `createCredential()` never
 * touches the profile file or the instance metadata service.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IamClient } from '@huaweicloud/huaweicloud-sdk-iam/v5/IamClient.js';
import type { CreateAgencyV5Request } from '@huaweicloud/huaweicloud-sdk-iam/v5/model/CreateAgencyV5Request.js';
import type { ListAgenciesV5Request } from '@huaweicloud/huaweicloud-sdk-iam/v5/model/ListAgenciesV5Request.js';
import type { ListPoliciesV5Request } from '@huaweicloud/huaweicloud-sdk-iam/v5/model/ListPoliciesV5Request.js';

import { IAMClient } from 'agentarts-sdk/sdk/service/iam-client';

const TRUST_POLICY =
  '{"Version": "5.0", "Statement": [{"Action": ["sts:agencies:assume"], "Effect": "Allow", ' +
  '"Principal": {"Service": ["service.WorkloadSandboxMetadata"]}}]}';

const POLICY_NAME = 'AgentArtsCoreGatewayIdentityAgencyPolicy';

/** Stub `IAMClient._getIamClient()` (private in TS, same seam as Python's mock). */
function stubIamSdkClient(mockInstance: any) {
  return vi
    .spyOn(IAMClient.prototype as unknown as { _getIamClient(): Promise<any> }, '_getIamClient')
    .mockResolvedValue(mockInstance);
}

/** Stub `IamClient.newBuilder()` with a chainable builder returning `mockInstance`. */
function stubIamBuilder(mockInstance: any): any {
  const builder: any = {
    withCredential: vi.fn(() => builder),
    withRegion: vi.fn(() => builder),
    withOptions: vi.fn(() => builder),
    build: vi.fn(() => mockInstance),
  };
  vi.spyOn(IamClient, 'newBuilder').mockReturnValue(builder);
  return builder;
}

beforeEach(() => {
  vi.stubEnv('HUAWEICLOUD_SDK_AK', 'test-ak');
  vi.stubEnv('HUAWEICLOUD_SDK_SK', 'test-sk');
  vi.stubEnv('HUAWEICLOUD_SDK_PROJECT_ID', 'test-project');
  vi.stubEnv('HUAWEICLOUD_SDK_REGION', 'ap-southeast-4');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('IAMClient', () => {
  it('createAgency builds the request and returns the SDK response', async () => {
    const mockResponse = { agency: { agency_id: 'test-agency-id' } };
    const mockInstance: any = { createAgencyV5: vi.fn(async () => mockResponse) };
    stubIamBuilder(mockInstance);

    const client = new IAMClient();
    const result = await client.createAgency('AgentArtsCoreGateway', TRUST_POLICY);

    expect(result).toBe(mockResponse);
    expect(mockInstance.createAgencyV5).toHaveBeenCalledTimes(1);
    const request = mockInstance.createAgencyV5.mock.calls[0]![0] as CreateAgencyV5Request;
    expect(request.body?.agencyName).toBe('AgentArtsCoreGateway');
    expect(request.body?.trustPolicy).toBe(TRUST_POLICY);
  });

  it('listPolicies returns the SDK response', async () => {
    const mockResponse = { policies: [] };
    const mockInstance: any = { listPoliciesV5: vi.fn(async () => mockResponse) };
    stubIamSdkClient(mockInstance);

    const client = new IAMClient();
    const result = await client.listPolicies('system');

    expect(result).toBe(mockResponse);
    expect(mockInstance.listPoliciesV5).toHaveBeenCalledTimes(1);
  });

  it('listAgencies returns the SDK response', async () => {
    const mockResponse = { agencies: [] };
    const mockInstance: any = { listAgenciesV5: vi.fn(async () => mockResponse) };
    stubIamSdkClient(mockInstance);

    const client = new IAMClient();
    const result = await client.listAgencies('TestAgency');

    expect(result).toBe(mockResponse);
    expect(mockInstance.listAgenciesV5).toHaveBeenCalledTimes(1);
  });

  it('attachAgencyPolicy returns the SDK response', async () => {
    const mockResponse = {};
    const mockInstance: any = { attachAgencyPolicyV5: vi.fn(async () => mockResponse) };
    stubIamSdkClient(mockInstance);

    const client = new IAMClient();
    const result = await client.attachAgencyPolicy('test-agency-id', 'test-policy-id');

    expect(result).toBe(mockResponse);
    expect(mockInstance.attachAgencyPolicyV5).toHaveBeenCalledTimes(1);
  });

  it('createAgencyWithPolicy creates the agency and attaches the policy', async () => {
    const mockInstance: any = {
      createAgencyV5: vi.fn(async () => ({ agency: { agency_id: 'test-agency-id' } })),
      listPoliciesV5: vi.fn(async () => ({
        policies: [{ policy_name: POLICY_NAME, policy_id: 'test-policy-id' }],
        page_info: { next_marker: null },
      })),
      attachAgencyPolicyV5: vi.fn(async () => ({})),
    };
    stubIamSdkClient(mockInstance);

    const client = new IAMClient();
    const result = await client.createAgencyWithPolicy('TestAgency', TRUST_POLICY, POLICY_NAME);

    expect(result).not.toBeNull();
    expect(result.agency.agency_id).toBe('test-agency-id');
    expect(mockInstance.createAgencyV5).toHaveBeenCalledTimes(1);
    expect(mockInstance.listPoliciesV5).toHaveBeenCalledTimes(1);
    expect(mockInstance.attachAgencyPolicyV5).toHaveBeenCalledTimes(1);
  });

  it('createAgencyWithPolicy follows the policy pagination markers', async () => {
    const mockInstance: any = {
      createAgencyV5: vi.fn(async () => ({ agency: { agency_id: 'test-agency-id' } })),
      listPoliciesV5: vi
        .fn()
        .mockResolvedValueOnce({ policies: [], page_info: { next_marker: 'marker-1' } })
        .mockResolvedValueOnce({
          policies: [{ policy_name: POLICY_NAME, policy_id: 'test-policy-id' }],
          page_info: { next_marker: null },
        }),
      attachAgencyPolicyV5: vi.fn(async () => ({})),
    };
    stubIamSdkClient(mockInstance);

    const client = new IAMClient();
    const result = await client.createAgencyWithPolicy('TestAgency', TRUST_POLICY, POLICY_NAME);

    expect(result).not.toBeNull();
    expect(result.agency.agency_id).toBe('test-agency-id');
    expect(mockInstance.createAgencyV5).toHaveBeenCalledTimes(1);
    expect(mockInstance.listPoliciesV5).toHaveBeenCalledTimes(2);
    expect(mockInstance.attachAgencyPolicyV5).toHaveBeenCalledTimes(1);
    const firstRequest = mockInstance.listPoliciesV5.mock.calls[0]![0] as ListPoliciesV5Request;
    const secondRequest = mockInstance.listPoliciesV5.mock.calls[1]![0] as ListPoliciesV5Request;
    expect(firstRequest.marker).toBeUndefined();
    expect(secondRequest.marker).toBe('marker-1');
  });

  it('createAgencyWithPolicy returns null when the agency already exists', async () => {
    const mockInstance: any = {
      createAgencyV5: vi.fn(async () => {
        throw new Error('409 Conflict: Agency already exists');
      }),
      listAgenciesV5: vi.fn(async () => ({
        agencies: [{ agency_name: 'TestAgency', agency_id: 'existing-agency-id' }],
      })),
      listPoliciesV5: vi.fn(async () => ({
        policies: [{ policy_name: POLICY_NAME, policy_id: 'test-policy-id' }],
        page_info: { next_marker: null },
      })),
      attachAgencyPolicyV5: vi.fn(async () => ({})),
    };
    stubIamSdkClient(mockInstance);

    const client = new IAMClient();
    const result = await client.createAgencyWithPolicy('TestAgency', TRUST_POLICY, POLICY_NAME);

    // Should return null when the agency already exists.
    expect(result).toBeNull();
    expect(mockInstance.createAgencyV5).toHaveBeenCalledTimes(1);
    expect(mockInstance.listAgenciesV5).toHaveBeenCalledTimes(1);
    expect(mockInstance.listPoliciesV5).toHaveBeenCalledTimes(1);
    expect(mockInstance.attachAgencyPolicyV5).toHaveBeenCalledTimes(1);
  });

  it('createAgencyWithPolicy keeps the create response when the policy is already attached', async () => {
    const mockInstance: any = {
      createAgencyV5: vi.fn(async () => ({ agency: { agency_id: 'test-agency-id' } })),
      listPoliciesV5: vi.fn(async () => ({
        policies: [{ policy_name: POLICY_NAME, policy_id: 'test-policy-id' }],
        page_info: { next_marker: null },
      })),
      attachAgencyPolicyV5: vi.fn(async () => {
        throw new Error('409 Conflict: Policy already attached');
      }),
    };
    stubIamSdkClient(mockInstance);

    const client = new IAMClient();
    const result = await client.createAgencyWithPolicy('TestAgency', TRUST_POLICY, POLICY_NAME);

    // Should return the create response even when the policy is already attached.
    expect(result).not.toBeNull();
    expect(result.agency.agency_id).toBe('test-agency-id');
    expect(mockInstance.createAgencyV5).toHaveBeenCalledTimes(1);
    expect(mockInstance.listPoliciesV5).toHaveBeenCalledTimes(1);
    expect(mockInstance.attachAgencyPolicyV5).toHaveBeenCalledTimes(1);
  });

  it('createAgencyWithPolicy fails when the policy is not found', async () => {
    const mockInstance: any = {
      createAgencyV5: vi.fn(async () => ({ agency: { agency_id: 'test-agency-id' } })),
      listPoliciesV5: vi.fn(async () => ({ policies: [], page_info: { next_marker: null } })),
    };
    stubIamSdkClient(mockInstance);

    const client = new IAMClient();

    await expect(
      client.createAgencyWithPolicy('TestAgency', TRUST_POLICY, 'NonExistentPolicy'),
    ).rejects.toThrow('not found');
  });

  it('constructor keeps a custom CA certificate path', () => {
    const customCaPath = '/path/to/custom/ca.crt';

    const client = new IAMClient(customCaPath);

    expect((client as any)._verifySsl).toBe(customCaPath);
  });

  it('listPolicies forwards every optional parameter', async () => {
    const mockInstance: any = { listPoliciesV5: vi.fn(async () => ({ policies: [] })) };
    stubIamSdkClient(mockInstance);

    const client = new IAMClient();
    const result = await client.listPolicies('custom', 50, 'test-marker', '/test/', true);

    expect(result).not.toBeNull();
    expect(mockInstance.listPoliciesV5).toHaveBeenCalledTimes(1);
    const request = mockInstance.listPoliciesV5.mock.calls[0]![0] as ListPoliciesV5Request;
    expect(request.policyType).toBe('custom');
    expect(request.limit).toBe(50);
    expect(request.marker).toBe('test-marker');
    expect(request.pathPrefix).toBe('/test/');
    expect(request.onlyAttached).toBe(true);
  });

  it('listAgencies forwards every optional parameter', async () => {
    const mockInstance: any = { listAgenciesV5: vi.fn(async () => ({ agencies: [] })) };
    stubIamSdkClient(mockInstance);

    const client = new IAMClient();
    const result = await client.listAgencies('TestAgency', 50, 'test-marker', '/test/', true);

    expect(result).not.toBeNull();
    expect(mockInstance.listAgenciesV5).toHaveBeenCalledTimes(1);
    const request = mockInstance.listAgenciesV5.mock.calls[0]![0] as ListAgenciesV5Request;
    // `name` / `onlyAttached` are not part of the generated ListAgenciesV5Request
    // model, so the client assigns them dynamically (same as the Python SDK).
    expect((request as any).name).toBe('TestAgency');
    expect(request.limit).toBe(50);
    expect(request.marker).toBe('test-marker');
    expect(request.pathPrefix).toBe('/test/');
    expect((request as any).onlyAttached).toBe(true);
  });

  it('createAgencyWithPolicy rethrows a non-409 create error', async () => {
    const mockInstance: any = {
      createAgencyV5: vi.fn(async () => {
        throw new Error('500 Internal Server Error');
      }),
    };
    stubIamSdkClient(mockInstance);

    const client = new IAMClient();

    await expect(
      client.createAgencyWithPolicy('TestAgency', TRUST_POLICY, 'TestPolicy'),
    ).rejects.toThrow('500');
  });

  it('createAgencyWithPolicy fails when the existing agency is missing from the list', async () => {
    const mockInstance: any = {
      createAgencyV5: vi.fn(async () => {
        throw new Error('409 Conflict: Agency already exists');
      }),
      listAgenciesV5: vi.fn(async () => ({ agencies: [] })),
    };
    stubIamSdkClient(mockInstance);

    const client = new IAMClient();

    await expect(
      client.createAgencyWithPolicy('TestAgency', TRUST_POLICY, 'TestPolicy'),
    ).rejects.toThrow('already exists but cannot be found');
  });

  it('createAgencyWithPolicy rethrows a non-409 attach error', async () => {
    const mockInstance: any = {
      createAgencyV5: vi.fn(async () => ({ agency: { agency_id: 'test-agency-id' } })),
      listPoliciesV5: vi.fn(async () => ({
        policies: [{ policy_name: 'TestPolicy', policy_id: 'test-policy-id' }],
        page_info: { next_marker: null },
      })),
      attachAgencyPolicyV5: vi.fn(async () => {
        throw new Error('500 Internal Server Error');
      }),
    };
    stubIamSdkClient(mockInstance);

    const client = new IAMClient();

    await expect(
      client.createAgencyWithPolicy('TestAgency', TRUST_POLICY, 'TestPolicy'),
    ).rejects.toThrow('500');
  });

  it('_getIamClient passes a custom CA certificate to the SDK options', async () => {
    // The upstream core is axios based: a custom CA maps to an https agent.
    const caDir = mkdtempSync(join(tmpdir(), 'agentarts-ca-'));
    const customCaPath = join(caDir, 'ca.crt');
    writeFileSync(customCaPath, '-----BEGIN CERTIFICATE-----\nTEST\n-----END CERTIFICATE-----\n');
    try {
      const builder = stubIamBuilder({});

      const client = new IAMClient(customCaPath);
      const iamClient = await (client as any)._getIamClient();

      expect(iamClient).not.toBeNull();
      expect(builder.withOptions).toHaveBeenCalledTimes(1);
      const options = builder.withOptions.mock.calls[0]![0];
      const ca = options.axiosRequestConfig?.httpsAgent?.options?.ca;
      expect(String(ca)).toContain('BEGIN CERTIFICATE');
    } finally {
      rmSync(caDir, { recursive: true, force: true });
    }
  });

  it('_getIamClient disables SSL verification when requested', async () => {
    const builder = stubIamBuilder({});

    const client = new IAMClient(false);
    const iamClient = await (client as any)._getIamClient();

    expect(iamClient).not.toBeNull();
    expect(builder.withOptions).toHaveBeenCalledTimes(1);
    const options = builder.withOptions.mock.calls[0]![0];
    expect(options.axiosRequestConfig?.httpsAgent?.options?.rejectUnauthorized).toBe(false);
  });
});

