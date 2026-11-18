/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { PolicyStatus } from './policy-status.js';
import { toWire } from './serialization.js';

export class PolicySummary {
  policyId?: string;
  name?: string;
  description?: string;
  urn?: string;
  status?: PolicyStatus;
  statusReasons?: string[];
  createdAt?: string;
  updatedAt?: string;
  policyEngineId?: string;

  constructor(init?: Partial<PolicySummary>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.policyId !== undefined && this.policyId !== null) result['policy_id'] = toWire(this.policyId);
    if (this.name !== undefined && this.name !== null) result['name'] = toWire(this.name);
    if (this.description !== undefined && this.description !== null) result['description'] = toWire(this.description);
    if (this.urn !== undefined && this.urn !== null) result['urn'] = toWire(this.urn);
    if (this.status !== undefined && this.status !== null) result['status'] = toWire(this.status);
    if (this.statusReasons !== undefined && this.statusReasons !== null) result['status_reasons'] = toWire(this.statusReasons);
    if (this.createdAt !== undefined && this.createdAt !== null) result['created_at'] = toWire(this.createdAt);
    if (this.updatedAt !== undefined && this.updatedAt !== null) result['updated_at'] = toWire(this.updatedAt);
    if (this.policyEngineId !== undefined && this.policyEngineId !== null) result['policy_engine_id'] = toWire(this.policyEngineId);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): PolicySummary {
    const model = new PolicySummary();
    if (dict) {
      if (dict['policy_id'] !== undefined) model.policyId = dict['policy_id'] as any;
      if (dict['name'] !== undefined) model.name = dict['name'] as any;
      if (dict['description'] !== undefined) model.description = dict['description'] as any;
      if (dict['urn'] !== undefined) model.urn = dict['urn'] as any;
      if (dict['status'] !== undefined) model.status = dict['status'] as any;
      if (dict['status_reasons'] !== undefined) model.statusReasons = dict['status_reasons'] as any;
      if (dict['created_at'] !== undefined) model.createdAt = dict['created_at'] as any;
      if (dict['updated_at'] !== undefined) model.updatedAt = dict['updated_at'] as any;
      if (dict['policy_engine_id'] !== undefined) model.policyEngineId = dict['policy_engine_id'] as any;
    }
    return model;
  }
}
