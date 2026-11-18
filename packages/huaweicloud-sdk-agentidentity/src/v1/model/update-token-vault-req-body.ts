/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { PolicyEngineConfiguration } from './policy-engine-configuration.js';
import { toWire } from './serialization.js';

export class UpdateTokenVaultReqBody {
  policyEngineConfiguration?: PolicyEngineConfiguration;

  constructor(init?: Partial<UpdateTokenVaultReqBody>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.policyEngineConfiguration !== undefined && this.policyEngineConfiguration !== null) result['policy_engine_configuration'] = toWire(this.policyEngineConfiguration);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): UpdateTokenVaultReqBody {
    const model = new UpdateTokenVaultReqBody();
    if (dict) {
      if (dict['policy_engine_configuration'] !== undefined && dict['policy_engine_configuration'] !== null) model.policyEngineConfiguration = PolicyEngineConfiguration.fromDict(dict['policy_engine_configuration']);
    }
    return model;
  }
}
