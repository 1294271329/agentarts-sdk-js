/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { CreateWorkloadAccessTokenRequestBody } from './create-workload-access-token-request-body.js';
import { toWire } from './serialization.js';

export class CreateWorkloadAccessTokenRequest {
  body?: CreateWorkloadAccessTokenRequestBody;

  constructor(init?: Partial<CreateWorkloadAccessTokenRequest>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.body !== undefined && this.body !== null) result['body'] = toWire(this.body);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): CreateWorkloadAccessTokenRequest {
    const model = new CreateWorkloadAccessTokenRequest();
    if (dict) {
      if (dict['body'] !== undefined && dict['body'] !== null) model.body = CreateWorkloadAccessTokenRequestBody.fromDict(dict['body']);
    }
    return model;
  }
}
