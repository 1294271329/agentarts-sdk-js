/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { SdkResponse } from '@huaweicloud/huaweicloud-sdk-core/SdkResponse.js';
import { StsCredentialProvider } from './sts-credential-provider.js';
import { toWire } from './serialization.js';

export class GetStsCredentialProviderResponse extends SdkResponse {
  credentialProvider?: StsCredentialProvider;

  constructor(init?: Partial<GetStsCredentialProviderResponse>) {
    super();
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.credentialProvider !== undefined && this.credentialProvider !== null) result['credential_provider'] = toWire(this.credentialProvider);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): GetStsCredentialProviderResponse {
    const model = new GetStsCredentialProviderResponse();
    if (dict) {
      if (dict['credential_provider'] !== undefined && dict['credential_provider'] !== null) model.credentialProvider = StsCredentialProvider.fromDict(dict['credential_provider']);
    }
    return model;
  }
}
