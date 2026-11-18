/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { GetResourceOauth2TokenRequestBody } from './get-resource-oauth2-token-request-body.js';
import { toWire } from './serialization.js';

export class GetResourceOauth2TokenRequest {
  body?: GetResourceOauth2TokenRequestBody;

  constructor(init?: Partial<GetResourceOauth2TokenRequest>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.body !== undefined && this.body !== null) result['body'] = toWire(this.body);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): GetResourceOauth2TokenRequest {
    const model = new GetResourceOauth2TokenRequest();
    if (dict) {
      if (dict['body'] !== undefined && dict['body'] !== null) model.body = GetResourceOauth2TokenRequestBody.fromDict(dict['body']);
    }
    return model;
  }
}
