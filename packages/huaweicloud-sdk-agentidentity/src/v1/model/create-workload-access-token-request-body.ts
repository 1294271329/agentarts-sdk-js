/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { toWire } from './serialization.js';

export class CreateWorkloadAccessTokenRequestBody {
  workloadName?: string;

  constructor(init?: Partial<CreateWorkloadAccessTokenRequestBody>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.workloadName !== undefined && this.workloadName !== null) result['workload_name'] = toWire(this.workloadName);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): CreateWorkloadAccessTokenRequestBody {
    const model = new CreateWorkloadAccessTokenRequestBody();
    if (dict) {
      if (dict['workload_name'] !== undefined) model.workloadName = dict['workload_name'] as any;
    }
    return model;
  }
}
