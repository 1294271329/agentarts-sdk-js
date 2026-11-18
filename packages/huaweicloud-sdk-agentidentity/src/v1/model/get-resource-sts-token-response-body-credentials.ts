/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { toWire } from './serialization.js';

export class GetResourceStsTokenResponseBodyCredentials {
  accessKeyId?: string;
  expiration?: string;
  secretAccessKey?: string;
  securityToken?: string;

  constructor(init?: Partial<GetResourceStsTokenResponseBodyCredentials>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.accessKeyId !== undefined && this.accessKeyId !== null) result['access_key_id'] = toWire(this.accessKeyId);
    if (this.expiration !== undefined && this.expiration !== null) result['expiration'] = toWire(this.expiration);
    if (this.secretAccessKey !== undefined && this.secretAccessKey !== null) result['secret_access_key'] = toWire(this.secretAccessKey);
    if (this.securityToken !== undefined && this.securityToken !== null) result['security_token'] = toWire(this.securityToken);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): GetResourceStsTokenResponseBodyCredentials {
    const model = new GetResourceStsTokenResponseBodyCredentials();
    if (dict) {
      if (dict['access_key_id'] !== undefined) model.accessKeyId = dict['access_key_id'] as any;
      if (dict['expiration'] !== undefined) model.expiration = dict['expiration'] as any;
      if (dict['secret_access_key'] !== undefined) model.secretAccessKey = dict['secret_access_key'] as any;
      if (dict['security_token'] !== undefined) model.securityToken = dict['security_token'] as any;
    }
    return model;
  }
}
