/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { SdkResponse } from '@huaweicloud/huaweicloud-sdk-core/SdkResponse.js';
import { PolicyEngine } from './policy-engine.js';
import { toWire } from './serialization.js';

export class GetPolicyEngineResponse extends SdkResponse {
  policyEngine?: PolicyEngine;

  constructor(init?: Partial<GetPolicyEngineResponse>) {
    super();
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.policyEngine !== undefined && this.policyEngine !== null) result['policy_engine'] = toWire(this.policyEngine);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): GetPolicyEngineResponse {
    const model = new GetPolicyEngineResponse();
    if (dict) {
      if (dict['policy_engine'] !== undefined && dict['policy_engine'] !== null) model.policyEngine = PolicyEngine.fromDict(dict['policy_engine']);
    }
    return model;
  }
}
