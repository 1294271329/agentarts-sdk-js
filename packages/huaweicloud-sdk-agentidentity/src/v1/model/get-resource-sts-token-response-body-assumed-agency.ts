/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { toWire } from './serialization.js';

export class GetResourceStsTokenResponseBodyAssumedAgency {
  urn?: string;
  id?: string;

  constructor(init?: Partial<GetResourceStsTokenResponseBodyAssumedAgency>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.urn !== undefined && this.urn !== null) result['urn'] = toWire(this.urn);
    if (this.id !== undefined && this.id !== null) result['id'] = toWire(this.id);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): GetResourceStsTokenResponseBodyAssumedAgency {
    const model = new GetResourceStsTokenResponseBodyAssumedAgency();
    if (dict) {
      if (dict['urn'] !== undefined) model.urn = dict['urn'] as any;
      if (dict['id'] !== undefined) model.id = dict['id'] as any;
    }
    return model;
  }
}
