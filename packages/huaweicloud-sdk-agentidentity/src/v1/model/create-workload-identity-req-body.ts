/* eslint-disable */
// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).
import { AuthorizerConfiguration } from './authorizer-configuration.js';
import { Tag } from './tag.js';
import { AuthorizerType } from './authorizer-type.js';
import { toWire } from './serialization.js';

export class CreateWorkloadIdentityReqBody {
  name?: string;
  allowedResourceOauth2ReturnUrls?: string[];
  authorizerType?: AuthorizerType;
  authorizerConfiguration?: AuthorizerConfiguration;
  tags?: Tag[];

  constructor(init?: Partial<CreateWorkloadIdentityReqBody>) {
    Object.assign(this, init ?? {});
  }

  /** Serialize to the wire format used by the Huawei Cloud API. */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    if (this.name !== undefined && this.name !== null) result['name'] = toWire(this.name);
    if (this.allowedResourceOauth2ReturnUrls !== undefined && this.allowedResourceOauth2ReturnUrls !== null) result['allowed_resource_oauth2_return_urls'] = toWire(this.allowedResourceOauth2ReturnUrls);
    if (this.authorizerType !== undefined && this.authorizerType !== null) result['authorizer_type'] = toWire(this.authorizerType);
    if (this.authorizerConfiguration !== undefined && this.authorizerConfiguration !== null) result['authorizer_configuration'] = toWire(this.authorizerConfiguration);
    if (this.tags !== undefined && this.tags !== null) result['tags'] = toWire(this.tags);
    return result;
  }

  static fromDict(dict?: Record<string, any> | null): CreateWorkloadIdentityReqBody {
    const model = new CreateWorkloadIdentityReqBody();
    if (dict) {
      if (dict['name'] !== undefined) model.name = dict['name'] as any;
      if (dict['allowed_resource_oauth2_return_urls'] !== undefined) model.allowedResourceOauth2ReturnUrls = dict['allowed_resource_oauth2_return_urls'] as any;
      if (dict['authorizer_type'] !== undefined) model.authorizerType = dict['authorizer_type'] as any;
      if (dict['authorizer_configuration'] !== undefined && dict['authorizer_configuration'] !== null) model.authorizerConfiguration = AuthorizerConfiguration.fromDict(dict['authorizer_configuration']);
      if (dict['tags'] !== undefined && dict['tags'] !== null) model.tags = (dict['tags'] as any[]).map((item) => Tag.fromDict(item)) as any;
    }
    return model;
  }
}
