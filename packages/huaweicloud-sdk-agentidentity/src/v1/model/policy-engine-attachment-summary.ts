/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { EntityType } from './entity-type.js';
import { PolicyEngineMode } from './policy-engine-mode.js';
import { toWire } from './serialization.js';

export class PolicyEngineAttachmentSummary {
  entityType?: EntityType;
  entityId?: string;
  mode?: PolicyEngineMode;
  attachedAt?: string;

  constructor(init?: Partial<PolicyEngineAttachmentSummary>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.entityType !== undefined && this.entityType !== null) result['entity_type'] = toWire(this.entityType);
    if (this.entityId !== undefined && this.entityId !== null) result['entity_id'] = toWire(this.entityId);
    if (this.mode !== undefined && this.mode !== null) result['mode'] = toWire(this.mode);
    if (this.attachedAt !== undefined && this.attachedAt !== null) result['attached_at'] = toWire(this.attachedAt);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): PolicyEngineAttachmentSummary {
    const model = new PolicyEngineAttachmentSummary();
    if (dict) {
      if (dict['entity_type'] !== undefined) model.entityType = dict['entity_type'] as any;
      if (dict['entity_id'] !== undefined) model.entityId = dict['entity_id'] as any;
      if (dict['mode'] !== undefined) model.mode = dict['mode'] as any;
      if (dict['attached_at'] !== undefined) model.attachedAt = dict['attached_at'] as any;
    }
    return model;
  }
}
