/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { PolicyDefinition } from './policy-definition.js';
import { ValidationMode } from './validation-mode.js';
import { toWire } from './serialization.js';

export class CreatePolicyReqBody {
  name?: string;
  description?: string;
  definition?: PolicyDefinition;
  validationMode?: ValidationMode;

  constructor(init?: Partial<CreatePolicyReqBody>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.name !== undefined && this.name !== null) result['name'] = toWire(this.name);
    if (this.description !== undefined && this.description !== null) result['description'] = toWire(this.description);
    if (this.definition !== undefined && this.definition !== null) result['definition'] = toWire(this.definition);
    if (this.validationMode !== undefined && this.validationMode !== null) result['validation_mode'] = toWire(this.validationMode);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): CreatePolicyReqBody {
    const model = new CreatePolicyReqBody();
    if (dict) {
      if (dict['name'] !== undefined) model.name = dict['name'] as any;
      if (dict['description'] !== undefined) model.description = dict['description'] as any;
      if (dict['definition'] !== undefined && dict['definition'] !== null) model.definition = PolicyDefinition.fromDict(dict['definition']);
      if (dict['validation_mode'] !== undefined) model.validationMode = dict['validation_mode'] as any;
    }
    return model;
  }
}
