/**
 * Unit tests for the V11-HMAC-SHA256 signer.
 *
 * Ported 1:1 from `tests/unit/sdk/utils/test_signer_v11.py`.
 */

import { describe, it, expect, vi } from 'vitest';

import { V11Signer } from 'agentarts-sdk/sdk/utils/signer-v11';
import {
  BaseHTTPClient,
  RequestConfig,
  SignMode,
} from 'agentarts-sdk/sdk/service/http-client';

/** Parse the SignedHeaders list out of an Authorization header value. */
function signedHeadersFromAuth(authValue: string): string[] {
  const match = /SignedHeaders=([^,]+)/.exec(authValue);
  expect(match, `no SignedHeaders in ${JSON.stringify(authValue)}`).toBeTruthy();
  return match![1].split(';');
}

/** Parse the Signature value out of an Authorization header value. */
function signatureFromAuth(authValue: string): string {
  const match = /Signature=([0-9a-f]+)/.exec(authValue);
  expect(match, `no Signature in ${JSON.stringify(authValue)}`).toBeTruthy();
  return match![1];
}

function makeSigner(): V11Signer {
  const signer = new V11Signer('ak', 'sk', 'cn-southwest-2');
  // Pin the timestamp so signatures are comparable across calls.
  (signer as any)._getTimestamp = () => '20260709T120000Z';
  return signer;
}

describe('TestQueryNotSigned', () => {
  // The data-plane gateway does not sign the query string. The signer must
  // therefore produce a signature that is *independent* of the query params
  // (they are still sent on the wire, just not signed).

  it('query does not affect signature', () => {
    const signer = makeSigner();
    const base = { host: 'data.example.com', 'x-hw-agentarts-session-id': 's' };
    const outNoQuery = signer.sign('POST', '/runtimes/a/upload-files', null, { ...base });
    const outWithQuery = signer.sign(
      'POST',
      '/runtimes/a/upload-files',
      { path: '/home/user/test.txt', user_id: 1000, file_mode: '0644' },
      { ...base },
    );
    expect(signatureFromAuth(outNoQuery['Authorization'])).toBe(
      signatureFromAuth(outWithQuery['Authorization']),
    );
  });

  it('changing query value does not change signature', () => {
    const signer = makeSigner();
    const base = { host: 'h', 'x-hw-agentarts-session-id': 's' };
    const a = signer.sign('POST', '/p', { path: '/a/b' }, { ...base });
    const b = signer.sign('POST', '/p', { path: '/x/y/z' }, { ...base });
    expect(signatureFromAuth(a['Authorization'])).toBe(signatureFromAuth(b['Authorization']));
  });

  it('query is still sent on wire', () => {
    // The signer does not strip query params from the caller's request — it
    // only drops them from the signature. It takes `headers` and returns
    // updated `headers`.
    const signer = makeSigner();
    const out = signer.sign('POST', '/p', { path: '/x' }, { host: 'h' });
    expect(out['Authorization']).toBeDefined();
    expect(out['x-sdk-date']).toBe('20260709T120000Z');
  });
});

describe('TestSignedHeaders', () => {
  // Headers (including Content-Type) ARE signed — the gateway recomputes only
  // the declared SignedHeaders from the values it receives.

  it('content type is signed', () => {
    const signer = makeSigner();
    const out = signer.sign('POST', '/p', null, {
      host: 'h',
      'Content-Type': 'application/octet-stream',
    });
    expect(signedHeadersFromAuth(out['Authorization'])).toContain('content-type');
  });

  it('changing content type changes signature', () => {
    const signer = makeSigner();
    const a = signer.sign('POST', '/p', null, {
      host: 'h',
      'Content-Type': 'application/octet-stream',
    });
    const b = signer.sign('POST', '/p', null, { host: 'h', 'Content-Type': 'application/json' });
    expect(signatureFromAuth(a['Authorization'])).not.toBe(
      signatureFromAuth(b['Authorization']),
    );
  });

  it('changing signed header changes signature', () => {
    // Guard: a signed header value change MUST change the signature.
    const signer = makeSigner();
    const a = signer.sign('POST', '/p', null, { host: 'a.example.com' });
    const b = signer.sign('POST', '/p', null, { host: 'b.example.com' });
    expect(signatureFromAuth(a['Authorization'])).not.toBe(
      signatureFromAuth(b['Authorization']),
    );
  });

  it('signed headers sorted and lowercased', () => {
    const signer = makeSigner();
    // "Host" must be lowercased; the signer also adds "x-sdk-date".
    const out = signer.sign('GET', '/p', null, { Host: 'h', 'X-Custom-Hdr': 'v' });
    expect(signedHeadersFromAuth(out['Authorization'])).toEqual([
      'host',
      'x-custom-hdr',
      'x-sdk-date',
    ]);
  });
});

