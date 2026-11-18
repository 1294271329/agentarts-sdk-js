/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { toWire } from './serialization.js';

export class GetWorkloadIdentityRequest {
  workloadIdentityName?: string;

  constructor(init?: Partial<GetWorkloadIdentityRequest>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.workloadIdentityName !== undefined && this.workloadIdentityName !== null) result['workload_identity_name'] = toWire(this.workloadIdentityName);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): GetWorkloadIdentityRequest {
    const model = new GetWorkloadIdentityRequest();
    if (dict) {
      if (dict['workload_identity_name'] !== undefined) model.workloadIdentityName = dict['workload_identity_name'] as any;
    }
    return model;
  }
}
