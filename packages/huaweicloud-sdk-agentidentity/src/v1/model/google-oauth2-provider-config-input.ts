/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { toWire } from './serialization.js';

export class GoogleOauth2ProviderConfigInput {
  clientId?: string;
  clientSecret?: string;

  constructor(init?: Partial<GoogleOauth2ProviderConfigInput>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.clientId !== undefined && this.clientId !== null) result['client_id'] = toWire(this.clientId);
    if (this.clientSecret !== undefined && this.clientSecret !== null) result['client_secret'] = toWire(this.clientSecret);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): GoogleOauth2ProviderConfigInput {
    const model = new GoogleOauth2ProviderConfigInput();
    if (dict) {
      if (dict['client_id'] !== undefined) model.clientId = dict['client_id'] as any;
      if (dict['client_secret'] !== undefined) model.clientSecret = dict['client_secret'] as any;
    }
    return model;
  }
}
