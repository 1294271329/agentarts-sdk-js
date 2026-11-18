/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { SdkResponse } from '@huaweicloud/huaweicloud-sdk-core/SdkResponse.js';
import { IdentityProviderListSummary } from './identity-provider-list-summary.js';
import { toWire } from './serialization.js';

export class ListIdentityProvidersResponse extends SdkResponse {
  identityProviders?: IdentityProviderListSummary[];

  constructor(init?: Partial<ListIdentityProvidersResponse>) {
    super();
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.identityProviders !== undefined && this.identityProviders !== null) result['identity_providers'] = toWire(this.identityProviders);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): ListIdentityProvidersResponse {
    const model = new ListIdentityProvidersResponse();
    if (dict) {
      if (dict['identity_providers'] !== undefined && dict['identity_providers'] !== null) model.identityProviders = (dict['identity_providers'] as any[]).map((item) => IdentityProviderListSummary.fromDict(item)) as any;
    }
    return model;
  }
}
