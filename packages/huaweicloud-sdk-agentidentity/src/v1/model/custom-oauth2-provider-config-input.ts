/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { Oauth2Discovery } from './oauth2-discovery.js';
import { toWire } from './serialization.js';

export class CustomOauth2ProviderConfigInput {
  clientId?: string;
  clientSecret?: string;
  oauth2Discovery?: Oauth2Discovery;

  constructor(init?: Partial<CustomOauth2ProviderConfigInput>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.clientId !== undefined && this.clientId !== null) result['client_id'] = toWire(this.clientId);
    if (this.clientSecret !== undefined && this.clientSecret !== null) result['client_secret'] = toWire(this.clientSecret);
    if (this.oauth2Discovery !== undefined && this.oauth2Discovery !== null) result['oauth2_discovery'] = toWire(this.oauth2Discovery);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): CustomOauth2ProviderConfigInput {
    const model = new CustomOauth2ProviderConfigInput();
    if (dict) {
      if (dict['client_id'] !== undefined) model.clientId = dict['client_id'] as any;
      if (dict['client_secret'] !== undefined) model.clientSecret = dict['client_secret'] as any;
      if (dict['oauth2_discovery'] !== undefined && dict['oauth2_discovery'] !== null) model.oauth2Discovery = Oauth2Discovery.fromDict(dict['oauth2_discovery']);
    }
    return model;
  }
}
