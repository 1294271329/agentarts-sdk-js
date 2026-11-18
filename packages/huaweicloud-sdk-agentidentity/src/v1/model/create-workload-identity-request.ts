/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { CreateWorkloadIdentityReqBody } from './create-workload-identity-req-body.js';
import { toWire } from './serialization.js';

export class CreateWorkloadIdentityRequest {
  body?: CreateWorkloadIdentityReqBody;

  constructor(init?: Partial<CreateWorkloadIdentityRequest>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.body !== undefined && this.body !== null) result['body'] = toWire(this.body);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): CreateWorkloadIdentityRequest {
    const model = new CreateWorkloadIdentityRequest();
    if (dict) {
      if (dict['body'] !== undefined && dict['body'] !== null) model.body = CreateWorkloadIdentityReqBody.fromDict(dict['body']);
    }
    return model;
  }
}
