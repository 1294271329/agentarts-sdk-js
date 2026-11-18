/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { SdkResponse } from '@huaweicloud/huaweicloud-sdk-core/SdkResponse.js';
import { PageInfo } from './page-info.js';
import { PolicyEngineAttachmentSummary } from './policy-engine-attachment-summary.js';
import { toWire } from './serialization.js';

export class ListPolicyEngineAttachmentsResponse extends SdkResponse {
  attachments?: PolicyEngineAttachmentSummary[];
  pageInfo?: PageInfo;

  constructor(init?: Partial<ListPolicyEngineAttachmentsResponse>) {
    super();
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.attachments !== undefined && this.attachments !== null) result['attachments'] = toWire(this.attachments);
    if (this.pageInfo !== undefined && this.pageInfo !== null) result['page_info'] = toWire(this.pageInfo);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): ListPolicyEngineAttachmentsResponse {
    const model = new ListPolicyEngineAttachmentsResponse();
    if (dict) {
      if (dict['attachments'] !== undefined && dict['attachments'] !== null) model.attachments = (dict['attachments'] as any[]).map((item) => PolicyEngineAttachmentSummary.fromDict(item)) as any;
      if (dict['page_info'] !== undefined && dict['page_info'] !== null) model.pageInfo = PageInfo.fromDict(dict['page_info']);
    }
    return model;
  }
}
