/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { SdkResponse } from '@huaweicloud/huaweicloud-sdk-core/SdkResponse.js';
import { TokenVault } from './token-vault.js';
import { toWire } from './serialization.js';

export class GetTokenVaultResponse extends SdkResponse {
  tokenVault?: TokenVault;

  constructor(init?: Partial<GetTokenVaultResponse>) {
    super();
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.tokenVault !== undefined && this.tokenVault !== null) result['token_vault'] = toWire(this.tokenVault);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): GetTokenVaultResponse {
    const model = new GetTokenVaultResponse();
    if (dict) {
      if (dict['token_vault'] !== undefined && dict['token_vault'] !== null) model.tokenVault = TokenVault.fromDict(dict['token_vault']);
    }
    return model;
  }
}
