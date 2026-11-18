/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { SdkResponse } from '@huaweicloud/huaweicloud-sdk-core/SdkResponse.js';
import { WorkloadIdentityAuthorizerConfiguration } from './workload-identity-authorizer-configuration.js';
import { toWire } from './serialization.js';

export class GetWorkloadIdentityAuthorizerConfigurationResponse extends SdkResponse {
  workloadIdentityAuthorizerConfiguration?: WorkloadIdentityAuthorizerConfiguration;

  constructor(init?: Partial<GetWorkloadIdentityAuthorizerConfigurationResponse>) {
    super();
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.workloadIdentityAuthorizerConfiguration !== undefined && this.workloadIdentityAuthorizerConfiguration !== null) result['workload_identity_authorizer_configuration'] = toWire(this.workloadIdentityAuthorizerConfiguration);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): GetWorkloadIdentityAuthorizerConfigurationResponse {
    const model = new GetWorkloadIdentityAuthorizerConfigurationResponse();
    if (dict) {
      if (dict['workload_identity_authorizer_configuration'] !== undefined && dict['workload_identity_authorizer_configuration'] !== null) model.workloadIdentityAuthorizerConfiguration = WorkloadIdentityAuthorizerConfiguration.fromDict(dict['workload_identity_authorizer_configuration']);
    }
    return model;
  }
}
