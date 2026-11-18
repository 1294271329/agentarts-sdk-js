/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { toWire } from './serialization.js';

export class GetTokenVaultRequest {
  tokenVaultId?: string;

  constructor(init?: Partial<GetTokenVaultRequest>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.tokenVaultId !== undefined && this.tokenVaultId !== null) result['token_vault_id'] = toWire(this.tokenVaultId);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): GetTokenVaultRequest {
    const model = new GetTokenVaultRequest();
    if (dict) {
      if (dict['token_vault_id'] !== undefined) model.tokenVaultId = dict['token_vault_id'] as any;
    }
    return model;
  }
}
