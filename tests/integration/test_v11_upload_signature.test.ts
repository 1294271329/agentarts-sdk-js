/**
 * V11 signature verification end-to-end (local mirror).
 *
 * Ported 1:1 from `tests/integration/test_v11_upload_signature.py`.
 *
 * Stands up a local HTTP server that implements the *verification* side of the
 * V11-HMAC-SHA256 signature — mirroring what the real data-plane gateway does —
 * and drives the real `RuntimeClient.uploadFiles` data-plane path against it
 * over a real socket (no cloud credentials required).
 *
 * Pins the root cause of the IAM upload 401:
 *
 * - The data-plane gateway does **not** include the query string in the V11
 *   canonical request (it may inject/rewrite query params en route). Signing
 *   the query therefore makes the gateway's recomputation diverge and fails
 *   verification for any request carrying query params (e.g. upload's
 *   `path=...`), while query-less requests (e.g. invoke) succeed.
 *
 * Cases (all against the local mirror verifier, which uses an empty canonical
 * query line just like the real gateway):
 * 1. Fixed signer (query not signed) + upload with query -> 200 (auth passes).
 * 2. Old behaviour (query signed, forced via a spy) + same upload -> 401
 *    (proves the fix is necessary).
 * 3. Wrong signing secret -> 401 (the verifier actually checks the signature).
 * 4. invoke (no query) -> 200 (the query fix does not regress invoke).
 *
 * The real-backend counterpart lives in `test_v11_upload_signature_real.test.ts`.
 */

import { timingSafeEqual } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';

import { describe, it, expect, vi } from 'vitest';

import { RuntimeClient } from 'agentarts-sdk/sdk/service/runtime-client';
import { SignMode } from 'agentarts-sdk/sdk/service/http-client';
import { V11Signer } from 'agentarts-sdk/sdk/utils/signer-v11';

import { findFreePort } from './_helpers.js';

const AK = 'AKTEST';
const SK = 'SKTEST';
const REGION = 'cn-southwest-2';

/** Private V11Signer internals used by the server-side verifier. */
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

/**
 * Server-side V11 verifier — mirrors the data-plane gateway: the canonical
 * request uses an *empty* query line (the query is not signed).
 */
class V11Verifier {
  lastSignedHeaders: string[] = [];

  verify(method: string, rawPath: string, headersLower: Record<string, string>): boolean {
    const authorization = headersLower['authorization'] ?? '';
    const signedHeadersMatch = /SignedHeaders=([^,]+)/.exec(authorization);
    const signatureMatch = /Signature=([0-9a-f]+)/.exec(authorization);
    if (!signedHeadersMatch || !signatureMatch) {
      return false;
    }
    const signedHeaders = signedHeadersMatch[1].split(';');
    const clientSignature = signatureMatch[1];
    this.lastSignedHeaders = signedHeaders;

    const timestamp = headersLower['x-sdk-date'] ?? '';
    const path = new URL(rawPath, 'http://localhost').pathname || '/';

    const signer = new V11Signer(AK, SK, REGION);
    const signerInternals = internals(signer);
    // Empty canonical query line — the gateway does not sign the query.
    const canonicalRequest = [
      method.toUpperCase(),
      signerInternals._canonicalUri(path),
      '',
      signerInternals._canonicalHeaders(headersLower, signedHeaders),
      signedHeaders.join(';'),
      'UNSIGNED-PAYLOAD',
    ].join('\n');
    const stringToSign = signerInternals._getStringToSign(canonicalRequest, timestamp);
    const realUseSecret = signerInternals._getRealUseSecret();
    const computed = signerInternals._signStringToSign(realUseSecret, stringToSign);

    const computedBytes = Buffer.from(computed, 'utf8');
    const clientBytes = Buffer.from(clientSignature, 'utf8');
    return (
      computedBytes.length === clientBytes.length && timingSafeEqual(computedBytes, clientBytes)
    );
  }
}

