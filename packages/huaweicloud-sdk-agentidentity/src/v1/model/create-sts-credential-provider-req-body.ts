/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { Tag } from './tag.js';
import { toWire } from './serialization.js';

export class CreateStsCredentialProviderReqBody {
  name?: string;
  agencyUrn?: string;
  tags?: Tag[];

  constructor(init?: Partial<CreateStsCredentialProviderReqBody>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.name !== undefined && this.name !== null) result['name'] = toWire(this.name);
    if (this.agencyUrn !== undefined && this.agencyUrn !== null) result['agency_urn'] = toWire(this.agencyUrn);
    if (this.tags !== undefined && this.tags !== null) result['tags'] = toWire(this.tags);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): CreateStsCredentialProviderReqBody {
    const model = new CreateStsCredentialProviderReqBody();
    if (dict) {
      if (dict['name'] !== undefined) model.name = dict['name'] as any;
      if (dict['agency_urn'] !== undefined) model.agencyUrn = dict['agency_urn'] as any;
      if (dict['tags'] !== undefined && dict['tags'] !== null) model.tags = (dict['tags'] as any[]).map((item) => Tag.fromDict(item)) as any;
    }
    return model;
  }
}
