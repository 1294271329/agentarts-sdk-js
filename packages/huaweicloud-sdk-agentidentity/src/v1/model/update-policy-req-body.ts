/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { PolicyDefinition } from './policy-definition.js';
import { ValidationMode } from './validation-mode.js';
import { toWire } from './serialization.js';

export class UpdatePolicyReqBody {
  description?: string;
  definition?: PolicyDefinition;
  validationMode?: ValidationMode;

  constructor(init?: Partial<UpdatePolicyReqBody>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.description !== undefined && this.description !== null) result['description'] = toWire(this.description);
    if (this.definition !== undefined && this.definition !== null) result['definition'] = toWire(this.definition);
    if (this.validationMode !== undefined && this.validationMode !== null) result['validation_mode'] = toWire(this.validationMode);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): UpdatePolicyReqBody {
    const model = new UpdatePolicyReqBody();
    if (dict) {
      if (dict['description'] !== undefined) model.description = dict['description'] as any;
      if (dict['definition'] !== undefined && dict['definition'] !== null) model.definition = PolicyDefinition.fromDict(dict['definition']);
      if (dict['validation_mode'] !== undefined) model.validationMode = dict['validation_mode'] as any;
    }
    return model;
  }
}
