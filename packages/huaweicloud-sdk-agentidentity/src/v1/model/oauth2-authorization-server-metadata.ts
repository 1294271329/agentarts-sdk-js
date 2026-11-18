/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { toWire } from './serialization.js';

export class Oauth2AuthorizationServerMetadata {
  authorizationEndpoint?: string;
  issuer?: string;
  tokenEndpoint?: string;
  responseTypes?: string[];
  tokenEndpointAuthMethods?: string[];

  constructor(init?: Partial<Oauth2AuthorizationServerMetadata>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.authorizationEndpoint !== undefined && this.authorizationEndpoint !== null) result['authorization_endpoint'] = toWire(this.authorizationEndpoint);
    if (this.issuer !== undefined && this.issuer !== null) result['issuer'] = toWire(this.issuer);
    if (this.tokenEndpoint !== undefined && this.tokenEndpoint !== null) result['token_endpoint'] = toWire(this.tokenEndpoint);
    if (this.responseTypes !== undefined && this.responseTypes !== null) result['response_types'] = toWire(this.responseTypes);
    if (this.tokenEndpointAuthMethods !== undefined && this.tokenEndpointAuthMethods !== null) result['token_endpoint_auth_methods'] = toWire(this.tokenEndpointAuthMethods);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): Oauth2AuthorizationServerMetadata {
    const model = new Oauth2AuthorizationServerMetadata();
    if (dict) {
      if (dict['authorization_endpoint'] !== undefined) model.authorizationEndpoint = dict['authorization_endpoint'] as any;
      if (dict['issuer'] !== undefined) model.issuer = dict['issuer'] as any;
      if (dict['token_endpoint'] !== undefined) model.tokenEndpoint = dict['token_endpoint'] as any;
      if (dict['response_types'] !== undefined) model.responseTypes = dict['response_types'] as any;
      if (dict['token_endpoint_auth_methods'] !== undefined) model.tokenEndpointAuthMethods = dict['token_endpoint_auth_methods'] as any;
    }
    return model;
  }
}
