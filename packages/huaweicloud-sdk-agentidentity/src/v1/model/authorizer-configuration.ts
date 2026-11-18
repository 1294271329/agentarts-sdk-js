/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { CustomJWTAuthorizerConfiguration } from './custom-j-w-t-authorizer-configuration.js';
import { KeyAuthAuthorizerConfiguration } from './key-auth-authorizer-configuration.js';
import { toWire } from './serialization.js';

export class AuthorizerConfiguration {
  customJwt?: CustomJWTAuthorizerConfiguration;
  keyAuth?: KeyAuthAuthorizerConfiguration;

  constructor(init?: Partial<AuthorizerConfiguration>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.customJwt !== undefined && this.customJwt !== null) result['custom_jwt'] = toWire(this.customJwt);
    if (this.keyAuth !== undefined && this.keyAuth !== null) result['key_auth'] = toWire(this.keyAuth);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): AuthorizerConfiguration {
    const model = new AuthorizerConfiguration();
    if (dict) {
      if (dict['custom_jwt'] !== undefined && dict['custom_jwt'] !== null) model.customJwt = CustomJWTAuthorizerConfiguration.fromDict(dict['custom_jwt']);
      if (dict['key_auth'] !== undefined && dict['key_auth'] !== null) model.keyAuth = KeyAuthAuthorizerConfiguration.fromDict(dict['key_auth']);
    }
    return model;
  }
}
