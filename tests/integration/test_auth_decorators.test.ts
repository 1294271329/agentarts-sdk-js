/**
 * Auth decorator tests (ALLOW_CREATE tier).
 *
 * Ported 1:1 from `tests/integration/test_auth_decorators.py`.
 *
 * Exercises the real `requireApiKey` / `requireStsToken` factories end-to-end
 * against a workload identity + credential providers. The factories' local-auth
 * bootstrap persists `.agent_identity.json`; this file chdirs into a temp dir so
 * the repository is never polluted, and a pre-seeded `Config` makes the
 * bootstrap reuse the run's workload identity (no extra create).
 *
 * Node port note: factories append the injected value as the *last positional*
 * argument (TypeScript has no keyword injection), so the handlers below declare
 * the injected parameter last.
 *
 * The OAuth2 `requireAccessToken` flow is a 3-legged interactive round trip and
 * is intentionally skipped here (covered by unit tests for wiring; e2e 3LO is a
 * manual exercise).
 */

import { afterAll, beforeAll, describe, it, expect } from 'vitest';

import { requireApiKey, requireStsToken } from 'agentarts-sdk';
import { Config } from 'agentarts-sdk/sdk/identity';

import {
  allowCreate,
  getIdentityClient,
  hasCloudCredentials,
  identityCleanup,
  makeTempDir,
  removeTempDir,
  resourceName,
  resourceRegistry,
  stsAgencyUrn,
} from './_helpers.js';

const DUMMY_API_KEY = 'aa-it-dummy-api-key-0123456789abcdef';
const STS_AGENCY_URN = stsAgencyUrn();

const describeCloud = hasCloudCredentials() && allowCreate() ? describe : describe.skip;

describe('auth decorators (integration)', () => {
  it.skip('requireAccessToken (OAuth2 3LO) is interactive — run manually', () => {
    // Python: pytest.skip("require_access_token (OAuth2 3LO) is interactive; ...")
  });

  describeCloud('requireApiKey / requireStsToken (ALLOW_CREATE tier)', () => {
    let originalCwd: string = process.cwd();
    let tempDir: string | null = null;
    let workloadIdentityName: string;
    let apiKeyProviderName: string;
    let stsProviderName: string | null = null;

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

      if (STS_AGENCY_URN) {
        stsProviderName = resourceName('cp-sts');
        await identity.createStsCredentialProvider(stsProviderName, STS_AGENCY_URN);
        resourceRegistry.register(
          () => cleanup.credentialProvider('sts', stsProviderName as string),
          `credential_provider:sts:${stsProviderName}`,
        );
      }

      // Isolate `.agent_identity.json` in a temp CWD and pre-seed it so the
      // decorator reuses the run's workload identity (no extra create).
      tempDir = await makeTempDir('aa-it-auth-');
      originalCwd = process.cwd();
      process.chdir(tempDir);
      new Config({ workloadIdentityName, userId: 'aa-it-auth' }).save();
    });

    afterAll(async () => {
      process.chdir(originalCwd);
      if (tempDir) {
        await removeTempDir(tempDir);
        tempDir = null;
      }
      await resourceRegistry.cleanupAll();
    });

    it('requireApiKey injects an API key', async () => {
      const captured: { apiKey?: string } = {};

      const handler = requireApiKey({ providerName: apiKeyProviderName })(
        (payload: any, apiKey?: string) => {
          captured.apiKey = apiKey;
          return { ok: true };
        },
      );

      const result = await handler({ x: 1 });
      expect(result).toEqual({ ok: true });
      expect(typeof captured.apiKey).toBe('string');
      expect(captured.apiKey).toBeTruthy();
    });

    it.skipIf(!STS_AGENCY_URN)('requireStsToken injects STS credentials', async () => {
      const handler = requireStsToken({
        providerName: stsProviderName as string,
        agencySessionName: 'aa-it-session',
      })((stsCredentials?: Record<string, any>) => stsCredentials);

      const credentials = await handler();
      expect(credentials).not.toBeNull();
      expect(credentials?.['accessKeyId']).toBeTruthy();
      expect(credentials?.['secretAccessKey']).toBeTruthy();
    });
  });
});
