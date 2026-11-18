/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { SdkResponse } from '@huaweicloud/huaweicloud-sdk-core/SdkResponse.js';
import { WorkloadIdentity } from './workload-identity.js';
import { toWire } from './serialization.js';

export class UpdateWorkloadIdentityResponse extends SdkResponse {
  workloadIdentity?: WorkloadIdentity;

  constructor(init?: Partial<UpdateWorkloadIdentityResponse>) {
    super();
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.workloadIdentity !== undefined && this.workloadIdentity !== null) result['workload_identity'] = toWire(this.workloadIdentity);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): UpdateWorkloadIdentityResponse {
    const model = new UpdateWorkloadIdentityResponse();
    if (dict) {
      if (dict['workload_identity'] !== undefined && dict['workload_identity'] !== null) model.workloadIdentity = WorkloadIdentity.fromDict(dict['workload_identity']);
    }
    return model;
  }
}
