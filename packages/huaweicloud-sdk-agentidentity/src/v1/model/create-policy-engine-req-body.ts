/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { Tag } from './tag.js';
import { PolicyEngineType } from './policy-engine-type.js';
import { toWire } from './serialization.js';

export class CreatePolicyEngineReqBody {
  name?: string;
  type?: PolicyEngineType;
  description?: string;
  tags?: Tag[];

  constructor(init?: Partial<CreatePolicyEngineReqBody>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.name !== undefined && this.name !== null) result['name'] = toWire(this.name);
    if (this.type !== undefined && this.type !== null) result['type'] = toWire(this.type);
    if (this.description !== undefined && this.description !== null) result['description'] = toWire(this.description);
    if (this.tags !== undefined && this.tags !== null) result['tags'] = toWire(this.tags);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): CreatePolicyEngineReqBody {
    const model = new CreatePolicyEngineReqBody();
    if (dict) {
      if (dict['name'] !== undefined) model.name = dict['name'] as any;
      if (dict['type'] !== undefined) model.type = dict['type'] as any;
      if (dict['description'] !== undefined) model.description = dict['description'] as any;
      if (dict['tags'] !== undefined && dict['tags'] !== null) model.tags = (dict['tags'] as any[]).map((item) => Tag.fromDict(item)) as any;
    }
    return model;
  }
}
