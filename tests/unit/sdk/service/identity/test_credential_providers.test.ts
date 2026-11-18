/**
 * Unit tests for Agent Identity credential providers.
 *
 * Ported 1:1 from `tests/unit/sdk/service/identity/test_credential_providers.py`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CreateApiKeyCredentialProviderRequest,
  CreateOauth2CredentialProviderRequest,
  GetApiKeyCredentialProviderRequest,
  GetOauth2CredentialProviderRequest,
  GetStsCredentialProviderRequest,
  ListApiKeyCredentialProvidersRequest,
  ListOauth2CredentialProvidersRequest,
  ListStsCredentialProvidersRequest,
  Oauth2Discovery,
  Tag,
} from 'huaweicloud-sdk-agentidentity';

import { OAuth2Vendor } from 'agentarts-sdk/sdk/identity/types';
import { IdentityClient } from 'agentarts-sdk/sdk/service/identity/identity-client';

const REGION = 'ap-southeast-4';

function createMockSdkClient(): any {
  return {};
}

function createIdentityClient(mockSdkClient: any): IdentityClient {
  return new IdentityClient(REGION, undefined, mockSdkClient);
}

beforeEach(() => {
  vi.stubEnv('HUAWEICLOUD_SDK_AK', 'test-ak');
  vi.stubEnv('HUAWEICLOUD_SDK_SK', 'test-sk');
  vi.stubEnv('HUAWEICLOUD_SDK_PROJECT_ID', 'test-project');
  vi.stubEnv('HUAWEICLOUD_SDK_REGION', REGION);
  vi.stubEnv('HUAWEICLOUD_SDK_DOMAIN_ID', 'test-domain');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('IdentityClient credential providers', () => {
  it('createApiKeyCredentialProvider sends the name and the api key', async () => {
    // GIVEN
    const mockSdkClient = createMockSdkClient();
    const mockProvider = { name: 'test-provider' };
    mockSdkClient.createApiKeyCredentialProvider = vi.fn(async () => ({
      credentialProvider: mockProvider,
    }));
    const identityClient = createIdentityClient(mockSdkClient);
    const name = 'test-provider';
    const apiKey = 'test-api-key';

    // WHEN
    const result = await identityClient.createApiKeyCredentialProvider(name, apiKey);

    // THEN
    expect(result).toBe(mockProvider);
    expect(mockSdkClient.createApiKeyCredentialProvider).toHaveBeenCalledTimes(1);
    const request = mockSdkClient.createApiKeyCredentialProvider.mock
      .calls[0]![0] as CreateApiKeyCredentialProviderRequest;
    expect(request.body?.name).toBe(name);
    expect(request.body?.apiKey).toBe(apiKey);
  });

  it('createOauth2CredentialProvider configures Google', async () => {
    // GIVEN
    const mockSdkClient = createMockSdkClient();
    const mockProvider = { name: 'google-provider' };
    mockSdkClient.createOauth2CredentialProvider = vi.fn(async () => ({
      credentialProvider: mockProvider,
    }));
    const identityClient = createIdentityClient(mockSdkClient);
    const name = 'google-provider';
    const vendor = OAuth2Vendor.GOOGLEOAUTH2;
    const clientId = 'test-client-id';
    const clientSecret = 'test-client-secret';

    // WHEN
    const result = await identityClient.createOauth2CredentialProvider(
      name,
      vendor,
      clientId,
      clientSecret,
    );

    // THEN
    expect(result).toBe(mockProvider);
    expect(mockSdkClient.createOauth2CredentialProvider).toHaveBeenCalledTimes(1);
    const request = mockSdkClient.createOauth2CredentialProvider.mock
      .calls[0]![0] as CreateOauth2CredentialProviderRequest;
    expect(request.body?.name).toBe(name);
    expect(request.body?.credentialProviderVendor).toBe(vendor);
    expect(request.body?.oauth2ProviderConfigInput?.googleOauth2ProviderConfig?.clientId).toBe(
      clientId,
    );
    expect(request.body?.oauth2ProviderConfigInput?.googleOauth2ProviderConfig?.clientSecret).toBe(
      clientSecret,
    );
  });

  it('createOauth2CredentialProvider forwards the tags', async () => {
    // GIVEN
    const mockSdkClient = createMockSdkClient();
    const mockProvider = { name: 'google-provider-with-tags' };
    mockSdkClient.createOauth2CredentialProvider = vi.fn(async () => ({
      credentialProvider: mockProvider,
    }));
    const identityClient = createIdentityClient(mockSdkClient);
    const name = 'google-provider-with-tags';
    const vendor = OAuth2Vendor.GOOGLEOAUTH2;
    const clientId = 'test-client-id';
    const clientSecret = 'test-client-secret';
    const tags = [new Tag({ key: 'env', value: 'production' }), new Tag({ key: 'team', value: 'platform' })];

    // WHEN
    const result = await identityClient.createOauth2CredentialProvider(
      name,
      vendor,
      clientId,
      clientSecret,
      undefined,
      undefined,
      tags,
    );

    // THEN
    expect(result).toBe(mockProvider);
    expect(mockSdkClient.createOauth2CredentialProvider).toHaveBeenCalledTimes(1);
    const request = mockSdkClient.createOauth2CredentialProvider.mock
      .calls[0]![0] as CreateOauth2CredentialProviderRequest;
    expect(request.body?.name).toBe(name);
    expect(request.body?.credentialProviderVendor).toBe(vendor);
    expect(request.body?.tags).toBe(tags);
  });

  it('createOauth2CredentialProvider configures Microsoft', async () => {
    // GIVEN
    const mockSdkClient = createMockSdkClient();
    const mockProvider = { name: 'ms-provider' };
    mockSdkClient.createOauth2CredentialProvider = vi.fn(async () => ({
      credentialProvider: mockProvider,
    }));
    const identityClient = createIdentityClient(mockSdkClient);
    const name = 'ms-provider';
    const vendor = OAuth2Vendor.MICROSOFTOAUTH2;
    const clientId = 'test-client-id';
    const clientSecret = 'test-client-secret';
    const tenantId = 'test-tenant-id';

    // WHEN
    const result = await identityClient.createOauth2CredentialProvider(
      name,
      vendor,
      clientId,
      clientSecret,
      tenantId,
    );

    // THEN
    expect(result).toBe(mockProvider);
    expect(mockSdkClient.createOauth2CredentialProvider).toHaveBeenCalledTimes(1);
    const request = mockSdkClient.createOauth2CredentialProvider.mock
      .calls[0]![0] as CreateOauth2CredentialProviderRequest;
    const config = request.body?.oauth2ProviderConfigInput?.microsoftOauth2ProviderConfig;
    expect(request.body?.name).toBe(name);
    expect(request.body?.credentialProviderVendor).toBe(vendor);
    expect(config?.tenantId).toBe(tenantId);
    expect(config?.clientId).toBe(clientId);
    expect(config?.clientSecret).toBe(clientSecret);
  });

  it('createOauth2CredentialProvider configures a custom provider discovery', async () => {
    // GIVEN
    const mockSdkClient = createMockSdkClient();
    const mockProvider = { name: 'custom-provider' };
    mockSdkClient.createOauth2CredentialProvider = vi.fn(async () => ({
      credentialProvider: mockProvider,
    }));
    const identityClient = createIdentityClient(mockSdkClient);
    const name = 'custom-provider';
    const vendor = OAuth2Vendor.CUSTOMOAUTH2;
    const clientId = 'test-client-id';
    const clientSecret = 'test-client-secret';
    const discovery = new Oauth2Discovery({
      discoveryUrl: 'https://example.com/.well-known/openid-configuration',
    });

    // WHEN
    const result = await identityClient.createOauth2CredentialProvider(
      name,
      vendor,
      clientId,
      clientSecret,
      undefined,
      discovery,
    );

    // THEN
    expect(result).toBe(mockProvider);
    expect(mockSdkClient.createOauth2CredentialProvider).toHaveBeenCalledTimes(1);
    const request = mockSdkClient.createOauth2CredentialProvider.mock
      .calls[0]![0] as CreateOauth2CredentialProviderRequest;
    const config = request.body?.oauth2ProviderConfigInput?.customOauth2ProviderConfig;
    expect(request.body?.name).toBe(name);
    expect(request.body?.credentialProviderVendor).toBe(vendor);
    expect(config?.oauth2Discovery).toBe(discovery);
    expect(config?.clientId).toBe(clientId);
  });

  it('getApiKeyCredentialProvider returns the provider', async () => {
    const mockSdkClient = createMockSdkClient();
    const mockProvider = { name: 'test-provider' };
    mockSdkClient.getApiKeyCredentialProvider = vi.fn(async () => ({
      credentialProvider: mockProvider,
    }));
    const identityClient = createIdentityClient(mockSdkClient);

    const result = await identityClient.getApiKeyCredentialProvider('test-provider');

    expect(result).toBe(mockProvider);
    expect(mockSdkClient.getApiKeyCredentialProvider).toHaveBeenCalledTimes(1);
    const request = mockSdkClient.getApiKeyCredentialProvider.mock
      .calls[0]![0] as GetApiKeyCredentialProviderRequest;
    expect(request.credentialProviderName).toBe('test-provider');
  });

  it('listApiKeyCredentialProviders returns the providers and forwards the pagination', async () => {
    const mockSdkClient = createMockSdkClient();
    const mockProvider = { name: 'test-provider' };
    mockSdkClient.listApiKeyCredentialProviders = vi.fn(async () => ({
      credentialProviders: [mockProvider],
    }));
    const identityClient = createIdentityClient(mockSdkClient);

    const result = await identityClient.listApiKeyCredentialProviders(10, 'token');

    expect(result).toEqual([mockProvider]);
    expect(mockSdkClient.listApiKeyCredentialProviders).toHaveBeenCalledTimes(1);
    const request = mockSdkClient.listApiKeyCredentialProviders.mock
      .calls[0]![0] as ListApiKeyCredentialProvidersRequest;
    expect(request.limit).toBe(10);
    expect(request.marker).toBe('token');
  });

  it('getOauth2CredentialProvider returns the provider', async () => {
    const mockSdkClient = createMockSdkClient();
    const mockProvider = { name: 'test-provider' };
    mockSdkClient.getOauth2CredentialProvider = vi.fn(async () => ({
      credentialProvider: mockProvider,
    }));
    const identityClient = createIdentityClient(mockSdkClient);

    const result = await identityClient.getOauth2CredentialProvider('test-provider');

    expect(result).toBe(mockProvider);
    expect(mockSdkClient.getOauth2CredentialProvider).toHaveBeenCalledTimes(1);
    const request = mockSdkClient.getOauth2CredentialProvider.mock
      .calls[0]![0] as GetOauth2CredentialProviderRequest;
    expect(request.credentialProviderName).toBe('test-provider');
  });

  it('listOauth2CredentialProviders returns the providers', async () => {
    const mockSdkClient = createMockSdkClient();
    const mockProvider = { name: 'test-provider' };
    mockSdkClient.listOauth2CredentialProviders = vi.fn(async () => ({
      credentialProviders: [mockProvider],
    }));
    const identityClient = createIdentityClient(mockSdkClient);

    const result = await identityClient.listOauth2CredentialProviders();

    expect(result).toEqual([mockProvider]);
    expect(mockSdkClient.listOauth2CredentialProviders).toHaveBeenCalledTimes(1);
    const request = mockSdkClient.listOauth2CredentialProviders.mock
      .calls[0]![0] as ListOauth2CredentialProvidersRequest;
    expect(request.limit).toBeUndefined();
    expect(request.marker).toBeUndefined();
  });

  it('getStsCredentialProvider returns the provider', async () => {
    const mockSdkClient = createMockSdkClient();
    const mockProvider = { name: 'test-provider' };
    mockSdkClient.getStsCredentialProvider = vi.fn(async () => ({
      credentialProvider: mockProvider,
    }));
    const identityClient = createIdentityClient(mockSdkClient);

    const result = await identityClient.getStsCredentialProvider('test-provider');

    expect(result).toBe(mockProvider);
    expect(mockSdkClient.getStsCredentialProvider).toHaveBeenCalledTimes(1);
    const request = mockSdkClient.getStsCredentialProvider.mock
      .calls[0]![0] as GetStsCredentialProviderRequest;
    expect(request.credentialProviderName).toBe('test-provider');
  });

  it('listStsCredentialProviders returns the providers', async () => {
    const mockSdkClient = createMockSdkClient();
    const mockProvider = { name: 'test-provider' };
    mockSdkClient.listStsCredentialProviders = vi.fn(async () => ({
      credentialProviders: [mockProvider],
    }));
    const identityClient = createIdentityClient(mockSdkClient);

    const result = await identityClient.listStsCredentialProviders();

    expect(result).toEqual([mockProvider]);
    expect(mockSdkClient.listStsCredentialProviders).toHaveBeenCalledTimes(1);
    const request = mockSdkClient.listStsCredentialProviders.mock
      .calls[0]![0] as ListStsCredentialProvidersRequest;
    expect(request.limit).toBeUndefined();
    expect(request.marker).toBeUndefined();
  });
});
