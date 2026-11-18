/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { CustomOauth2ProviderConfigOutput } from './custom-oauth2-provider-config-output.js';
import { GithubOauth2ProviderConfigOutput } from './github-oauth2-provider-config-output.js';
import { GoogleOauth2ProviderConfigOutput } from './google-oauth2-provider-config-output.js';
import { MicrosoftOauth2ProviderConfigOutput } from './microsoft-oauth2-provider-config-output.js';
import { toWire } from './serialization.js';

export class Oauth2ProviderConfigOutput {
  microsoftOauth2ProviderConfig?: MicrosoftOauth2ProviderConfigOutput;
  googleOauth2ProviderConfig?: GoogleOauth2ProviderConfigOutput;
  githubOauth2ProviderConfig?: GithubOauth2ProviderConfigOutput;
  customOauth2ProviderConfig?: CustomOauth2ProviderConfigOutput;

  constructor(init?: Partial<Oauth2ProviderConfigOutput>) {
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

  static fromDict(dict?: Record<string, any> | null): Oauth2ProviderConfigOutput {
    const model = new Oauth2ProviderConfigOutput();
    if (dict) {
      if (dict['microsoft_oauth2_provider_config'] !== undefined && dict['microsoft_oauth2_provider_config'] !== null) model.microsoftOauth2ProviderConfig = MicrosoftOauth2ProviderConfigOutput.fromDict(dict['microsoft_oauth2_provider_config']);
      if (dict['google_oauth2_provider_config'] !== undefined && dict['google_oauth2_provider_config'] !== null) model.googleOauth2ProviderConfig = GoogleOauth2ProviderConfigOutput.fromDict(dict['google_oauth2_provider_config']);
      if (dict['github_oauth2_provider_config'] !== undefined && dict['github_oauth2_provider_config'] !== null) model.githubOauth2ProviderConfig = GithubOauth2ProviderConfigOutput.fromDict(dict['github_oauth2_provider_config']);
      if (dict['custom_oauth2_provider_config'] !== undefined && dict['custom_oauth2_provider_config'] !== null) model.customOauth2ProviderConfig = CustomOauth2ProviderConfigOutput.fromDict(dict['custom_oauth2_provider_config']);
    }
    return model;
  }
}
