/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { Oauth2Discovery } from './oauth2-discovery.js';
import { toWire } from './serialization.js';

export class IdentityProviderListSummary {
  identityProvider?: string;
  displayName?: string;
  oauth2Discovery?: Oauth2Discovery;

  constructor(init?: Partial<IdentityProviderListSummary>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.identityProvider !== undefined && this.identityProvider !== null) result['identity_provider'] = toWire(this.identityProvider);
    if (this.displayName !== undefined && this.displayName !== null) result['display_name'] = toWire(this.displayName);
    if (this.oauth2Discovery !== undefined && this.oauth2Discovery !== null) result['oauth2_discovery'] = toWire(this.oauth2Discovery);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): IdentityProviderListSummary {
    const model = new IdentityProviderListSummary();
    if (dict) {
      if (dict['identity_provider'] !== undefined) model.identityProvider = dict['identity_provider'] as any;
      if (dict['display_name'] !== undefined) model.displayName = dict['display_name'] as any;
      if (dict['oauth2_discovery'] !== undefined && dict['oauth2_discovery'] !== null) model.oauth2Discovery = Oauth2Discovery.fromDict(dict['oauth2_discovery']);
    }
    return model;
  }
}
