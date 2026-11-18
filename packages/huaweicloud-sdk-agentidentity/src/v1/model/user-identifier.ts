/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { toWire } from './serialization.js';

export class UserIdentifier {
  userToken?: string;
  userId?: string;

  constructor(init?: Partial<UserIdentifier>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.userToken !== undefined && this.userToken !== null) result['user_token'] = toWire(this.userToken);
    if (this.userId !== undefined && this.userId !== null) result['user_id'] = toWire(this.userId);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): UserIdentifier {
    const model = new UserIdentifier();
    if (dict) {
      if (dict['user_token'] !== undefined) model.userToken = dict['user_token'] as any;
      if (dict['user_id'] !== undefined) model.userId = dict['user_id'] as any;
    }
    return model;
  }
}
