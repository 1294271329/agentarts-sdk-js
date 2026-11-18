/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { GetResourceApiKeyRequestBody } from './get-resource-api-key-request-body.js';
import { toWire } from './serialization.js';

export class GetResourceApiKeyRequest {
  body?: GetResourceApiKeyRequestBody;

  constructor(init?: Partial<GetResourceApiKeyRequest>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.body !== undefined && this.body !== null) result['body'] = toWire(this.body);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): GetResourceApiKeyRequest {
    const model = new GetResourceApiKeyRequest();
    if (dict) {
      if (dict['body'] !== undefined && dict['body'] !== null) model.body = GetResourceApiKeyRequestBody.fromDict(dict['body']);
    }
    return model;
  }
}
