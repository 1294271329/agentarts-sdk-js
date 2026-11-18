/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { toWire } from './serialization.js';

export class DeleteOauth2CredentialProviderRequest {
  credentialProviderName?: string;

  constructor(init?: Partial<DeleteOauth2CredentialProviderRequest>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.credentialProviderName !== undefined && this.credentialProviderName !== null) result['credential_provider_name'] = toWire(this.credentialProviderName);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): DeleteOauth2CredentialProviderRequest {
    const model = new DeleteOauth2CredentialProviderRequest();
    if (dict) {
      if (dict['credential_provider_name'] !== undefined) model.credentialProviderName = dict['credential_provider_name'] as any;
    }
    return model;
  }
}
