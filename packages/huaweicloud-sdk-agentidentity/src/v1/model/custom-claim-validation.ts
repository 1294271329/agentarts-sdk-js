/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { AuthorizingClaimMatchValue } from './authorizing-claim-match-value.js';
import { toWire } from './serialization.js';

export class CustomClaimValidation {
  authorizingClaimMatchValue?: AuthorizingClaimMatchValue;
  inboundTokenClaimName?: string;
  inboundTokenClaimValueType?: string;

  constructor(init?: Partial<CustomClaimValidation>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.authorizingClaimMatchValue !== undefined && this.authorizingClaimMatchValue !== null) result['authorizing_claim_match_value'] = toWire(this.authorizingClaimMatchValue);
    if (this.inboundTokenClaimName !== undefined && this.inboundTokenClaimName !== null) result['inbound_token_claim_name'] = toWire(this.inboundTokenClaimName);
    if (this.inboundTokenClaimValueType !== undefined && this.inboundTokenClaimValueType !== null) result['inbound_token_claim_value_type'] = toWire(this.inboundTokenClaimValueType);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): CustomClaimValidation {
    const model = new CustomClaimValidation();
    if (dict) {
      if (dict['authorizing_claim_match_value'] !== undefined && dict['authorizing_claim_match_value'] !== null) model.authorizingClaimMatchValue = AuthorizingClaimMatchValue.fromDict(dict['authorizing_claim_match_value']);
      if (dict['inbound_token_claim_name'] !== undefined) model.inboundTokenClaimName = dict['inbound_token_claim_name'] as any;
      if (dict['inbound_token_claim_value_type'] !== undefined) model.inboundTokenClaimValueType = dict['inbound_token_claim_value_type'] as any;
    }
    return model;
  }
}
