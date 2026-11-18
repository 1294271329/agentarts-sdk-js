/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { StsTag } from './sts-tag.js';
import { toWire } from './serialization.js';

export class GetResourceStsTokenRequestBody {
  resourceCredentialProviderName?: string;
  workloadAccessToken?: string;
  agencySessionName?: string;
  durationSeconds?: number;
  policy?: string;
  sourceIdentity?: string;
  tags?: StsTag[];
  transitiveTagKeys?: string[];

  constructor(init?: Partial<GetResourceStsTokenRequestBody>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.resourceCredentialProviderName !== undefined && this.resourceCredentialProviderName !== null) result['resource_credential_provider_name'] = toWire(this.resourceCredentialProviderName);
    if (this.workloadAccessToken !== undefined && this.workloadAccessToken !== null) result['workload_access_token'] = toWire(this.workloadAccessToken);
    if (this.agencySessionName !== undefined && this.agencySessionName !== null) result['agency_session_name'] = toWire(this.agencySessionName);
    if (this.durationSeconds !== undefined && this.durationSeconds !== null) result['duration_seconds'] = toWire(this.durationSeconds);
    if (this.policy !== undefined && this.policy !== null) result['policy'] = toWire(this.policy);
    if (this.sourceIdentity !== undefined && this.sourceIdentity !== null) result['source_identity'] = toWire(this.sourceIdentity);
    if (this.tags !== undefined && this.tags !== null) result['tags'] = toWire(this.tags);
    if (this.transitiveTagKeys !== undefined && this.transitiveTagKeys !== null) result['transitive_tag_keys'] = toWire(this.transitiveTagKeys);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): GetResourceStsTokenRequestBody {
    const model = new GetResourceStsTokenRequestBody();
    if (dict) {
      if (dict['resource_credential_provider_name'] !== undefined) model.resourceCredentialProviderName = dict['resource_credential_provider_name'] as any;
      if (dict['workload_access_token'] !== undefined) model.workloadAccessToken = dict['workload_access_token'] as any;
      if (dict['agency_session_name'] !== undefined) model.agencySessionName = dict['agency_session_name'] as any;
      if (dict['duration_seconds'] !== undefined) model.durationSeconds = dict['duration_seconds'] as any;
      if (dict['policy'] !== undefined) model.policy = dict['policy'] as any;
      if (dict['source_identity'] !== undefined) model.sourceIdentity = dict['source_identity'] as any;
      if (dict['tags'] !== undefined && dict['tags'] !== null) model.tags = (dict['tags'] as any[]).map((item) => StsTag.fromDict(item)) as any;
      if (dict['transitive_tag_keys'] !== undefined) model.transitiveTagKeys = dict['transitive_tag_keys'] as any;
    }
    return model;
  }
}
