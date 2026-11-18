export {
  requireAccessToken,
  requireApiKey,
  requireStsToken,
  getWorkloadAccessToken,
  setUpLocalAuth,
} from './auth.js';
export type {
  RequireAccessTokenOptions,
  RequireApiKeyOptions,
  RequireStsTokenOptions,
} from './auth.js';
export { Config } from './config.js';
export { OAuth2Vendor } from './types.js';
export type { StsCredentials, OAuth2Discovery } from './types.js';
export { IdentityClient } from '../service/identity/identity-client.js';
export type {
  GetResourceApiKeyOptions,
  GetResourceOauth2TokenOptions,
  GetResourceStsTokenOptions,
} from '../service/identity/identity-client.js';
export {
  DefaultApiTokenPoller,
  PollingResult,
  PollingStatus,
  PollingTimeoutError,
  TokenPoller,
} from '../service/identity/polling/token-poller.js';
