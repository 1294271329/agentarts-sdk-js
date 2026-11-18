/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { UpdateStsCredentialProviderReqBody } from './update-sts-credential-provider-req-body.js';
import { toWire } from './serialization.js';

export class UpdateStsCredentialProviderRequest {
  credentialProviderName?: string;
  body?: UpdateStsCredentialProviderReqBody;

  constructor(init?: Partial<UpdateStsCredentialProviderRequest>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.credentialProviderName !== undefined && this.credentialProviderName !== null) result['credential_provider_name'] = toWire(this.credentialProviderName);
    if (this.body !== undefined && this.body !== null) result['body'] = toWire(this.body);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): UpdateStsCredentialProviderRequest {
    const model = new UpdateStsCredentialProviderRequest();
    if (dict) {
      if (dict['credential_provider_name'] !== undefined) model.credentialProviderName = dict['credential_provider_name'] as any;
      if (dict['body'] !== undefined && dict['body'] !== null) model.body = UpdateStsCredentialProviderReqBody.fromDict(dict['body']);
    }
    return model;
  }
}
