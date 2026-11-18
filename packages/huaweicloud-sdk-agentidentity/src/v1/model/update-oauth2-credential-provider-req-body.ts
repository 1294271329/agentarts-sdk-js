/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { Oauth2ProviderConfigInput } from './oauth2-provider-config-input.js';
import { Tag } from './tag.js';
import { toWire } from './serialization.js';

export class UpdateOauth2CredentialProviderReqBody {
  oauth2ProviderConfigInput?: Oauth2ProviderConfigInput;
  tags?: Tag[];

  constructor(init?: Partial<UpdateOauth2CredentialProviderReqBody>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.oauth2ProviderConfigInput !== undefined && this.oauth2ProviderConfigInput !== null) result['oauth2_provider_config_input'] = toWire(this.oauth2ProviderConfigInput);
    if (this.tags !== undefined && this.tags !== null) result['tags'] = toWire(this.tags);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): UpdateOauth2CredentialProviderReqBody {
    const model = new UpdateOauth2CredentialProviderReqBody();
    if (dict) {
      if (dict['oauth2_provider_config_input'] !== undefined && dict['oauth2_provider_config_input'] !== null) model.oauth2ProviderConfigInput = Oauth2ProviderConfigInput.fromDict(dict['oauth2_provider_config_input']);
      if (dict['tags'] !== undefined && dict['tags'] !== null) model.tags = (dict['tags'] as any[]).map((item) => Tag.fromDict(item)) as any;
    }
    return model;
  }
}
