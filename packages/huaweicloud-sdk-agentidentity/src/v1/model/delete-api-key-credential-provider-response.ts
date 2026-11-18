/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { SdkResponse } from '@huaweicloud/huaweicloud-sdk-core/SdkResponse.js';
import { toWire } from './serialization.js';

export class DeleteApiKeyCredentialProviderResponse extends SdkResponse {

  constructor(init?: Partial<DeleteApiKeyCredentialProviderResponse>) {
    super();
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): DeleteApiKeyCredentialProviderResponse {
    const model = new DeleteApiKeyCredentialProviderResponse();
    if (dict) {
    }
    return model;
  }
}
