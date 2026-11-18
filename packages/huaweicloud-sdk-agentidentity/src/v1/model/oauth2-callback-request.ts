/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { toWire } from './serialization.js';

export class Oauth2CallbackRequest {
  credentialProviderId?: string;
  code?: string;
  state?: string;
  error?: string;
  errorDescription?: string;

  constructor(init?: Partial<Oauth2CallbackRequest>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.credentialProviderId !== undefined && this.credentialProviderId !== null) result['credential_provider_id'] = toWire(this.credentialProviderId);
    if (this.code !== undefined && this.code !== null) result['code'] = toWire(this.code);
    if (this.state !== undefined && this.state !== null) result['state'] = toWire(this.state);
    if (this.error !== undefined && this.error !== null) result['error'] = toWire(this.error);
    if (this.errorDescription !== undefined && this.errorDescription !== null) result['error_description'] = toWire(this.errorDescription);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): Oauth2CallbackRequest {
    const model = new Oauth2CallbackRequest();
    if (dict) {
      if (dict['credential_provider_id'] !== undefined) model.credentialProviderId = dict['credential_provider_id'] as any;
      if (dict['code'] !== undefined) model.code = dict['code'] as any;
      if (dict['state'] !== undefined) model.state = dict['state'] as any;
      if (dict['error'] !== undefined) model.error = dict['error'] as any;
      if (dict['error_description'] !== undefined) model.errorDescription = dict['error_description'] as any;
    }
    return model;
  }
}
