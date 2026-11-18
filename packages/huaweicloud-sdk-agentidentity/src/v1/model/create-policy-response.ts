/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { SdkResponse } from '@huaweicloud/huaweicloud-sdk-core/SdkResponse.js';
import { Policy } from './policy.js';
import { toWire } from './serialization.js';

export class CreatePolicyResponse extends SdkResponse {
  policy?: Policy;

  constructor(init?: Partial<CreatePolicyResponse>) {
    super();
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.policy !== undefined && this.policy !== null) result['policy'] = toWire(this.policy);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): CreatePolicyResponse {
    const model = new CreatePolicyResponse();
    if (dict) {
      if (dict['policy'] !== undefined && dict['policy'] !== null) model.policy = Policy.fromDict(dict['policy']);
    }
    return model;
  }
}
