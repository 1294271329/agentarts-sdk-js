/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { SdkResponse } from '@huaweicloud/huaweicloud-sdk-core/SdkResponse.js';
import { PageInfo } from './page-info.js';
import { WorkloadIdentitySummary } from './workload-identity-summary.js';
import { toWire } from './serialization.js';

export class ListWorkloadIdentitiesResponse extends SdkResponse {
  workloadIdentities?: WorkloadIdentitySummary[];
  pageInfo?: PageInfo;

  constructor(init?: Partial<ListWorkloadIdentitiesResponse>) {
    super();
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.workloadIdentities !== undefined && this.workloadIdentities !== null) result['workload_identities'] = toWire(this.workloadIdentities);
    if (this.pageInfo !== undefined && this.pageInfo !== null) result['page_info'] = toWire(this.pageInfo);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): ListWorkloadIdentitiesResponse {
    const model = new ListWorkloadIdentitiesResponse();
    if (dict) {
      if (dict['workload_identities'] !== undefined && dict['workload_identities'] !== null) model.workloadIdentities = (dict['workload_identities'] as any[]).map((item) => WorkloadIdentitySummary.fromDict(item)) as any;
      if (dict['page_info'] !== undefined && dict['page_info'] !== null) model.pageInfo = PageInfo.fromDict(dict['page_info']);
    }
    return model;
  }
}
