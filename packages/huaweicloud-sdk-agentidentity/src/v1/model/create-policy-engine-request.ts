/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { CreatePolicyEngineReqBody } from './create-policy-engine-req-body.js';
import { toWire } from './serialization.js';

export class CreatePolicyEngineRequest {
  body?: CreatePolicyEngineReqBody;

  constructor(init?: Partial<CreatePolicyEngineRequest>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.body !== undefined && this.body !== null) result['body'] = toWire(this.body);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): CreatePolicyEngineRequest {
    const model = new CreatePolicyEngineRequest();
    if (dict) {
      if (dict['body'] !== undefined && dict['body'] !== null) model.body = CreatePolicyEngineReqBody.fromDict(dict['body']);
    }
    return model;
  }
}
