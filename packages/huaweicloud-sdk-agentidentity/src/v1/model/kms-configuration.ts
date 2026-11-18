/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { KmsKeyType } from './kms-key-type.js';
import { toWire } from './serialization.js';

export class KmsConfiguration {
  keyType?: KmsKeyType;
  kmsKeyId?: string;

  constructor(init?: Partial<KmsConfiguration>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.keyType !== undefined && this.keyType !== null) result['key_type'] = toWire(this.keyType);
    if (this.kmsKeyId !== undefined && this.kmsKeyId !== null) result['kms_key_id'] = toWire(this.kmsKeyId);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): KmsConfiguration {
    const model = new KmsConfiguration();
    if (dict) {
      if (dict['key_type'] !== undefined) model.keyType = dict['key_type'] as any;
      if (dict['kms_key_id'] !== undefined) model.kmsKeyId = dict['kms_key_id'] as any;
    }
    return model;
  }
}
