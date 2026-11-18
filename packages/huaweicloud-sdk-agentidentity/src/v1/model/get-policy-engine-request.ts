/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { toWire } from './serialization.js';

export class GetPolicyEngineRequest {
  policyEngineId?: string;

  constructor(init?: Partial<GetPolicyEngineRequest>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.policyEngineId !== undefined && this.policyEngineId !== null) result['policy_engine_id'] = toWire(this.policyEngineId);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): GetPolicyEngineRequest {
    const model = new GetPolicyEngineRequest();
    if (dict) {
      if (dict['policy_engine_id'] !== undefined) model.policyEngineId = dict['policy_engine_id'] as any;
    }
    return model;
  }
}
