/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { toWire } from './serialization.js';

export class MicrosoftOauth2ProviderConfigInput {
  clientId?: string;
  clientSecret?: string;
  tenantId?: string;

  constructor(init?: Partial<MicrosoftOauth2ProviderConfigInput>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.clientId !== undefined && this.clientId !== null) result['client_id'] = toWire(this.clientId);
    if (this.clientSecret !== undefined && this.clientSecret !== null) result['client_secret'] = toWire(this.clientSecret);
    if (this.tenantId !== undefined && this.tenantId !== null) result['tenant_id'] = toWire(this.tenantId);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): MicrosoftOauth2ProviderConfigInput {
    const model = new MicrosoftOauth2ProviderConfigInput();
    if (dict) {
      if (dict['client_id'] !== undefined) model.clientId = dict['client_id'] as any;
      if (dict['client_secret'] !== undefined) model.clientSecret = dict['client_secret'] as any;
      if (dict['tenant_id'] !== undefined) model.tenantId = dict['tenant_id'] as any;
    }
    return model;
  }
}
