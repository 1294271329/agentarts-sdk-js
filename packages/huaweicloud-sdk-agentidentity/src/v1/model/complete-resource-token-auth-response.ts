/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { SdkResponse } from '@huaweicloud/huaweicloud-sdk-core/SdkResponse.js';
import { toWire } from './serialization.js';

export class CompleteResourceTokenAuthResponse extends SdkResponse {

  constructor(init?: Partial<CompleteResourceTokenAuthResponse>) {
    super();
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): CompleteResourceTokenAuthResponse {
    const model = new CompleteResourceTokenAuthResponse();
    if (dict) {
    }
    return model;
  }
}