describe('TestSignBasics', () => {
  it('authorization format', () => {
    const out = makeSigner().sign('POST', '/p', null, { host: 'h' });
    const auth = out['Authorization'];
    expect(auth.startsWith('V11-HMAC-SHA256 Credential=ak/20260709/cn-southwest-2/apic')).toBe(true);
    expect(auth).toContain('SignedHeaders=');
    expect(auth).toContain('Signature=');
  });

  it('adds x sdk date and authorization', () => {
    const out = makeSigner().sign('GET', '/p', null, { host: 'h' });
    expect(out['x-sdk-date']).toBe('20260709T120000Z');
    expect(out['Authorization']).toBeDefined();
  });

  it('deterministic for same inputs', () => {
    const signer = makeSigner();
    const a = signer.sign('POST', '/p', { a: '1' }, { host: 'h', 'Content-Type': 'x' });
    const b = signer.sign('POST', '/p', { a: '1' }, { host: 'h', 'Content-Type': 'x' });
    expect(a['Authorization']).toBe(b['Authorization']);
  });
});

describe('TestCanonicalQueryString', () => {
  // `_canonicalQueryString` is the standard-V11 reference implementation. It is
  // **not** used to build the signature (the gateway does not sign the query);
  // these tests just pin its reference behaviour.

  it('empty when no params', () => {
    const signer = new V11Signer('ak', 'sk', 'cn-southwest-2');
    expect((signer as any)._canonicalQueryString(null)).toBe('');
    expect((signer as any)._canonicalQueryString({})).toBe('');
  });

  it('sorts keys', () => {
    const signer = new V11Signer('ak', 'sk', 'cn-southwest-2');
    expect((signer as any)._canonicalQueryString({ user_id: 1000, file_mode: '0644' })).toBe(
      'file_mode=0644&user_id=1000',
    );
  });

  it('space and special encoded', () => {
    const signer = new V11Signer('ak', 'sk', 'cn-southwest-2');
    expect((signer as any)._canonicalQueryString({ q: 'a b&c' })).toBe('q=a%20b%26c');
  });
});

describe('TestSignRequestV11Integration', () => {
  // BaseHTTPClient._signRequestV11 wires query + content-type through
  // correctly: query sent on the wire but not signed; content-type signed.

  it('v11 sign request query not signed content type signed', async () => {
    // Pin the timestamp so the two signatures are comparable.
    vi.spyOn(V11Signer.prototype as any, '_getTimestamp').mockReturnValue('20260709T120000Z');

    const client = new BaseHTTPClient(
      new RequestConfig({ baseUrl: 'https://data.example.com' }),
      true,
      SignMode.V11_HMAC_SHA256,
      'cn-southwest-2',
    );
    (client as any)._credentials = { ak: 'ak', sk: 'sk', security_token: null };

    // Sign the same request twice: once with query params, once without.
    const baseHeaders = {
      'x-hw-agentarts-session-id': 'sess-1',
      'Content-Type': 'application/octet-stream',
    };
    const withQuery = await (client as any)._signRequestV11(
      'POST',
      'https://data.example.com/runtimes/a/upload-files',
      {
        headers: { ...baseHeaders },
        data: 'x',
        params: { path: '/home/user/test.txt', user_id: 1000 },
      },
    );
    const withoutQuery = await (client as any)._signRequestV11(
      'POST',
      'https://data.example.com/runtimes/a/upload-files',
      { headers: { ...baseHeaders }, data: 'x', params: null },
    );

    // Query params are still passed through to the HTTP client (sent on wire).
    expect(withQuery['params']).toEqual({ path: '/home/user/test.txt', user_id: 1000 });
    // Content-Type is signed.
    expect(signedHeadersFromAuth(withQuery['headers']['Authorization'])).toContain('content-type');
    // Signature is independent of the query (query not signed).
    expect(signatureFromAuth(withQuery['headers']['Authorization'])).toBe(
      signatureFromAuth(withoutQuery['headers']['Authorization']),
    );
  });
});
