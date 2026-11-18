/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { Tag } from './tag.js';
import { PolicyEngineType } from './policy-engine-type.js';
import { toWire } from './serialization.js';

export class PolicyEngineSummary {
  policyEngineId?: string;
  name?: string;
  type?: PolicyEngineType;
  urn?: string;
  tags?: Tag[];
  createdAt?: string;
  updatedAt?: string;

  constructor(init?: Partial<PolicyEngineSummary>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.policyEngineId !== undefined && this.policyEngineId !== null) result['policy_engine_id'] = toWire(this.policyEngineId);
    if (this.name !== undefined && this.name !== null) result['name'] = toWire(this.name);
    if (this.type !== undefined && this.type !== null) result['type'] = toWire(this.type);
    if (this.urn !== undefined && this.urn !== null) result['urn'] = toWire(this.urn);
    if (this.tags !== undefined && this.tags !== null) result['tags'] = toWire(this.tags);
    if (this.createdAt !== undefined && this.createdAt !== null) result['created_at'] = toWire(this.createdAt);
    if (this.updatedAt !== undefined && this.updatedAt !== null) result['updated_at'] = toWire(this.updatedAt);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): PolicyEngineSummary {
    const model = new PolicyEngineSummary();
    if (dict) {
      if (dict['policy_engine_id'] !== undefined) model.policyEngineId = dict['policy_engine_id'] as any;
      if (dict['name'] !== undefined) model.name = dict['name'] as any;
      if (dict['type'] !== undefined) model.type = dict['type'] as any;
      if (dict['urn'] !== undefined) model.urn = dict['urn'] as any;
      if (dict['tags'] !== undefined && dict['tags'] !== null) model.tags = (dict['tags'] as any[]).map((item) => Tag.fromDict(item)) as any;
      if (dict['created_at'] !== undefined) model.createdAt = dict['created_at'] as any;
      if (dict['updated_at'] !== undefined) model.updatedAt = dict['updated_at'] as any;
    }
    return model;
  }
}
