/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { SdkResponse } from '@huaweicloud/huaweicloud-sdk-core/SdkResponse.js';
import { PolicyEngine } from './policy-engine.js';
import { toWire } from './serialization.js';

export class CreatePolicyEngineResponse extends SdkResponse {
  policyEngine?: PolicyEngine;

  constructor(init?: Partial<CreatePolicyEngineResponse>) {
    super();
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.policyEngine !== undefined && this.policyEngine !== null) result['policy_engine'] = toWire(this.policyEngine);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): CreatePolicyEngineResponse {
    const model = new CreatePolicyEngineResponse();
    if (dict) {
      if (dict['policy_engine'] !== undefined && dict['policy_engine'] !== null) model.policyEngine = PolicyEngine.fromDict(dict['policy_engine']);
    }
    return model;
  }
}
