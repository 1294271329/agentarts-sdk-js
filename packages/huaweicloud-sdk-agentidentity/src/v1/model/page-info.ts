/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { toWire } from './serialization.js';

export class PageInfo {
  nextMarker?: string;
  currentCount?: number;

  constructor(init?: Partial<PageInfo>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.nextMarker !== undefined && this.nextMarker !== null) result['next_marker'] = toWire(this.nextMarker);
    if (this.currentCount !== undefined && this.currentCount !== null) result['current_count'] = toWire(this.currentCount);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): PageInfo {
    const model = new PageInfo();
    if (dict) {
      if (dict['next_marker'] !== undefined) model.nextMarker = dict['next_marker'] as any;
      if (dict['current_count'] !== undefined) model.currentCount = dict['current_count'] as any;
    }
    return model;
  }
}
