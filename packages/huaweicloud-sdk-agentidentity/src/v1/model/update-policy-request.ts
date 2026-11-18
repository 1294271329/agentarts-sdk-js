/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { UpdatePolicyReqBody } from './update-policy-req-body.js';
import { toWire } from './serialization.js';

export class UpdatePolicyRequest {
  policyEngineId?: string;
  policyId?: string;
  body?: UpdatePolicyReqBody;

  constructor(init?: Partial<UpdatePolicyRequest>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.policyEngineId !== undefined && this.policyEngineId !== null) result['policy_engine_id'] = toWire(this.policyEngineId);
    if (this.policyId !== undefined && this.policyId !== null) result['policy_id'] = toWire(this.policyId);
    if (this.body !== undefined && this.body !== null) result['body'] = toWire(this.body);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): UpdatePolicyRequest {
    const model = new UpdatePolicyRequest();
    if (dict) {
      if (dict['policy_engine_id'] !== undefined) model.policyEngineId = dict['policy_engine_id'] as any;
      if (dict['policy_id'] !== undefined) model.policyId = dict['policy_id'] as any;
      if (dict['body'] !== undefined && dict['body'] !== null) model.body = UpdatePolicyReqBody.fromDict(dict['body']);
    }
    return model;
  }
}