interface VerifierServer {
  port: number;
  verifier: V11Verifier;
  close(): Promise<void>;
}

/** Start the local verifier server on a free port. */
async function startVerifierServer(): Promise<VerifierServer> {
  const verifier = new V11Verifier();
  const port = await findFreePort();
  const server: Server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    request.on('end', () => {
      const headersLower = Object.fromEntries(
        Object.entries(request.headers).map(([key, value]) => [
          key.toLowerCase(),
          Array.isArray(value) ? value.join(',') : String(value ?? ''),
        ]),
      );
      const ok = verifier.verify(request.method ?? 'POST', request.url ?? '/', headersLower);
      const payload = Buffer.from(
        ok ? '{"status": "uploaded"}' : '{"error": "Authentication failed!"}',
      );
      response.writeHead(ok ? 200 : 401, {
        'content-type': 'application/json',
        'content-length': String(payload.length),
      });
      response.end(payload);
    });
  });
  server.listen(port, '127.0.0.1');
  await once(server, 'listening');
  return {
    port,
    verifier,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}

/** Run `fn` against a fresh verifier server, closing it afterwards. */
async function withVerifierServer(
  fn: (server: VerifierServer) => Promise<void>,
): Promise<void> {
  const server = await startVerifierServer();
  try {
    await fn(server);
  } finally {
    await server.close();
  }
}

/** Build a V11-signed client pointed at the local verifier port. */
function makeClient(port: number, secret: string = SK): RuntimeClient {
  const client = new RuntimeClient({
    dataEndpoint: `http://127.0.0.1:${port}`,
    verifySsl: false,
    signMode: SignMode.V11_HMAC_SHA256,
    regionId: REGION,
  });
  // Python sets `client._data_client._credentials = SimpleNamespace(ak, sk, ...)`;
  // the Node data client resolves credentials lazily, so seed them directly.
  (client as unknown as { _dataClient: { _credentials: unknown } })._dataClient._credentials = {
    ak: AK,
    sk: secret,
    securityToken: undefined,
  };
  return client;
}

const UPLOAD_FILES = [{ content: 'hello', filename: 'f.txt' }];

describe('V11 upload signature (local mirror verifier)', () => {
  it('fixed signer: upload with a query string verifies', async () => {
    await withVerifierServer(async ({ port }) => {
      const result = await makeClient(port).uploadFiles(
        'myagent',
        'sess-1',
        UPLOAD_FILES,
        { path: '/home/user/' },
      );
      expect(result['status']).toBe('uploaded');
    });
  });

  it('old behaviour (query signed) is rejected', async () => {
    // Simulate the OLD (buggy) behaviour: include the query in the canonical
    // request. Used to prove the fix is necessary.
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

    await withVerifierServer(async ({ port }) => {
      await expect(
        makeClient(port).uploadFiles('myagent', 'sess-1', UPLOAD_FILES, {
          path: '/home/user/',
        }),
      ).rejects.toThrow(/HTTP 401/);
    });
  });

  it('wrong signing secret is rejected', async () => {
    await withVerifierServer(async ({ port }) => {
      // Sign correctly (same algorithm) but with a different secret: the
      // verifier's recomputation diverges -> 401. This is the tampered-signature
      // control (Python corrupts the Authorization header before sending; here
      // the corruption happens at the signing key, same observable result).
      await expect(
        makeClient(port, 'WRONG-SECRET').uploadFiles('myagent', 'sess-1', UPLOAD_FILES, {
          path: '/home/user/',
        }),
      ).rejects.toThrow(/HTTP 401/);
    });
  });

  it('invoke without a query string verifies', async () => {
    // invoke carries no query params; the query fix must not regress it.
    await withVerifierServer(async ({ port }) => {
      const result = await makeClient(port).invokeAgent(
        'myagent',
        'sess-1',
        '{"input": "hi"}',
      );
      expect(typeof result).toBe('object');
      expect(result).not.toBeNull();
    });
  });
});
