/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { SdkResponse } from '@huaweicloud/huaweicloud-sdk-core/SdkResponse.js';
import { toWire } from './serialization.js';

export class DeleteOauth2CredentialProviderResponse extends SdkResponse {

  constructor(init?: Partial<DeleteOauth2CredentialProviderResponse>) {
    super();
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): DeleteOauth2CredentialProviderResponse {
    const model = new DeleteOauth2CredentialProviderResponse();
    if (dict) {
    }
    return model;
  }
}
