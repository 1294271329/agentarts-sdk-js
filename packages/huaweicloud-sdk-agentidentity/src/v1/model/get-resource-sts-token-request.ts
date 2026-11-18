/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { GetResourceStsTokenRequestBody } from './get-resource-sts-token-request-body.js';
import { toWire } from './serialization.js';

export class GetResourceStsTokenRequest {
  body?: GetResourceStsTokenRequestBody;

  constructor(init?: Partial<GetResourceStsTokenRequest>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.body !== undefined && this.body !== null) result['body'] = toWire(this.body);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): GetResourceStsTokenRequest {
    const model = new GetResourceStsTokenRequest();
    if (dict) {
      if (dict['body'] !== undefined && dict['body'] !== null) model.body = GetResourceStsTokenRequestBody.fromDict(dict['body']);
    }
    return model;
  }
}
