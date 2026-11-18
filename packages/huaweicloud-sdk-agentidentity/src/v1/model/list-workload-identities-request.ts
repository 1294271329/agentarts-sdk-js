/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { toWire } from './serialization.js';

export class ListWorkloadIdentitiesRequest {
  limit?: number;
  marker?: string;

  constructor(init?: Partial<ListWorkloadIdentitiesRequest>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.limit !== undefined && this.limit !== null) result['limit'] = toWire(this.limit);
    if (this.marker !== undefined && this.marker !== null) result['marker'] = toWire(this.marker);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): ListWorkloadIdentitiesRequest {
    const model = new ListWorkloadIdentitiesRequest();
    if (dict) {
      if (dict['limit'] !== undefined) model.limit = dict['limit'] as any;
      if (dict['marker'] !== undefined) model.marker = dict['marker'] as any;
    }
    return model;
  }
}
