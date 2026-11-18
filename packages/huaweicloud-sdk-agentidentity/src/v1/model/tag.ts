/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { toWire } from './serialization.js';

export class Tag {
  key?: string;
  value?: string;

  constructor(init?: Partial<Tag>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.key !== undefined && this.key !== null) result['key'] = toWire(this.key);
    if (this.value !== undefined && this.value !== null) result['value'] = toWire(this.value);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): Tag {
    const model = new Tag();
    if (dict) {
      if (dict['key'] !== undefined) model.key = dict['key'] as any;
      if (dict['value'] !== undefined) model.value = dict['value'] as any;
    }
    return model;
  }
}
