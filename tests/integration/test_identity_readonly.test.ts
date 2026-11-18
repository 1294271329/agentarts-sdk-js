/**
 * Read-only identity tests (default tier).
 *
 * Ported 1:1 from `tests/integration/test_identity_readonly.py`.
 *
 * Exercise the `IdentityClient` list/get surface and ephemeral token issuance
 * without creating any persistent cloud resource. Requires AK/SK; the optional
 * `AGENTARTS_TEST_WORKLOAD_IDENTITY_NAME` adds a get + workload-access-token
 * assertion against a pre-provisioned identity.
 */

import { describe, it, expect } from 'vitest';

import { getIdentityClient, hasCloudCredentials, preWorkloadIdentityName } from './_helpers.js';

const describeIntegration = hasCloudCredentials() ? describe : describe.skip;

const PRE_WORKLOAD_IDENTITY = preWorkloadIdentityName();

describeIntegration('identity read-only (default tier)', () => {
  it('listWorkloadIdentities returns a list', async () => {
    const items = await getIdentityClient().listWorkloadIdentities(1);
    expect(Array.isArray(items)).toBe(true);
  });

  it('listApiKeyCredentialProviders returns a list', async () => {
    const items = await getIdentityClient().listApiKeyCredentialProviders(1);
    expect(Array.isArray(items)).toBe(true);
  });

  it('listOauth2CredentialProviders returns a list', async () => {
    const items = await getIdentityClient().listOauth2CredentialProviders(1);
    expect(Array.isArray(items)).toBe(true);
  });

  it('listStsCredentialProviders returns a list', async () => {
    const items = await getIdentityClient().listStsCredentialProviders(1);
    expect(Array.isArray(items)).toBe(true);
  });

  it.skipIf(!PRE_WORKLOAD_IDENTITY)(
    'getWorkloadIdentity + createWorkloadAccessToken for a pre-provisioned identity',
    async () => {
      const name = PRE_WORKLOAD_IDENTITY as string;
      const workloadIdentity = await getIdentityClient().getWorkloadIdentity(name);
      expect(workloadIdentity).not.toBeNull();
      expect(workloadIdentity.name).toBe(name);

      const token = await getIdentityClient().createWorkloadAccessToken(
        name,
        undefined,
        'aa-it-reader',
      );
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);
    },
  );
});
