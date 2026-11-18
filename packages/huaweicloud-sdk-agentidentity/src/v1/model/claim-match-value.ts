/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { toWire } from './serialization.js';

export class ClaimMatchValue {
  matchValueString?: string;
  matchValueStringList?: string[];

  constructor(init?: Partial<ClaimMatchValue>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.matchValueString !== undefined && this.matchValueString !== null) result['match_value_string'] = toWire(this.matchValueString);
    if (this.matchValueStringList !== undefined && this.matchValueStringList !== null) result['match_value_string_list'] = toWire(this.matchValueStringList);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): ClaimMatchValue {
    const model = new ClaimMatchValue();
    if (dict) {
      if (dict['match_value_string'] !== undefined) model.matchValueString = dict['match_value_string'] as any;
      if (dict['match_value_string_list'] !== undefined) model.matchValueStringList = dict['match_value_string_list'] as any;
    }
    return model;
  }
}
