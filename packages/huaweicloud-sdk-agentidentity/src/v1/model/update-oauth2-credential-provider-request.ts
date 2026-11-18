/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { UpdateOauth2CredentialProviderReqBody } from './update-oauth2-credential-provider-req-body.js';
import { toWire } from './serialization.js';

export class UpdateOauth2CredentialProviderRequest {
  credentialProviderName?: string;
  body?: UpdateOauth2CredentialProviderReqBody;

  constructor(init?: Partial<UpdateOauth2CredentialProviderRequest>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.credentialProviderName !== undefined && this.credentialProviderName !== null) result['credential_provider_name'] = toWire(this.credentialProviderName);
    if (this.body !== undefined && this.body !== null) result['body'] = toWire(this.body);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): UpdateOauth2CredentialProviderRequest {
    const model = new UpdateOauth2CredentialProviderRequest();
    if (dict) {
      if (dict['credential_provider_name'] !== undefined) model.credentialProviderName = dict['credential_provider_name'] as any;
      if (dict['body'] !== undefined && dict['body'] !== null) model.body = UpdateOauth2CredentialProviderReqBody.fromDict(dict['body']);
    }
    return model;
  }
}
