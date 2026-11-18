/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { SdkResponse } from '@huaweicloud/huaweicloud-sdk-core/SdkResponse.js';
import { PageInfo } from './page-info.js';
import { PolicyEngineSummary } from './policy-engine-summary.js';
import { toWire } from './serialization.js';

export class ListPolicyEnginesResponse extends SdkResponse {
  policyEngines?: PolicyEngineSummary[];
  pageInfo?: PageInfo;

  constructor(init?: Partial<ListPolicyEnginesResponse>) {
    super();
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.policyEngines !== undefined && this.policyEngines !== null) result['policy_engines'] = toWire(this.policyEngines);
    if (this.pageInfo !== undefined && this.pageInfo !== null) result['page_info'] = toWire(this.pageInfo);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): ListPolicyEnginesResponse {
    const model = new ListPolicyEnginesResponse();
    if (dict) {
      if (dict['policy_engines'] !== undefined && dict['policy_engines'] !== null) model.policyEngines = (dict['policy_engines'] as any[]).map((item) => PolicyEngineSummary.fromDict(item)) as any;
      if (dict['page_info'] !== undefined && dict['page_info'] !== null) model.pageInfo = PageInfo.fromDict(dict['page_info']);
    }
    return model;
  }
}
