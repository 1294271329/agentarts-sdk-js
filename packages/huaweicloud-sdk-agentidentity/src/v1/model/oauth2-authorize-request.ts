/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { toWire } from './serialization.js';

export class Oauth2AuthorizeRequest {
  requestUri?: string;

  constructor(init?: Partial<Oauth2AuthorizeRequest>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.requestUri !== undefined && this.requestUri !== null) result['request_uri'] = toWire(this.requestUri);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): Oauth2AuthorizeRequest {
    const model = new Oauth2AuthorizeRequest();
    if (dict) {
      if (dict['request_uri'] !== undefined) model.requestUri = dict['request_uri'] as any;
    }
    return model;
  }
}
