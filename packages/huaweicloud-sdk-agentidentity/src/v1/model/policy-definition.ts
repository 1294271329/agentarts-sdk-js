/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { CedarPolicy } from './cedar-policy.js';
import { toWire } from './serialization.js';

export class PolicyDefinition {
  cedar?: CedarPolicy;

  constructor(init?: Partial<PolicyDefinition>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.cedar !== undefined && this.cedar !== null) result['cedar'] = toWire(this.cedar);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): PolicyDefinition {
    const model = new PolicyDefinition();
    if (dict) {
      if (dict['cedar'] !== undefined && dict['cedar'] !== null) model.cedar = CedarPolicy.fromDict(dict['cedar']);
    }
    return model;
  }
}
