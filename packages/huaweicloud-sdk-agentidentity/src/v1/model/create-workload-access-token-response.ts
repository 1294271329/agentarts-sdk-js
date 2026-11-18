/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { SdkResponse } from '@huaweicloud/huaweicloud-sdk-core/SdkResponse.js';
import { toWire } from './serialization.js';

export class CreateWorkloadAccessTokenResponse extends SdkResponse {
  workloadAccessToken?: string;

  constructor(init?: Partial<CreateWorkloadAccessTokenResponse>) {
    super();
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.workloadAccessToken !== undefined && this.workloadAccessToken !== null) result['workload_access_token'] = toWire(this.workloadAccessToken);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): CreateWorkloadAccessTokenResponse {
    const model = new CreateWorkloadAccessTokenResponse();
    if (dict) {
      if (dict['workload_access_token'] !== undefined) model.workloadAccessToken = dict['workload_access_token'] as any;
    }
    return model;
  }
}
