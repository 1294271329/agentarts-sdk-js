/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { toWire } from './serialization.js';

export class ListIdentityProvidersRequest {

  constructor(init?: Partial<ListIdentityProvidersRequest>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): ListIdentityProvidersRequest {
    const model = new ListIdentityProvidersRequest();
    if (dict) {
    }
    return model;
  }
}
