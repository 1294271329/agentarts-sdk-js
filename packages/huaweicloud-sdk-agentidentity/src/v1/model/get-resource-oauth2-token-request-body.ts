/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { toWire } from './serialization.js';

export class GetResourceOauth2TokenRequestBody {
  customParameters?: Record<string, string>;
  customState?: string;
  forceAuthentication?: boolean;
  oauth2Flow?: string;
  resourceCredentialProviderName?: string;
  resourceOauth2ReturnUrl?: string;
  scopes?: string[];
  sessionUri?: string;
  workloadAccessToken?: string;

  constructor(init?: Partial<GetResourceOauth2TokenRequestBody>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.customParameters !== undefined && this.customParameters !== null) result['custom_parameters'] = toWire(this.customParameters);
    if (this.customState !== undefined && this.customState !== null) result['custom_state'] = toWire(this.customState);
    if (this.forceAuthentication !== undefined && this.forceAuthentication !== null) result['force_authentication'] = toWire(this.forceAuthentication);
    if (this.oauth2Flow !== undefined && this.oauth2Flow !== null) result['oauth2_flow'] = toWire(this.oauth2Flow);
    if (this.resourceCredentialProviderName !== undefined && this.resourceCredentialProviderName !== null) result['resource_credential_provider_name'] = toWire(this.resourceCredentialProviderName);
    if (this.resourceOauth2ReturnUrl !== undefined && this.resourceOauth2ReturnUrl !== null) result['resource_oauth2_return_url'] = toWire(this.resourceOauth2ReturnUrl);
    if (this.scopes !== undefined && this.scopes !== null) result['scopes'] = toWire(this.scopes);
    if (this.sessionUri !== undefined && this.sessionUri !== null) result['session_uri'] = toWire(this.sessionUri);
    if (this.workloadAccessToken !== undefined && this.workloadAccessToken !== null) result['workload_access_token'] = toWire(this.workloadAccessToken);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): GetResourceOauth2TokenRequestBody {
    const model = new GetResourceOauth2TokenRequestBody();
    if (dict) {
      if (dict['custom_parameters'] !== undefined) model.customParameters = dict['custom_parameters'] as any;
      if (dict['custom_state'] !== undefined) model.customState = dict['custom_state'] as any;
      if (dict['force_authentication'] !== undefined) model.forceAuthentication = dict['force_authentication'] as any;
      if (dict['oauth2_flow'] !== undefined) model.oauth2Flow = dict['oauth2_flow'] as any;
      if (dict['resource_credential_provider_name'] !== undefined) model.resourceCredentialProviderName = dict['resource_credential_provider_name'] as any;
      if (dict['resource_oauth2_return_url'] !== undefined) model.resourceOauth2ReturnUrl = dict['resource_oauth2_return_url'] as any;
      if (dict['scopes'] !== undefined) model.scopes = dict['scopes'] as any;
      if (dict['session_uri'] !== undefined) model.sessionUri = dict['session_uri'] as any;
      if (dict['workload_access_token'] !== undefined) model.workloadAccessToken = dict['workload_access_token'] as any;
    }
    return model;
  }
}
