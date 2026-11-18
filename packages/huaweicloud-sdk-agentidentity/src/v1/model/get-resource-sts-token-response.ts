/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { SdkResponse } from '@huaweicloud/huaweicloud-sdk-core/SdkResponse.js';
import { GetResourceStsTokenResponseBodyAssumedAgency } from './get-resource-sts-token-response-body-assumed-agency.js';
import { GetResourceStsTokenResponseBodyCredentials } from './get-resource-sts-token-response-body-credentials.js';
import { toWire } from './serialization.js';

export class GetResourceStsTokenResponse extends SdkResponse {
  sourceIdentity?: string;
  assumedAgency?: GetResourceStsTokenResponseBodyAssumedAgency;
  credentials?: GetResourceStsTokenResponseBodyCredentials;

  constructor(init?: Partial<GetResourceStsTokenResponse>) {
    super();
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.sourceIdentity !== undefined && this.sourceIdentity !== null) result['source_identity'] = toWire(this.sourceIdentity);
    if (this.assumedAgency !== undefined && this.assumedAgency !== null) result['assumed_agency'] = toWire(this.assumedAgency);
    if (this.credentials !== undefined && this.credentials !== null) result['credentials'] = toWire(this.credentials);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): GetResourceStsTokenResponse {
    const model = new GetResourceStsTokenResponse();
    if (dict) {
      if (dict['source_identity'] !== undefined) model.sourceIdentity = dict['source_identity'] as any;
      if (dict['assumed_agency'] !== undefined && dict['assumed_agency'] !== null) model.assumedAgency = GetResourceStsTokenResponseBodyAssumedAgency.fromDict(dict['assumed_agency']);
      if (dict['credentials'] !== undefined && dict['credentials'] !== null) model.credentials = GetResourceStsTokenResponseBodyCredentials.fromDict(dict['credentials']);
    }
    return model;
  }
}
