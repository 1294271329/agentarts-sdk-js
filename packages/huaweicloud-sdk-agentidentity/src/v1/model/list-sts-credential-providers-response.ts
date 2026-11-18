/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { SdkResponse } from '@huaweicloud/huaweicloud-sdk-core/SdkResponse.js';
import { PageInfo } from './page-info.js';
import { StsCredentialProviderSummary } from './sts-credential-provider-summary.js';
import { toWire } from './serialization.js';

export class ListStsCredentialProvidersResponse extends SdkResponse {
  credentialProviders?: StsCredentialProviderSummary[];
  pageInfo?: PageInfo;

  constructor(init?: Partial<ListStsCredentialProvidersResponse>) {
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

  static fromDict(dict?: Record<string, any> | null): ListStsCredentialProvidersResponse {
    const model = new ListStsCredentialProvidersResponse();
    if (dict) {
      if (dict['credential_providers'] !== undefined && dict['credential_providers'] !== null) model.credentialProviders = (dict['credential_providers'] as any[]).map((item) => StsCredentialProviderSummary.fromDict(item)) as any;
      if (dict['page_info'] !== undefined && dict['page_info'] !== null) model.pageInfo = PageInfo.fromDict(dict['page_info']);
    }
    return model;
  }
}
