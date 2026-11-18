//
// Copyright (c) Huawei Technologies CO., Ltd. 2025. All rights reserved.
//

/**
 * V11-HMAC-SHA256 signer for Huawei Cloud API requests.
 */

import { createHash, createHmac } from 'node:crypto';

export const APIC = 'apic';
export const UTF8 = 'utf-8';
export const DATE_FORMAT = 'YYYYMMDDTHHmmssZ';
export const ALGORITHM = 'V11-HMAC-SHA256';

/** RFC 3986 encoding matching Python's `quote(s, safe='~')`. */
export function v11UrlEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

export class V11Signer {
  readonly ak: string;
  readonly sk: string;
  readonly regionId: string;
  readonly algorithm = ALGORITHM;
  private _credentialScope = '';

  constructor(ak: string, sk: string, regionId: string) {
    this.ak = ak;
    this.sk = sk;
    this.regionId = regionId;
  }

  private _getTimestamp(): string {
    const iso = new Date().toISOString(); // 2026-11-17T13:30:00.000Z
    const date = `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}`;
    const time = `${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}`;
    return `${date}T${time}Z`;
  }

  private _hexEncodeSha256(data: string): string {
    return createHash('sha256').update(data, 'utf8').digest('hex');
  }

  private _hkdf(key: string, secret: string, info: string, length = 32): string {
    const salt = Buffer.from(key, 'utf8');
    const ikm = Buffer.from(secret, 'utf8');
    const infoBytes = Buffer.from(info, 'utf8');

    const prk = createHmac('sha256', salt).update(ikm).digest();

    const chunks: Buffer[] = [];
    let t = Buffer.alloc(0);
    const rounds = Math.floor((length + 32) / 32);
    for (let i = 1; i <= rounds; i += 1) {
      t = createHmac('sha256', prk)
        .update(Buffer.concat([t, infoBytes, Buffer.from([i])]))
        .digest();
      chunks.push(t);
    }

    return Buffer.concat(chunks).subarray(0, length).toString('hex');
  }

  private _canonicalUri(path: string): string {
    const patterns = decodeURIComponent(path).split('/');
    let urlPath = patterns.map((value) => v11UrlEncode(value)).join('/');
    if (urlPath && !urlPath.endsWith('/')) {
      urlPath = `${urlPath}/`;
    }
    return urlPath;
  }

  /**
   * Build the standard V11 canonical query string.
   *
   * The data-plane gateway does not include the query string in the V11
   * canonical request, so `sign()` signs an empty canonical query line; this
   * method is kept as the standard-V11 reference implementation.
   */
  private _canonicalQueryString(queryParams?: Record<string, any> | null): string {
    if (!queryParams) {
      return '';
    }
    const keys = Object.keys(queryParams).sort();
    const parts: string[] = [];
    for (const key of keys) {
      const encodedKey = v11UrlEncode(key);
      const value = queryParams[key];
      if (Array.isArray(value)) {
        const sortedValues = value.map((item) => String(item)).sort();
        for (const item of sortedValues) {
          parts.push(`${encodedKey}=${v11UrlEncode(item)}`);
        }
      } else {
        parts.push(`${encodedKey}=${v11UrlEncode(String(value))}`);
      }
    }
    return parts.join('&');
  }

  private _canonicalHeaders(headers: Record<string, string>, signedHeaders: string[]): string {
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      normalized[key.toLowerCase()] = String(value).trim();
    }
    const lines = signedHeaders.map((key) => `${key}:${normalized[key] ?? ''}`);
    return `${lines.join('\n')}\n`;
  }

  private _signedHeaders(headers: Record<string, string>): string[] {
    return Object.keys(headers)
      .map((key) => key.toLowerCase())
      .sort();
  }

  private _setCredentialScope(timeStr: string): void {
    const formattedDate = timeStr.slice(0, 8);
    this._credentialScope = `${formattedDate}/${this.regionId}/${APIC}`;
  }

  private _getStringToSign(canonicalRequest: string, timeStr: string): string {
    const hashedCanonicalRequest = this._hexEncodeSha256(canonicalRequest);
    this._setCredentialScope(timeStr);
    return `${this.algorithm}\n${timeStr}\n${this._credentialScope}\n${hashedCanonicalRequest}`;
  }

  private _signStringToSign(realUseSecret: string, stringToSign: string): string {
    return createHmac('sha256', Buffer.from(realUseSecret, 'utf8'))
      .update(stringToSign, 'utf8')
      .digest('hex');
  }

  private _getRealUseSecret(): string {
    return this._hkdf(this.ak, this.sk, this._credentialScope);
  }

  private _getAuthHeaderValue(signedHeaders: string[], signature: string): string {
    return `${this.algorithm} Credential=${this.ak}/${this._credentialScope}, SignedHeaders=${signedHeaders.join(';')}, Signature=${signature}`;
  }

  /**
   * Sign an HTTP request.
   *
   * @param method HTTP method.
   * @param path Request path.
   * @param queryParams Query parameters (not included in the signature).
   * @param headers Request headers (updated with the signature).
   * @returns The updated headers.
   */
  sign(
    method: string,
    path: string,
    queryParams: Record<string, any> | null | undefined,
    headers: Record<string, string>,
  ): Record<string, string> {
    const timestamp = this._getTimestamp();
    headers['x-sdk-date'] = timestamp;

    const signedHeaders = this._signedHeaders(headers);

    const canonicalRequest = [
      method.toUpperCase(),
      this._canonicalUri(path),
      '',
      this._canonicalHeaders(headers, signedHeaders),
      signedHeaders.join(';'),
      'UNSIGNED-PAYLOAD',
    ].join('\n');

    const stringToSign = this._getStringToSign(canonicalRequest, timestamp);
    const realUseSecret = this._getRealUseSecret();
    const signature = this._signStringToSign(realUseSecret, stringToSign);
    const authValue = this._getAuthHeaderValue(signedHeaders, signature);

    headers['Authorization'] = authValue;

    return headers;
  }
}

/** Create a V11 signer instance. */
export function createV11Signer(ak: string, sk: string, regionId: string): V11Signer {
  return new V11Signer(ak, sk, regionId);
}
