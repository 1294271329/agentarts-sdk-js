/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { KmsConfiguration } from './kms-configuration.js';
import { PolicyEngineConfiguration } from './policy-engine-configuration.js';
import { Tag } from './tag.js';
import { toWire } from './serialization.js';

export class TokenVault {
  tokenVaultId?: string;
  urn?: string;
  kmsConfiguration?: KmsConfiguration;
  policyEngineConfiguration?: PolicyEngineConfiguration;
  updatedAt?: string;
  tags?: Tag[];

  constructor(init?: Partial<TokenVault>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.tokenVaultId !== undefined && this.tokenVaultId !== null) result['token_vault_id'] = toWire(this.tokenVaultId);
    if (this.urn !== undefined && this.urn !== null) result['urn'] = toWire(this.urn);
    if (this.kmsConfiguration !== undefined && this.kmsConfiguration !== null) result['kms_configuration'] = toWire(this.kmsConfiguration);
    if (this.policyEngineConfiguration !== undefined && this.policyEngineConfiguration !== null) result['policy_engine_configuration'] = toWire(this.policyEngineConfiguration);
    if (this.updatedAt !== undefined && this.updatedAt !== null) result['updated_at'] = toWire(this.updatedAt);
    if (this.tags !== undefined && this.tags !== null) result['tags'] = toWire(this.tags);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): TokenVault {
    const model = new TokenVault();
    if (dict) {
      if (dict['token_vault_id'] !== undefined) model.tokenVaultId = dict['token_vault_id'] as any;
      if (dict['urn'] !== undefined) model.urn = dict['urn'] as any;
      if (dict['kms_configuration'] !== undefined && dict['kms_configuration'] !== null) model.kmsConfiguration = KmsConfiguration.fromDict(dict['kms_configuration']);
      if (dict['policy_engine_configuration'] !== undefined && dict['policy_engine_configuration'] !== null) model.policyEngineConfiguration = PolicyEngineConfiguration.fromDict(dict['policy_engine_configuration']);
      if (dict['updated_at'] !== undefined) model.updatedAt = dict['updated_at'] as any;
      if (dict['tags'] !== undefined && dict['tags'] !== null) model.tags = (dict['tags'] as any[]).map((item) => Tag.fromDict(item)) as any;
    }
    return model;
  }
}
