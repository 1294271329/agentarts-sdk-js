/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { AuthorizerConfiguration } from './authorizer-configuration.js';
import { Tag } from './tag.js';
import { toWire } from './serialization.js';

export class UpdateWorkloadIdentityReqBody {
  allowedResourceOauth2ReturnUrls?: string[];
  authorizerConfiguration?: AuthorizerConfiguration;
  tags?: Tag[];

  constructor(init?: Partial<UpdateWorkloadIdentityReqBody>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.allowedResourceOauth2ReturnUrls !== undefined && this.allowedResourceOauth2ReturnUrls !== null) result['allowed_resource_oauth2_return_urls'] = toWire(this.allowedResourceOauth2ReturnUrls);
    if (this.authorizerConfiguration !== undefined && this.authorizerConfiguration !== null) result['authorizer_configuration'] = toWire(this.authorizerConfiguration);
    if (this.tags !== undefined && this.tags !== null) result['tags'] = toWire(this.tags);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): UpdateWorkloadIdentityReqBody {
    const model = new UpdateWorkloadIdentityReqBody();
    if (dict) {
      if (dict['allowed_resource_oauth2_return_urls'] !== undefined) model.allowedResourceOauth2ReturnUrls = dict['allowed_resource_oauth2_return_urls'] as any;
      if (dict['authorizer_configuration'] !== undefined && dict['authorizer_configuration'] !== null) model.authorizerConfiguration = AuthorizerConfiguration.fromDict(dict['authorizer_configuration']);
      if (dict['tags'] !== undefined && dict['tags'] !== null) model.tags = (dict['tags'] as any[]).map((item) => Tag.fromDict(item)) as any;
    }
    return model;
  }
}
