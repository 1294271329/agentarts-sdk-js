/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { UserIdentifier } from './user-identifier.js';
import { toWire } from './serialization.js';

export class CompleteResourceTokenAuthRequestBody {
  sessionUri?: string;
  userIdentifier?: UserIdentifier;

  constructor(init?: Partial<CompleteResourceTokenAuthRequestBody>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.sessionUri !== undefined && this.sessionUri !== null) result['session_uri'] = toWire(this.sessionUri);
    if (this.userIdentifier !== undefined && this.userIdentifier !== null) result['user_identifier'] = toWire(this.userIdentifier);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): CompleteResourceTokenAuthRequestBody {
    const model = new CompleteResourceTokenAuthRequestBody();
    if (dict) {
      if (dict['session_uri'] !== undefined) model.sessionUri = dict['session_uri'] as any;
      if (dict['user_identifier'] !== undefined && dict['user_identifier'] !== null) model.userIdentifier = UserIdentifier.fromDict(dict['user_identifier']);
    }
    return model;
  }
}
