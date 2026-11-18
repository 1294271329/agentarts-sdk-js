/**
 * Real-backend E2E: V11 upload signature authenticates against the live
 * data-plane gateway.
 *
 * Ported 1:1 from `tests/integration/test_v11_upload_signature_real.py`.
 *
 * Auto-discovers a deployed IAM (V11-accepting) agent with file transfer enabled
 * from the cloud control plane, then drives a V11-signed `upload-files` request
 * at its real data-plane gateway and asserts the signature authenticates
 * (non-401). This is the end-to-end proof for the root-cause fix:
 *
 * - Before the fix: the V11 signer signed the query string, but the data-plane
 *   gateway does not -> upload returned HTTP 401 "Authentication failed!" (while
 *   invoke, which carries no query, succeeded).
 * - After the fix: the signer signs an empty canonical query line; upload now
 *   authenticates (the gateway returns a non-401 such as 404 "Session not found"
 *   for the probe's fake session, proving auth passed and the request reached
 *   the agent backend).
 *
 * The probe is **non-mutating**: it uploads to a throwaway session id that the
 * backend rejects with 404 before any file is written. Gated by real AK/SK
 * (`hasCloudCredentials()`); no billable resources are created.
 */

import { beforeAll, describe, it, expect, vi } from 'vitest';

import { RuntimeClient } from 'agentarts-sdk/sdk/service/runtime-client';
import type { RequestResult } from 'agentarts-sdk/sdk/service/http-client';
import { SignMode } from 'agentarts-sdk/sdk/service/http-client';
import { SESSION_HEADER } from 'agentarts-sdk/sdk/runtime/model';
import { V11Signer } from 'agentarts-sdk/sdk/utils/signer-v11';
import { getControlPlaneEndpoint } from 'agentarts-sdk/sdk/utils/constant';
import { createCredential } from 'agentarts-sdk/sdk/utils/metadata';

import { cloudRegion, hasCloudCredentials } from './_helpers.js';

const describeIntegration = hasCloudCredentials() ? describe : describe.skip;

const FAKE_SESSION = 'aa-it-sigprobe-session';
const PROBE_PARAMS = {
  path: '/home/user/aa-it-sigprobe.txt',
  user_id: 1000,
  file_mode: '0644',
};

/** The credential fields the V11 signer reads. */
interface CredentialLike {
  ak?: string;
  sk?: string;
  securityToken?: string;
}

interface DiscoveredAgent {
  name: string;
  base: string;
  cred: CredentialLike;
}

interface V11SignerInternals {
  _canonicalUri(path: string): string;
  _canonicalQueryString(queryParams?: Record<string, any> | null): string;
  _canonicalHeaders(headers: Record<string, string>, signedHeaders: string[]): string;
  _signedHeaders(headers: Record<string, string>): string[];
  _getTimestamp(): string;
  _getStringToSign(canonicalRequest: string, timeStr: string): string;
  _getRealUseSecret(): string;
  _signStringToSign(realUseSecret: string, stringToSign: string): string;
  _getAuthHeaderValue(signedHeaders: string[], signature: string): string;
}

function internals(signer: V11Signer): V11SignerInternals {
  return signer as unknown as V11SignerInternals;
}

function httpsify(endpoint: string): string {
  return endpoint.startsWith('http://') || endpoint.startsWith('https://')
    ? endpoint
    : `https://${endpoint}`;
}

/** Build a V11-signed data-plane client for `baseUrl`. */
function v11Client(baseUrl: string, credential: CredentialLike): RuntimeClient {
  const client = new RuntimeClient({
    dataEndpoint: baseUrl,
    verifySsl: true,
    signMode: SignMode.V11_HMAC_SHA256,
    regionId: cloudRegion(),
  });
  (client as unknown as { _dataClient: { _credentials: unknown } })._dataClient._credentials =
    credential;
  return client;
}

/** Send a V11-signed upload (fake session) and return the RequestResult. */
function uploadProbe(client: RuntimeClient, agentName: string): Promise<RequestResult> {
  return client._data('POST', `/runtimes/${agentName}/upload-files`, {
    data: Buffer.from('aa-it-sigprobe', 'utf8'),
    headers: {
      [SESSION_HEADER]: FAKE_SESSION,
      'Content-Type': 'application/octet-stream',
    },
    params: PROBE_PARAMS,
    timeout: 60,
  });
}

