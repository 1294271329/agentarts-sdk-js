/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { CreateWorkloadAccessTokenForJwtRequestBody } from './create-workload-access-token-for-jwt-request-body.js';
import { toWire } from './serialization.js';

export class CreateWorkloadAccessTokenForJwtRequest {
  body?: CreateWorkloadAccessTokenForJwtRequestBody;

  constructor(init?: Partial<CreateWorkloadAccessTokenForJwtRequest>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.body !== undefined && this.body !== null) result['body'] = toWire(this.body);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): CreateWorkloadAccessTokenForJwtRequest {
    const model = new CreateWorkloadAccessTokenForJwtRequest();
    if (dict) {
      if (dict['body'] !== undefined && dict['body'] !== null) model.body = CreateWorkloadAccessTokenForJwtRequestBody.fromDict(dict['body']);
    }
    return model;
  }
}
