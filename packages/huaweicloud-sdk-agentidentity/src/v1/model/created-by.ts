/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { toWire } from './serialization.js';

export class CreatedBy {
  type?: string;
  identifier?: string;

  constructor(init?: Partial<CreatedBy>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.type !== undefined && this.type !== null) result['type'] = toWire(this.type);
    if (this.identifier !== undefined && this.identifier !== null) result['identifier'] = toWire(this.identifier);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): CreatedBy {
    const model = new CreatedBy();
    if (dict) {
      if (dict['type'] !== undefined) model.type = dict['type'] as any;
      if (dict['identifier'] !== undefined) model.identifier = dict['identifier'] as any;
    }
    return model;
  }
}
