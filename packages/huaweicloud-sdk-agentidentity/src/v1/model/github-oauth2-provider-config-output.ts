/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { Oauth2Discovery } from './oauth2-discovery.js';
import { toWire } from './serialization.js';

export class GithubOauth2ProviderConfigOutput {
  oauth2Discovery?: Oauth2Discovery;
  clientId?: string;

  constructor(init?: Partial<GithubOauth2ProviderConfigOutput>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.oauth2Discovery !== undefined && this.oauth2Discovery !== null) result['oauth2_discovery'] = toWire(this.oauth2Discovery);
    if (this.clientId !== undefined && this.clientId !== null) result['client_id'] = toWire(this.clientId);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): GithubOauth2ProviderConfigOutput {
    const model = new GithubOauth2ProviderConfigOutput();
    if (dict) {
      if (dict['oauth2_discovery'] !== undefined && dict['oauth2_discovery'] !== null) model.oauth2Discovery = Oauth2Discovery.fromDict(dict['oauth2_discovery']);
      if (dict['client_id'] !== undefined) model.clientId = dict['client_id'] as any;
    }
    return model;
  }
}
