/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { toWire } from './serialization.js';

export class GetResourceApiKeyRequestBody {
  resourceCredentialProviderName?: string;
  workloadAccessToken?: string;

  constructor(init?: Partial<GetResourceApiKeyRequestBody>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.resourceCredentialProviderName !== undefined && this.resourceCredentialProviderName !== null) result['resource_credential_provider_name'] = toWire(this.resourceCredentialProviderName);
    if (this.workloadAccessToken !== undefined && this.workloadAccessToken !== null) result['workload_access_token'] = toWire(this.workloadAccessToken);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): GetResourceApiKeyRequestBody {
    const model = new GetResourceApiKeyRequestBody();
    if (dict) {
      if (dict['resource_credential_provider_name'] !== undefined) model.resourceCredentialProviderName = dict['resource_credential_provider_name'] as any;
      if (dict['workload_access_token'] !== undefined) model.workloadAccessToken = dict['workload_access_token'] as any;
    }
    return model;
  }
}
