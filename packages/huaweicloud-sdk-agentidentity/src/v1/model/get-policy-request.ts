/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { toWire } from './serialization.js';

export class GetPolicyRequest {
  policyEngineId?: string;
  policyId?: string;

  constructor(init?: Partial<GetPolicyRequest>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.policyEngineId !== undefined && this.policyEngineId !== null) result['policy_engine_id'] = toWire(this.policyEngineId);
    if (this.policyId !== undefined && this.policyId !== null) result['policy_id'] = toWire(this.policyId);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): GetPolicyRequest {
    const model = new GetPolicyRequest();
    if (dict) {
      if (dict['policy_engine_id'] !== undefined) model.policyEngineId = dict['policy_engine_id'] as any;
      if (dict['policy_id'] !== undefined) model.policyId = dict['policy_id'] as any;
    }
    return model;
  }
}
