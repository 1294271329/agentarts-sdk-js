/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { SdkResponse } from '@huaweicloud/huaweicloud-sdk-core/SdkResponse.js';
import { ApiKeyCredentialProviderSummary } from './api-key-credential-provider-summary.js';
import { PageInfo } from './page-info.js';
import { toWire } from './serialization.js';

export class ListApiKeyCredentialProvidersResponse extends SdkResponse {
  credentialProviders?: ApiKeyCredentialProviderSummary[];
  pageInfo?: PageInfo;

  constructor(init?: Partial<ListApiKeyCredentialProvidersResponse>) {
    super();
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.credentialProviders !== undefined && this.credentialProviders !== null) result['credential_providers'] = toWire(this.credentialProviders);
    if (this.pageInfo !== undefined && this.pageInfo !== null) result['page_info'] = toWire(this.pageInfo);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): ListApiKeyCredentialProvidersResponse {
    const model = new ListApiKeyCredentialProvidersResponse();
    if (dict) {
      if (dict['credential_providers'] !== undefined && dict['credential_providers'] !== null) model.credentialProviders = (dict['credential_providers'] as any[]).map((item) => ApiKeyCredentialProviderSummary.fromDict(item)) as any;
      if (dict['page_info'] !== undefined && dict['page_info'] !== null) model.pageInfo = PageInfo.fromDict(dict['page_info']);
    }
    return model;
  }
}
