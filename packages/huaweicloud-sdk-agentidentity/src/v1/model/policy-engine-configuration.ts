/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { PolicyEngineMode } from './policy-engine-mode.js';
import { toWire } from './serialization.js';

export class PolicyEngineConfiguration {
  policyEngineId?: string;
  mode?: PolicyEngineMode;

  constructor(init?: Partial<PolicyEngineConfiguration>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.policyEngineId !== undefined && this.policyEngineId !== null) result['policy_engine_id'] = toWire(this.policyEngineId);
    if (this.mode !== undefined && this.mode !== null) result['mode'] = toWire(this.mode);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): PolicyEngineConfiguration {
    const model = new PolicyEngineConfiguration();
    if (dict) {
      if (dict['policy_engine_id'] !== undefined) model.policyEngineId = dict['policy_engine_id'] as any;
      if (dict['mode'] !== undefined) model.mode = dict['mode'] as any;
    }
    return model;
  }
}
