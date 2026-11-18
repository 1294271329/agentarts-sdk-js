/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { toWire } from './serialization.js';

export class CreateWorkloadAccessTokenForUserIdRequestBody {
  workloadName?: string;
  userId?: string;

  constructor(init?: Partial<CreateWorkloadAccessTokenForUserIdRequestBody>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.workloadName !== undefined && this.workloadName !== null) result['workload_name'] = toWire(this.workloadName);
    if (this.userId !== undefined && this.userId !== null) result['user_id'] = toWire(this.userId);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): CreateWorkloadAccessTokenForUserIdRequestBody {
    const model = new CreateWorkloadAccessTokenForUserIdRequestBody();
    if (dict) {
      if (dict['workload_name'] !== undefined) model.workloadName = dict['workload_name'] as any;
      if (dict['user_id'] !== undefined) model.userId = dict['user_id'] as any;
    }
    return model;
  }
}
