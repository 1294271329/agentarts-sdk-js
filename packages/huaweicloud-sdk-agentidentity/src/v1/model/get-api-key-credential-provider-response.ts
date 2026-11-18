/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { SdkResponse } from '@huaweicloud/huaweicloud-sdk-core/SdkResponse.js';
import { ApiKeyCredentialProvider } from './api-key-credential-provider.js';
import { toWire } from './serialization.js';

export class GetApiKeyCredentialProviderResponse extends SdkResponse {
  credentialProvider?: ApiKeyCredentialProvider;

  constructor(init?: Partial<GetApiKeyCredentialProviderResponse>) {
    super();
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.credentialProvider !== undefined && this.credentialProvider !== null) result['credential_provider'] = toWire(this.credentialProvider);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): GetApiKeyCredentialProviderResponse {
    const model = new GetApiKeyCredentialProviderResponse();
    if (dict) {
      if (dict['credential_provider'] !== undefined && dict['credential_provider'] !== null) model.credentialProvider = ApiKeyCredentialProvider.fromDict(dict['credential_provider']);
    }
    return model;
  }
}
