/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { toWire } from './serialization.js';

export class Secret {
  secretId?: string;
  secretName?: string;

  constructor(init?: Partial<Secret>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.secretId !== undefined && this.secretId !== null) result['secret_id'] = toWire(this.secretId);
    if (this.secretName !== undefined && this.secretName !== null) result['secret_name'] = toWire(this.secretName);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): Secret {
    const model = new Secret();
    if (dict) {
      if (dict['secret_id'] !== undefined) model.secretId = dict['secret_id'] as any;
      if (dict['secret_name'] !== undefined) model.secretName = dict['secret_name'] as any;
    }
    return model;
  }
}
