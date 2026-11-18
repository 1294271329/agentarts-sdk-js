/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { CreateOauth2CredentialProviderReqBody } from './create-oauth2-credential-provider-req-body.js';
import { toWire } from './serialization.js';

export class CreateOauth2CredentialProviderRequest {
  body?: CreateOauth2CredentialProviderReqBody;

  constructor(init?: Partial<CreateOauth2CredentialProviderRequest>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.body !== undefined && this.body !== null) result['body'] = toWire(this.body);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): CreateOauth2CredentialProviderRequest {
    const model = new CreateOauth2CredentialProviderRequest();
    if (dict) {
      if (dict['body'] !== undefined && dict['body'] !== null) model.body = CreateOauth2CredentialProviderReqBody.fromDict(dict['body']);
    }
    return model;
  }
}
