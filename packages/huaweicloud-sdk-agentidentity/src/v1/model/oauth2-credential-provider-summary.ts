/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { Tag } from './tag.js';
import { CredentialProviderVendor } from './credential-provider-vendor.js';
import { toWire } from './serialization.js';

export class Oauth2CredentialProviderSummary {
  name?: string;
  urn?: string;
  credentialProviderVendor?: CredentialProviderVendor;
  createdAt?: string;
  updatedAt?: string;
  tags?: Tag[];

  constructor(init?: Partial<Oauth2CredentialProviderSummary>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.name !== undefined && this.name !== null) result['name'] = toWire(this.name);
    if (this.urn !== undefined && this.urn !== null) result['urn'] = toWire(this.urn);
    if (this.credentialProviderVendor !== undefined && this.credentialProviderVendor !== null) result['credential_provider_vendor'] = toWire(this.credentialProviderVendor);
    if (this.createdAt !== undefined && this.createdAt !== null) result['created_at'] = toWire(this.createdAt);
    if (this.updatedAt !== undefined && this.updatedAt !== null) result['updated_at'] = toWire(this.updatedAt);
    if (this.tags !== undefined && this.tags !== null) result['tags'] = toWire(this.tags);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): Oauth2CredentialProviderSummary {
    const model = new Oauth2CredentialProviderSummary();
    if (dict) {
      if (dict['name'] !== undefined) model.name = dict['name'] as any;
      if (dict['urn'] !== undefined) model.urn = dict['urn'] as any;
      if (dict['credential_provider_vendor'] !== undefined) model.credentialProviderVendor = dict['credential_provider_vendor'] as any;
      if (dict['created_at'] !== undefined) model.createdAt = dict['created_at'] as any;
      if (dict['updated_at'] !== undefined) model.updatedAt = dict['updated_at'] as any;
      if (dict['tags'] !== undefined && dict['tags'] !== null) model.tags = (dict['tags'] as any[]).map((item) => Tag.fromDict(item)) as any;
    }
    return model;
  }
}
