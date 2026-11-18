/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { UpdateTokenVaultReqBody } from './update-token-vault-req-body.js';
import { toWire } from './serialization.js';

export class UpdateTokenVaultRequest {
  tokenVaultId?: string;
  body?: UpdateTokenVaultReqBody;

  constructor(init?: Partial<UpdateTokenVaultRequest>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.tokenVaultId !== undefined && this.tokenVaultId !== null) result['token_vault_id'] = toWire(this.tokenVaultId);
    if (this.body !== undefined && this.body !== null) result['body'] = toWire(this.body);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): UpdateTokenVaultRequest {
    const model = new UpdateTokenVaultRequest();
    if (dict) {
      if (dict['token_vault_id'] !== undefined) model.tokenVaultId = dict['token_vault_id'] as any;
      if (dict['body'] !== undefined && dict['body'] !== null) model.body = UpdateTokenVaultReqBody.fromDict(dict['body']);
    }
    return model;
  }
}
