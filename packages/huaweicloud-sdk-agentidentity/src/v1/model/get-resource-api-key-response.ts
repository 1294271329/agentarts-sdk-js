/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { SdkResponse } from '@huaweicloud/huaweicloud-sdk-core/SdkResponse.js';
import { toWire } from './serialization.js';

export class GetResourceApiKeyResponse extends SdkResponse {
  apiKey?: string;

  constructor(init?: Partial<GetResourceApiKeyResponse>) {
    super();
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.apiKey !== undefined && this.apiKey !== null) result['api_key'] = toWire(this.apiKey);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): GetResourceApiKeyResponse {
    const model = new GetResourceApiKeyResponse();
    if (dict) {
      if (dict['api_key'] !== undefined) model.apiKey = dict['api_key'] as any;
    }
    return model;
  }
}
