/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { AuthorizerConfiguration } from './authorizer-configuration.js';
import { AuthorizerType } from './authorizer-type.js';
import { toWire } from './serialization.js';

export class WorkloadIdentityAuthorizerConfiguration {
  workloadIdentityName?: string;
  authorizerType?: AuthorizerType;
  authorizerConfiguration?: AuthorizerConfiguration;

  constructor(init?: Partial<WorkloadIdentityAuthorizerConfiguration>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.workloadIdentityName !== undefined && this.workloadIdentityName !== null) result['workload_identity_name'] = toWire(this.workloadIdentityName);
    if (this.authorizerType !== undefined && this.authorizerType !== null) result['authorizer_type'] = toWire(this.authorizerType);
    if (this.authorizerConfiguration !== undefined && this.authorizerConfiguration !== null) result['authorizer_configuration'] = toWire(this.authorizerConfiguration);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): WorkloadIdentityAuthorizerConfiguration {
    const model = new WorkloadIdentityAuthorizerConfiguration();
    if (dict) {
      if (dict['workload_identity_name'] !== undefined) model.workloadIdentityName = dict['workload_identity_name'] as any;
      if (dict['authorizer_type'] !== undefined) model.authorizerType = dict['authorizer_type'] as any;
      if (dict['authorizer_configuration'] !== undefined && dict['authorizer_configuration'] !== null) model.authorizerConfiguration = AuthorizerConfiguration.fromDict(dict['authorizer_configuration']);
    }
    return model;
  }
}
