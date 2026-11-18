/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { toWire } from './serialization.js';

export class ApiKeyInfo {
  apiKey?: string;
  apiKeyName?: string;

  constructor(init?: Partial<ApiKeyInfo>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.apiKey !== undefined && this.apiKey !== null) result['api_key'] = toWire(this.apiKey);
    if (this.apiKeyName !== undefined && this.apiKeyName !== null) result['api_key_name'] = toWire(this.apiKeyName);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): ApiKeyInfo {
    const model = new ApiKeyInfo();
    if (dict) {
      if (dict['api_key'] !== undefined) model.apiKey = dict['api_key'] as any;
      if (dict['api_key_name'] !== undefined) model.apiKeyName = dict['api_key_name'] as any;
    }
    return model;
  }
}
