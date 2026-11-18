/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { Tag } from './tag.js';
import { toWire } from './serialization.js';

export class CreateApiKeyCredentialProviderReqBody {
  name?: string;
  apiKey?: string;
  tags?: Tag[];

  constructor(init?: Partial<CreateApiKeyCredentialProviderReqBody>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.name !== undefined && this.name !== null) result['name'] = toWire(this.name);
    if (this.apiKey !== undefined && this.apiKey !== null) result['api_key'] = toWire(this.apiKey);
    if (this.tags !== undefined && this.tags !== null) result['tags'] = toWire(this.tags);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): CreateApiKeyCredentialProviderReqBody {
    const model = new CreateApiKeyCredentialProviderReqBody();
    if (dict) {
      if (dict['name'] !== undefined) model.name = dict['name'] as any;
      if (dict['api_key'] !== undefined) model.apiKey = dict['api_key'] as any;
      if (dict['tags'] !== undefined && dict['tags'] !== null) model.tags = (dict['tags'] as any[]).map((item) => Tag.fromDict(item)) as any;
    }
    return model;
  }
}
