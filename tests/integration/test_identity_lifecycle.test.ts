/**
 * Identity lifecycle tests (ALLOW_CREATE tier).
 *
 * Ported 1:1 from `tests/integration/test_identity_lifecycle.py`.
 *
 * Creates a workload identity + an API-key credential provider, exercises
 * get/list/update and ephemeral token issuance (`createWorkloadAccessToken`,
 * `getResourceApiKey`), then tears everything down via the raw
 * `AgentIdentityClient.delete*` methods (the high-level wrapper has no delete).
 *
 * OAuth2 / STS credential-provider flows need external inputs (vendor creds,
 * agency URN) and are conditionally skipped otherwise.
 */

import { afterAll, beforeAll, describe, it, expect } from 'vitest';

import { OAuth2Vendor } from 'agentarts-sdk';

import {
  allowCreate,
  hasCloudCredentials,
  identityCleanup,
  oauth2ProviderInputs,
  resourceName,
  resourceRegistry,
  stsAgencyUrn,
  getIdentityClient,
} from './_helpers.js';

const describeLifecycle = hasCloudCredentials() && allowCreate() ? describe : describe.skip;

const DUMMY_API_KEY = 'aa-it-dummy-api-key-0123456789abcdef';
const OAUTH2_INPUTS = oauth2ProviderInputs();
const STS_AGENCY_URN = stsAgencyUrn();

describeLifecycle('identity lifecycle (ALLOW_CREATE tier)', () => {
  let workloadIdentityName: string;
  let apiKeyProviderName: string;

  beforeAll(async () => {
    const identity = getIdentityClient();
    const cleanup = identityCleanup(identity);

    workloadIdentityName = resourceName('wi');
    await identity.createWorkloadIdentity(workloadIdentityName);
    resourceRegistry.register(
      () => cleanup.workloadIdentity(workloadIdentityName),
      `workload_identity:${workloadIdentityName}`,
    );

    apiKeyProviderName = resourceName('cp-ak');
    await identity.createApiKeyCredentialProvider(apiKeyProviderName, DUMMY_API_KEY);
    resourceRegistry.register(
      () => cleanup.credentialProvider('api_key', apiKeyProviderName),
      `credential_provider:api_key:${apiKeyProviderName}`,
    );
  });

  afterAll(async () => {
    await resourceRegistry.cleanupAll();
  });

  // -------------------------------------------------------------------------
  // Workload identity
  // -------------------------------------------------------------------------

  it('getWorkloadIdentity returns the created identity', async () => {
    const workloadIdentity = await getIdentityClient().getWorkloadIdentity(workloadIdentityName);
    expect(workloadIdentity).not.toBeNull();
    expect(workloadIdentity.name).toBe(workloadIdentityName);
  });

  it('updateWorkloadIdentity updates the allowed OAuth2 return URLs', async () => {
    const workloadIdentity = await getIdentityClient().updateWorkloadIdentity(
      workloadIdentityName,
      ['https://example.com/callback'],
    );
    expect(workloadIdentity).not.toBeNull();
  });

  it('listWorkloadIdentities contains the created identity', async () => {
    // limit=200 keeps it a single cheap call while covering the common case.
    const items = await getIdentityClient().listWorkloadIdentities(200);
    const names = items.map((item) => item.name);
    expect(names).toContain(workloadIdentityName);
  });

  // -------------------------------------------------------------------------
  // API-key credential provider
  // -------------------------------------------------------------------------

  it('getApiKeyCredentialProvider returns the created provider', async () => {
    const provider = await getIdentityClient().getApiKeyCredentialProvider(apiKeyProviderName);
    expect(provider).not.toBeNull();
    expect(provider.name).toBe(apiKeyProviderName);
  });

  it('listApiKeyCredentialProviders contains the created provider', async () => {
    const items = await getIdentityClient().listApiKeyCredentialProviders(200);
    const names = items.map((item) => item.name);
    expect(names).toContain(apiKeyProviderName);
  });

  // -------------------------------------------------------------------------
  // Ephemeral token issuance (no persistent resource)
  // -------------------------------------------------------------------------

  it('createWorkloadAccessToken returns a token', async () => {
    const token = await getIdentityClient().createWorkloadAccessToken(
      workloadIdentityName,
      undefined,
      'aa-it-token-user',
    );
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
  });

  it('getResourceApiKey returns the provider API key', async () => {
    const identity = getIdentityClient();
    const accessToken = await identity.createWorkloadAccessToken(
      workloadIdentityName,
      undefined,
      'aa-it-token-user',
    );
    const apiKey = await identity.getResourceApiKey({
      providerName: apiKeyProviderName,
      workloadAccessToken: accessToken,
    });
    expect(typeof apiKey).toBe('string');
    expect(apiKey.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // Conditionally-skipped OAuth2 / STS provider flows
  // -------------------------------------------------------------------------

  it.skipIf(!OAUTH2_INPUTS)('create and delete oauth2 credential provider', async () => {
    const identity = getIdentityClient();
    const cleanup = identityCleanup(identity);
    const inputs = OAUTH2_INPUTS as { clientId: string; clientSecret: string; vendor: string };
    const name = resourceName('cp-oa');

    await identity.createOauth2CredentialProvider(
      name,
      (OAuth2Vendor as unknown as Record<string, OAuth2Vendor>)[inputs.vendor],
      inputs.clientId,
      inputs.clientSecret,
    );
    resourceRegistry.register(
      () => cleanup.credentialProvider('oauth2', name),
      `credential_provider:oauth2:${name}`,
    );

    const provider = await identity.getOauth2CredentialProvider(name);
    expect(provider.name).toBe(name);
  });

  it.skipIf(!STS_AGENCY_URN)('create and delete sts credential provider', async () => {
    const identity = getIdentityClient();
    const cleanup = identityCleanup(identity);
    const name = resourceName('cp-sts');

    await identity.createStsCredentialProvider(name, STS_AGENCY_URN as string);
    resourceRegistry.register(
      () => cleanup.credentialProvider('sts', name),
      `credential_provider:sts:${name}`,
    );

    const provider = await identity.getStsCredentialProvider(name);
    expect(provider.name).toBe(name);
  });
});
