/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { Oauth2ProviderConfigInput } from './oauth2-provider-config-input.js';
import { Tag } from './tag.js';
import { CredentialProviderVendor } from './credential-provider-vendor.js';
import { toWire } from './serialization.js';

export class CreateOauth2CredentialProviderReqBody {
  name?: string;
  credentialProviderVendor?: CredentialProviderVendor;
  oauth2ProviderConfigInput?: Oauth2ProviderConfigInput;
  tags?: Tag[];

  constructor(init?: Partial<CreateOauth2CredentialProviderReqBody>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.name !== undefined && this.name !== null) result['name'] = toWire(this.name);
    if (this.credentialProviderVendor !== undefined && this.credentialProviderVendor !== null) result['credential_provider_vendor'] = toWire(this.credentialProviderVendor);
    if (this.oauth2ProviderConfigInput !== undefined && this.oauth2ProviderConfigInput !== null) result['oauth2_provider_config_input'] = toWire(this.oauth2ProviderConfigInput);
    if (this.tags !== undefined && this.tags !== null) result['tags'] = toWire(this.tags);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): CreateOauth2CredentialProviderReqBody {
    const model = new CreateOauth2CredentialProviderReqBody();
    if (dict) {
      if (dict['name'] !== undefined) model.name = dict['name'] as any;
      if (dict['credential_provider_vendor'] !== undefined) model.credentialProviderVendor = dict['credential_provider_vendor'] as any;
      if (dict['oauth2_provider_config_input'] !== undefined && dict['oauth2_provider_config_input'] !== null) model.oauth2ProviderConfigInput = Oauth2ProviderConfigInput.fromDict(dict['oauth2_provider_config_input']);
      if (dict['tags'] !== undefined && dict['tags'] !== null) model.tags = (dict['tags'] as any[]).map((item) => Tag.fromDict(item)) as any;
    }
    return model;
  }
}
