/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { toWire } from './serialization.js';

export class CreateWorkloadAccessTokenForJwtRequestBody {
  workloadName?: string;
  userToken?: string;

  constructor(init?: Partial<CreateWorkloadAccessTokenForJwtRequestBody>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.workloadName !== undefined && this.workloadName !== null) result['workload_name'] = toWire(this.workloadName);
    if (this.userToken !== undefined && this.userToken !== null) result['user_token'] = toWire(this.userToken);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): CreateWorkloadAccessTokenForJwtRequestBody {
    const model = new CreateWorkloadAccessTokenForJwtRequestBody();
    if (dict) {
      if (dict['workload_name'] !== undefined) model.workloadName = dict['workload_name'] as any;
      if (dict['user_token'] !== undefined) model.userToken = dict['user_token'] as any;
    }
    return model;
  }
}
