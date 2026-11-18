/**
 * IAM Client Module
 *
 * Provides a high-level client for IAM (Identity and Access Management)
 * operations, backed by the published `@huaweicloud/huaweicloud-sdk-iam` package.
 */

import { Region } from '@huaweicloud/huaweicloud-sdk-core';
import { IamClient } from '@huaweicloud/huaweicloud-sdk-iam/v5/IamClient.js';
import { AttachAgencyPolicyReqBody } from '@huaweicloud/huaweicloud-sdk-iam/v5/model/AttachAgencyPolicyReqBody.js';
import { AttachAgencyPolicyV5Request } from '@huaweicloud/huaweicloud-sdk-iam/v5/model/AttachAgencyPolicyV5Request.js';
import { CreateAgencyReqBody } from '@huaweicloud/huaweicloud-sdk-iam/v5/model/CreateAgencyReqBody.js';
import { CreateAgencyV5Request } from '@huaweicloud/huaweicloud-sdk-iam/v5/model/CreateAgencyV5Request.js';
import { ListAgenciesV5Request } from '@huaweicloud/huaweicloud-sdk-iam/v5/model/ListAgenciesV5Request.js';
import { ListPoliciesV5Request } from '@huaweicloud/huaweicloud-sdk-iam/v5/model/ListPoliciesV5Request.js';

import { getIamEndpoint, getRegion } from '../utils/constant.js';
import { createCredential } from '../utils/metadata.js';
import { buildUserAgent } from '../utils/user-agent.js';
import { buildSslRequestOptions } from '../utils/http-options.js';

export class IAMClient {
  private _verifySsl: boolean | string;
  private _iamClient?: IamClient;

  /**
   * @param verifySsl SSL verification setting (default: true).
   *   - `true`: verify certificates using the system CA bundle
   *   - `false`: skip verification (not recommended for production)
   *   - `string`: path to a custom CA certificate file
   */
  constructor(verifySsl: boolean | string = true) {
    this._verifySsl = verifySsl;
  }

  private async _getIamClient(): Promise<IamClient> {
    this._iamClient = IamClient.newBuilder()
      .withCredential(await createCredential())
      .withRegion(new Region(getRegion(), getIamEndpoint()))
      .withOptions({
        customUserAgent: buildUserAgent(),
        ...buildSslRequestOptions(this._verifySsl),
      })
      .build();
    return this._iamClient;
  }

  /**
   * Create a new IAM agency (trust delegation).
   */
  async createAgency(
    agencyName: string,
    trustPolicy: string,
    path?: string | null,
    maxSessionDuration?: number | null,
    description?: string | null,
  ): Promise<any> {
    const iamClient = await this._getIamClient();
    const body = new CreateAgencyReqBody(agencyName, trustPolicy)
      .withPath(path || '')
      .withMaxSessionDuration(maxSessionDuration || 3600);
    if (description !== undefined && description !== null) {
      body.description = description;
    }
    return iamClient.createAgencyV5(new CreateAgencyV5Request().withBody(body));
  }

  /** List IAM policies. */
  async listPolicies(
    policyType?: string | null,
    limit?: number | null,
    marker?: string | null,
    pathPrefix?: string | null,
    onlyAttached?: boolean | null,
  ): Promise<any> {
    const iamClient = await this._getIamClient();
    const request = new ListPoliciesV5Request();
    if (policyType !== undefined && policyType !== null) {
      request.policyType = policyType as any;
    }
    if (limit !== undefined && limit !== null) {
      request.limit = limit;
    }
    if (marker !== undefined && marker !== null) {
      request.marker = marker;
    }
    if (pathPrefix !== undefined && pathPrefix !== null) {
      request.pathPrefix = pathPrefix;
    }
    if (onlyAttached !== undefined && onlyAttached !== null) {
      request.onlyAttached = onlyAttached;
    }
    return iamClient.listPoliciesV5(request);
  }

  /** List IAM agencies. */
  async listAgencies(
    name?: string | null,
    limit?: number | null,
    marker?: string | null,
    pathPrefix?: string | null,
    onlyAttached?: boolean | null,
  ): Promise<any> {
    const iamClient = await this._getIamClient();
    const request = new ListAgenciesV5Request();
    if (name !== undefined && name !== null) {
      // Not part of the generated wire model (same behaviour as the Python SDK).
      (request as any).name = name;
    }
    if (limit !== undefined && limit !== null) {
      request.limit = limit;
    }
    if (marker !== undefined && marker !== null) {
      request.marker = marker;
    }
    if (pathPrefix !== undefined && pathPrefix !== null) {
      request.pathPrefix = pathPrefix;
    }
    if (onlyAttached !== undefined && onlyAttached !== null) {
      (request as any).onlyAttached = onlyAttached;
    }
    return iamClient.listAgenciesV5(request);
  }

  /** Attach a policy to an IAM agency. */
  async attachAgencyPolicy(agencyId: string, policyId: string): Promise<any> {
    const iamClient = await this._getIamClient();
    const body = new AttachAgencyPolicyReqBody(agencyId);
    return iamClient.attachAgencyPolicyV5(
      new AttachAgencyPolicyV5Request(policyId).withBody(body),
    );
  }

  /**
   * Create an IAM agency and attach a policy to it.
   *
   * Convenience method combining createAgency, listPolicies and
   * attachAgencyPolicy.
   */
  async createAgencyWithPolicy(
    agencyName: string,
    trustPolicy: string,
    policyName: string,
    path?: string | null,
    maxSessionDuration?: number | null,
    description?: string | null,
  ): Promise<any> {
    let agencyId: string | undefined;
    let createResponse: any;

    try {
      createResponse = await this.createAgency(
        agencyName,
        trustPolicy,
        path,
        maxSessionDuration,
        description,
      );
      agencyId = (createResponse as any)?.agency?.agency_id;
    } catch (error) {
      if (!String(error).includes('409')) {
        throw error;
      }
      // Agency already exists, need to get its ID from listAgencies.
      const listResponse = await this.listAgencies(agencyName);
      const agencies: any[] = (listResponse as any)?.agencies ?? [];
      const matchingAgency = agencies.find((agency) => agency.agency_name === agencyName);
      if (!matchingAgency) {
        throw new Error(`Agency '${agencyName}' already exists but cannot be found in list`);
      }
      agencyId = matchingAgency.agency_id;
    }

    if (!agencyId) {
      throw new Error('Failed to get agency_id');
    }

    let matchingPolicy: any;
    let marker: string | undefined;

    for (;;) {
      const listResponse = await this.listPolicies('system', 200, marker);
      const policies: any[] = (listResponse as any)?.policies ?? [];
      matchingPolicy = policies.find((policy) => policy.policy_name === policyName);
      if (matchingPolicy) {
        break;
      }
      const nextMarker = (listResponse as any)?.page_info?.next_marker;
      if (!nextMarker) {
        break;
      }
      marker = nextMarker;
    }

    if (!matchingPolicy) {
      throw new Error(`Policy '${policyName}' not found in system policies`);
    }

    try {
      await this.attachAgencyPolicy(agencyId, (matchingPolicy as any).policy_id);
    } catch (error) {
      // If policy already attached (409), ignore the error.
      if (!String(error).includes('409')) {
        throw error;
      }
    }

    return createResponse ?? null;
  }
}


