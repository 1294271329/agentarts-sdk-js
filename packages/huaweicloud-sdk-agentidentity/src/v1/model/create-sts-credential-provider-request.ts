/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { CreateStsCredentialProviderReqBody } from './create-sts-credential-provider-req-body.js';
import { toWire } from './serialization.js';

export class CreateStsCredentialProviderRequest {
  body?: CreateStsCredentialProviderReqBody;

  constructor(init?: Partial<CreateStsCredentialProviderRequest>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.body !== undefined && this.body !== null) result['body'] = toWire(this.body);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): CreateStsCredentialProviderRequest {
    const model = new CreateStsCredentialProviderRequest();
    if (dict) {
      if (dict['body'] !== undefined && dict['body'] !== null) model.body = CreateStsCredentialProviderReqBody.fromDict(dict['body']);
    }
    return model;
  }
}