describeIntegration('V11 upload signature (real backend)', () => {
  let discovered: DiscoveredAgent | null = null;

  beforeAll(async () => {
    const credential = (await createCredential()) as CredentialLike;
    const region = cloudRegion();
    const control = new RuntimeClient({
      controlEndpoint: getControlPlaneEndpoint(region),
      verifySsl: true,
    });

    const agents = await control.getAgents({ limit: 100 });
    for (const agent of agents) {
      const name = typeof agent['name'] === 'string' ? agent['name'] : '';
      const agentId = agent['id'];
      if (!name || agentId === undefined) {
        continue;
      }

      let detail: Record<string, any> | null;
      try {
        detail = await control.findAgentById(String(agentId));
      } catch {
        continue;
      }
      if (!detail) {
        continue;
      }

      const invokeConfig =
        ((detail['version_detail'] as Record<string, any> | undefined) ?? {})['invoke_config'] ??
        {};
      const fileTransferConfig = (invokeConfig['file_transfer_config'] ?? {}) as Record<
        string,
        any
      >;
      if (!fileTransferConfig['enabled']) {
        continue;
      }
      const accessEndpoint = invokeConfig['access_endpoint'];
      if (!accessEndpoint) {
        continue;
      }

      const base = httpsify(String(accessEndpoint));
      const result = await uploadProbe(v11Client(base, credential), name);
      // non-401 -> the gateway authenticated the V11 signature (e.g. 404
      // "Session not found"); 401 -> this gateway does not accept V11.
      if (result.statusCode !== 401) {
        discovered = { name, base, cred: credential };
        return;
      }
    }
  });

  it('fixed signer: upload authenticates against the real gateway', async (ctx) => {
    if (!discovered) {
      ctx.skip(
        'No deployed IAM (V11-accepting) agent with file transfer enabled was found in ' +
          'the workspace; deploy one to exercise this E2E test',
      );
      return;
    }
    const result = await uploadProbe(
      v11Client(discovered.base, discovered.cred),
      discovered.name,
    );
    expect(result.statusCode, result.error ?? '').not.toBe(401);
  });

  it('wrong signing secret is rejected (control)', async (ctx) => {
    if (!discovered) {
      ctx.skip('no V11-accepting agent discovered');
      return;
    }
    // A corrupted signature is rejected with 401, proving the gateway actually
    // verifies signatures (so the passing result above is meaningful). Python
    // corrupts the Authorization header; Node's fetch may not forward a manual
    // `host` header, so the equivalent corruption happens at the signing secret.
    const corrupted: CredentialLike = {
      ak: discovered.cred.ak,
      sk: '0'.repeat(64),
      securityToken: discovered.cred.securityToken,
    };
    const result = await uploadProbe(v11Client(discovered.base, corrupted), discovered.name);
    expect(result.statusCode).toBe(401);
  });

  it('old behaviour (query signed) is rejected by the real gateway', async (ctx) => {
    if (!discovered) {
      ctx.skip('no V11-accepting agent discovered');
      return;
    }

    vi.spyOn(V11Signer.prototype, 'sign').mockImplementation(function (
      this: V11Signer,
      method: string,
      path: string,
      queryParams: Record<string, any> | null | undefined,
      headers: Record<string, string>,
    ): Record<string, string> {
      const signerInternals = internals(this);
      const timestamp = signerInternals._getTimestamp();
      headers['x-sdk-date'] = timestamp;
      const signedHeaders = signerInternals._signedHeaders(headers);
      const canonicalRequest = [
        method.toUpperCase(),
        signerInternals._canonicalUri(path),
        signerInternals._canonicalQueryString(queryParams),
        signerInternals._canonicalHeaders(headers, signedHeaders),
        signedHeaders.join(';'),
        'UNSIGNED-PAYLOAD',
      ].join('\n');
      const stringToSign = signerInternals._getStringToSign(canonicalRequest, timestamp);
      const secret = signerInternals._getRealUseSecret();
      const signature = signerInternals._signStringToSign(secret, stringToSign);
      headers['Authorization'] = signerInternals._getAuthHeaderValue(signedHeaders, signature);
      return headers;
    });

    const result = await uploadProbe(
      v11Client(discovered.base, discovered.cred),
      discovered.name,
    );
    expect(
      result.statusCode,
      `old (query-signed) behaviour unexpectedly accepted: ${result.statusCode} ${result.error ?? ''}`,
    ).toBe(401);
  });
});
