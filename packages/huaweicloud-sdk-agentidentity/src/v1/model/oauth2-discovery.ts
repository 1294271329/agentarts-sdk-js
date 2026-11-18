/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { Oauth2AuthorizationServerMetadata } from './oauth2-authorization-server-metadata.js';
import { toWire } from './serialization.js';

export class Oauth2Discovery {
  discoveryUrl?: string;
  authorizationServerMetadata?: Oauth2AuthorizationServerMetadata;

  constructor(init?: Partial<Oauth2Discovery>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.discoveryUrl !== undefined && this.discoveryUrl !== null) result['discovery_url'] = toWire(this.discoveryUrl);
    if (this.authorizationServerMetadata !== undefined && this.authorizationServerMetadata !== null) result['authorization_server_metadata'] = toWire(this.authorizationServerMetadata);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): Oauth2Discovery {
    const model = new Oauth2Discovery();
    if (dict) {
      if (dict['discovery_url'] !== undefined) model.discoveryUrl = dict['discovery_url'] as any;
      if (dict['authorization_server_metadata'] !== undefined && dict['authorization_server_metadata'] !== null) model.authorizationServerMetadata = Oauth2AuthorizationServerMetadata.fromDict(dict['authorization_server_metadata']);
    }
    return model;
  }
}
