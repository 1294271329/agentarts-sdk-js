/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { SdkResponse } from '@huaweicloud/huaweicloud-sdk-core/SdkResponse.js';
import { toWire } from './serialization.js';

export class GetResourceOauth2TokenResponse extends SdkResponse {
  accessToken?: string;
  authorizationUrl?: string;
  sessionStatus?: string;
  sessionUri?: string;
  expiresAt?: string;

  constructor(init?: Partial<GetResourceOauth2TokenResponse>) {
    super();
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.accessToken !== undefined && this.accessToken !== null) result['access_token'] = toWire(this.accessToken);
    if (this.authorizationUrl !== undefined && this.authorizationUrl !== null) result['authorization_url'] = toWire(this.authorizationUrl);
    if (this.sessionStatus !== undefined && this.sessionStatus !== null) result['session_status'] = toWire(this.sessionStatus);
    if (this.sessionUri !== undefined && this.sessionUri !== null) result['session_uri'] = toWire(this.sessionUri);
    if (this.expiresAt !== undefined && this.expiresAt !== null) result['expires_at'] = toWire(this.expiresAt);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): GetResourceOauth2TokenResponse {
    const model = new GetResourceOauth2TokenResponse();
    if (dict) {
      if (dict['access_token'] !== undefined) model.accessToken = dict['access_token'] as any;
      if (dict['authorization_url'] !== undefined) model.authorizationUrl = dict['authorization_url'] as any;
      if (dict['session_status'] !== undefined) model.sessionStatus = dict['session_status'] as any;
      if (dict['session_uri'] !== undefined) model.sessionUri = dict['session_uri'] as any;
      if (dict['expires_at'] !== undefined) model.expiresAt = dict['expires_at'] as any;
    }
    return model;
  }
}
