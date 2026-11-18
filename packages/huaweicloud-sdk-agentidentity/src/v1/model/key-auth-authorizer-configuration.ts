/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { ApiKeyInfo } from './api-key-info.js';
import { toWire } from './serialization.js';

export class KeyAuthAuthorizerConfiguration {
  apiKeys?: ApiKeyInfo[];

  constructor(init?: Partial<KeyAuthAuthorizerConfiguration>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.apiKeys !== undefined && this.apiKeys !== null) result['api_keys'] = toWire(this.apiKeys);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): KeyAuthAuthorizerConfiguration {
    const model = new KeyAuthAuthorizerConfiguration();
    if (dict) {
      if (dict['api_keys'] !== undefined && dict['api_keys'] !== null) model.apiKeys = (dict['api_keys'] as any[]).map((item) => ApiKeyInfo.fromDict(item)) as any;
    }
    return model;
  }
}
