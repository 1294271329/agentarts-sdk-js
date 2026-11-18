/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { CreateApiKeyCredentialProviderReqBody } from './create-api-key-credential-provider-req-body.js';
import { toWire } from './serialization.js';

export class CreateApiKeyCredentialProviderRequest {
  body?: CreateApiKeyCredentialProviderReqBody;

  constructor(init?: Partial<CreateApiKeyCredentialProviderRequest>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.body !== undefined && this.body !== null) result['body'] = toWire(this.body);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): CreateApiKeyCredentialProviderRequest {
    const model = new CreateApiKeyCredentialProviderRequest();
    if (dict) {
      if (dict['body'] !== undefined && dict['body'] !== null) model.body = CreateApiKeyCredentialProviderReqBody.fromDict(dict['body']);
    }
    return model;
  }
}
