/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { SdkResponse } from '@huaweicloud/huaweicloud-sdk-core/SdkResponse.js';
import { Oauth2CredentialProvider } from './oauth2-credential-provider.js';
import { toWire } from './serialization.js';

export class UpdateOauth2CredentialProviderResponse extends SdkResponse {
  credentialProvider?: Oauth2CredentialProvider;

  constructor(init?: Partial<UpdateOauth2CredentialProviderResponse>) {
    super();
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.credentialProvider !== undefined && this.credentialProvider !== null) result['credential_provider'] = toWire(this.credentialProvider);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): UpdateOauth2CredentialProviderResponse {
    const model = new UpdateOauth2CredentialProviderResponse();
    if (dict) {
      if (dict['credential_provider'] !== undefined && dict['credential_provider'] !== null) model.credentialProvider = Oauth2CredentialProvider.fromDict(dict['credential_provider']);
    }
    return model;
  }
}
