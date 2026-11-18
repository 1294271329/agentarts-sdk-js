/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { CustomOauth2ProviderConfigInput } from './custom-oauth2-provider-config-input.js';
import { GithubOauth2ProviderConfigInput } from './github-oauth2-provider-config-input.js';
import { GoogleOauth2ProviderConfigInput } from './google-oauth2-provider-config-input.js';
import { MicrosoftOauth2ProviderConfigInput } from './microsoft-oauth2-provider-config-input.js';
import { toWire } from './serialization.js';

export class Oauth2ProviderConfigInput {
  microsoftOauth2ProviderConfig?: MicrosoftOauth2ProviderConfigInput;
  googleOauth2ProviderConfig?: GoogleOauth2ProviderConfigInput;
  githubOauth2ProviderConfig?: GithubOauth2ProviderConfigInput;
  customOauth2ProviderConfig?: CustomOauth2ProviderConfigInput;

  constructor(init?: Partial<Oauth2ProviderConfigInput>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.microsoftOauth2ProviderConfig !== undefined && this.microsoftOauth2ProviderConfig !== null) result['microsoft_oauth2_provider_config'] = toWire(this.microsoftOauth2ProviderConfig);
    if (this.googleOauth2ProviderConfig !== undefined && this.googleOauth2ProviderConfig !== null) result['google_oauth2_provider_config'] = toWire(this.googleOauth2ProviderConfig);
    if (this.githubOauth2ProviderConfig !== undefined && this.githubOauth2ProviderConfig !== null) result['github_oauth2_provider_config'] = toWire(this.githubOauth2ProviderConfig);
    if (this.customOauth2ProviderConfig !== undefined && this.customOauth2ProviderConfig !== null) result['custom_oauth2_provider_config'] = toWire(this.customOauth2ProviderConfig);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): Oauth2ProviderConfigInput {
    const model = new Oauth2ProviderConfigInput();
    if (dict) {
      if (dict['microsoft_oauth2_provider_config'] !== undefined && dict['microsoft_oauth2_provider_config'] !== null) model.microsoftOauth2ProviderConfig = MicrosoftOauth2ProviderConfigInput.fromDict(dict['microsoft_oauth2_provider_config']);
      if (dict['google_oauth2_provider_config'] !== undefined && dict['google_oauth2_provider_config'] !== null) model.googleOauth2ProviderConfig = GoogleOauth2ProviderConfigInput.fromDict(dict['google_oauth2_provider_config']);
      if (dict['github_oauth2_provider_config'] !== undefined && dict['github_oauth2_provider_config'] !== null) model.githubOauth2ProviderConfig = GithubOauth2ProviderConfigInput.fromDict(dict['github_oauth2_provider_config']);
      if (dict['custom_oauth2_provider_config'] !== undefined && dict['custom_oauth2_provider_config'] !== null) model.customOauth2ProviderConfig = CustomOauth2ProviderConfigInput.fromDict(dict['custom_oauth2_provider_config']);
    }
    return model;
  }
}
