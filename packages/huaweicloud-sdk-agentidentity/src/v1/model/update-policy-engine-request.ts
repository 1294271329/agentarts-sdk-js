/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { UpdatePolicyEngineReqBody } from './update-policy-engine-req-body.js';
import { toWire } from './serialization.js';

export class UpdatePolicyEngineRequest {
  policyEngineId?: string;
  body?: UpdatePolicyEngineReqBody;

  constructor(init?: Partial<UpdatePolicyEngineRequest>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.policyEngineId !== undefined && this.policyEngineId !== null) result['policy_engine_id'] = toWire(this.policyEngineId);
    if (this.body !== undefined && this.body !== null) result['body'] = toWire(this.body);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): UpdatePolicyEngineRequest {
    const model = new UpdatePolicyEngineRequest();
    if (dict) {
      if (dict['policy_engine_id'] !== undefined) model.policyEngineId = dict['policy_engine_id'] as any;
      if (dict['body'] !== undefined && dict['body'] !== null) model.body = UpdatePolicyEngineReqBody.fromDict(dict['body']);
    }
    return model;
  }
}
