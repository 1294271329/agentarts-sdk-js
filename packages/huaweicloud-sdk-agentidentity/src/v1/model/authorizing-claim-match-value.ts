/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { ClaimMatchValue } from './claim-match-value.js';
import { toWire } from './serialization.js';

export class AuthorizingClaimMatchValue {
  claimMatchOperator?: string;
  claimMatchValue?: ClaimMatchValue;

  constructor(init?: Partial<AuthorizingClaimMatchValue>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.claimMatchOperator !== undefined && this.claimMatchOperator !== null) result['claim_match_operator'] = toWire(this.claimMatchOperator);
    if (this.claimMatchValue !== undefined && this.claimMatchValue !== null) result['claim_match_value'] = toWire(this.claimMatchValue);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): AuthorizingClaimMatchValue {
    const model = new AuthorizingClaimMatchValue();
    if (dict) {
      if (dict['claim_match_operator'] !== undefined) model.claimMatchOperator = dict['claim_match_operator'] as any;
      if (dict['claim_match_value'] !== undefined && dict['claim_match_value'] !== null) model.claimMatchValue = ClaimMatchValue.fromDict(dict['claim_match_value']);
    }
    return model;
  }
}
