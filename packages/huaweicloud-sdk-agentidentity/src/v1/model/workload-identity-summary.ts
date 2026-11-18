/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { CreatedBy } from './created-by.js';
import { Tag } from './tag.js';
import { AuthorizerType } from './authorizer-type.js';
import { toWire } from './serialization.js';

export class WorkloadIdentitySummary {
  name?: string;
  urn?: string;
  authorizerType?: AuthorizerType;
  createdBy?: CreatedBy;
  createdAt?: string;
  updatedAt?: string;
  tags?: Tag[];

  constructor(init?: Partial<WorkloadIdentitySummary>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.name !== undefined && this.name !== null) result['name'] = toWire(this.name);
    if (this.urn !== undefined && this.urn !== null) result['urn'] = toWire(this.urn);
    if (this.authorizerType !== undefined && this.authorizerType !== null) result['authorizer_type'] = toWire(this.authorizerType);
    if (this.createdBy !== undefined && this.createdBy !== null) result['created_by'] = toWire(this.createdBy);
    if (this.createdAt !== undefined && this.createdAt !== null) result['created_at'] = toWire(this.createdAt);
    if (this.updatedAt !== undefined && this.updatedAt !== null) result['updated_at'] = toWire(this.updatedAt);
    if (this.tags !== undefined && this.tags !== null) result['tags'] = toWire(this.tags);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): WorkloadIdentitySummary {
    const model = new WorkloadIdentitySummary();
    if (dict) {
      if (dict['name'] !== undefined) model.name = dict['name'] as any;
      if (dict['urn'] !== undefined) model.urn = dict['urn'] as any;
      if (dict['authorizer_type'] !== undefined) model.authorizerType = dict['authorizer_type'] as any;
      if (dict['created_by'] !== undefined && dict['created_by'] !== null) model.createdBy = CreatedBy.fromDict(dict['created_by']);
      if (dict['created_at'] !== undefined) model.createdAt = dict['created_at'] as any;
      if (dict['updated_at'] !== undefined) model.updatedAt = dict['updated_at'] as any;
      if (dict['tags'] !== undefined && dict['tags'] !== null) model.tags = (dict['tags'] as any[]).map((item) => Tag.fromDict(item)) as any;
    }
    return model;
  }
}
