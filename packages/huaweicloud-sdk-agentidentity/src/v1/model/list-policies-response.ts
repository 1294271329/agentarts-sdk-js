/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { SdkResponse } from '@huaweicloud/huaweicloud-sdk-core/SdkResponse.js';
import { PageInfo } from './page-info.js';
import { PolicySummary } from './policy-summary.js';
import { toWire } from './serialization.js';

export class ListPoliciesResponse extends SdkResponse {
  policies?: PolicySummary[];
  pageInfo?: PageInfo;

  constructor(init?: Partial<ListPoliciesResponse>) {
    super();
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.policies !== undefined && this.policies !== null) result['policies'] = toWire(this.policies);
    if (this.pageInfo !== undefined && this.pageInfo !== null) result['page_info'] = toWire(this.pageInfo);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): ListPoliciesResponse {
    const model = new ListPoliciesResponse();
    if (dict) {
      if (dict['policies'] !== undefined && dict['policies'] !== null) model.policies = (dict['policies'] as any[]).map((item) => PolicySummary.fromDict(item)) as any;
      if (dict['page_info'] !== undefined && dict['page_info'] !== null) model.pageInfo = PageInfo.fromDict(dict['page_info']);
    }
    return model;
  }
}
