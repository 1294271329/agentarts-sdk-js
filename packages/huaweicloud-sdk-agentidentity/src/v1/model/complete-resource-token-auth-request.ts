/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { CompleteResourceTokenAuthRequestBody } from './complete-resource-token-auth-request-body.js';
import { toWire } from './serialization.js';

export class CompleteResourceTokenAuthRequest {
  body?: CompleteResourceTokenAuthRequestBody;

  constructor(init?: Partial<CompleteResourceTokenAuthRequest>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.body !== undefined && this.body !== null) result['body'] = toWire(this.body);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): CompleteResourceTokenAuthRequest {
    const model = new CompleteResourceTokenAuthRequest();
    if (dict) {
      if (dict['body'] !== undefined && dict['body'] !== null) model.body = CompleteResourceTokenAuthRequestBody.fromDict(dict['body']);
    }
    return model;
  }
}
