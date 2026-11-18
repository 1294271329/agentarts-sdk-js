/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { UpdateWorkloadIdentityReqBody } from './update-workload-identity-req-body.js';
import { toWire } from './serialization.js';

export class UpdateWorkloadIdentityRequest {
  workloadIdentityName?: string;
  body?: UpdateWorkloadIdentityReqBody;

  constructor(init?: Partial<UpdateWorkloadIdentityRequest>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.workloadIdentityName !== undefined && this.workloadIdentityName !== null) result['workload_identity_name'] = toWire(this.workloadIdentityName);
    if (this.body !== undefined && this.body !== null) result['body'] = toWire(this.body);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): UpdateWorkloadIdentityRequest {
    const model = new UpdateWorkloadIdentityRequest();
    if (dict) {
      if (dict['workload_identity_name'] !== undefined) model.workloadIdentityName = dict['workload_identity_name'] as any;
      if (dict['body'] !== undefined && dict['body'] !== null) model.body = UpdateWorkloadIdentityReqBody.fromDict(dict['body']);
    }
    return model;
  }
}
