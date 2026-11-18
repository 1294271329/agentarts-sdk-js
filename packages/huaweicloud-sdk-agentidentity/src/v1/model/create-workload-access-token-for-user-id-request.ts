/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { CreateWorkloadAccessTokenForUserIdRequestBody } from './create-workload-access-token-for-user-id-request-body.js';
import { toWire } from './serialization.js';

export class CreateWorkloadAccessTokenForUserIdRequest {
  body?: CreateWorkloadAccessTokenForUserIdRequestBody;

  constructor(init?: Partial<CreateWorkloadAccessTokenForUserIdRequest>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.body !== undefined && this.body !== null) result['body'] = toWire(this.body);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): CreateWorkloadAccessTokenForUserIdRequest {
    const model = new CreateWorkloadAccessTokenForUserIdRequest();
    if (dict) {
      if (dict['body'] !== undefined && dict['body'] !== null) model.body = CreateWorkloadAccessTokenForUserIdRequestBody.fromDict(dict['body']);
    }
    return model;
  }
}
