/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { CustomClaimValidation } from './custom-claim-validation.js';
import { toWire } from './serialization.js';

export class CustomJWTAuthorizerConfiguration {
  discoveryUrl?: string;
  allowedAudience?: string[];
  allowedClients?: string[];
  allowedScopes?: string[];
  customClaims?: CustomClaimValidation[];

  constructor(init?: Partial<CustomJWTAuthorizerConfiguration>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.discoveryUrl !== undefined && this.discoveryUrl !== null) result['discovery_url'] = toWire(this.discoveryUrl);
    if (this.allowedAudience !== undefined && this.allowedAudience !== null) result['allowed_audience'] = toWire(this.allowedAudience);
    if (this.allowedClients !== undefined && this.allowedClients !== null) result['allowed_clients'] = toWire(this.allowedClients);
    if (this.allowedScopes !== undefined && this.allowedScopes !== null) result['allowed_scopes'] = toWire(this.allowedScopes);
    if (this.customClaims !== undefined && this.customClaims !== null) result['custom_claims'] = toWire(this.customClaims);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): CustomJWTAuthorizerConfiguration {
    const model = new CustomJWTAuthorizerConfiguration();
    if (dict) {
      if (dict['discovery_url'] !== undefined) model.discoveryUrl = dict['discovery_url'] as any;
      if (dict['allowed_audience'] !== undefined) model.allowedAudience = dict['allowed_audience'] as any;
      if (dict['allowed_clients'] !== undefined) model.allowedClients = dict['allowed_clients'] as any;
      if (dict['allowed_scopes'] !== undefined) model.allowedScopes = dict['allowed_scopes'] as any;
      if (dict['custom_claims'] !== undefined && dict['custom_claims'] !== null) model.customClaims = (dict['custom_claims'] as any[]).map((item) => CustomClaimValidation.fromDict(item)) as any;
    }
    return model;
  }
}
