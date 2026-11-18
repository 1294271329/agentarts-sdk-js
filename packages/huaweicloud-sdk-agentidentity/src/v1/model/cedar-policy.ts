/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { toWire } from './serialization.js';

export class CedarPolicy {
  statement?: string;

  constructor(init?: Partial<CedarPolicy>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.statement !== undefined && this.statement !== null) result['statement'] = toWire(this.statement);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): CedarPolicy {
    const model = new CedarPolicy();
    if (dict) {
      if (dict['statement'] !== undefined) model.statement = dict['statement'] as any;
    }
    return model;
  }
}
