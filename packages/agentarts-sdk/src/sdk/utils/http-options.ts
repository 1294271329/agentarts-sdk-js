/**
 * Shared HTTP/TLS options for the generated Huawei Cloud service clients.
 *
 * The upstream `@huaweicloud/huaweicloud-sdk-core` client is axios based and its
 * `UserOptions` only exposes `customUserAgent` and `axiosRequestConfig`. The
 * `verifySsl` semantics of the Python SDK map to an axios `httpsAgent`:
 *
 * - `true`  -> default axios agent (certificate verification enabled)
 * - `false` -> agent with `rejectUnauthorized: false`
 * - `string` -> agent with the given CA bundle file
 */

import { readFileSync } from 'node:fs';
import { Agent as HttpsAgent } from 'node:https';

import { getLogger } from './logging.js';

const logger = getLogger('sdk.http_options');

export interface SslRequestOptions {
  axiosRequestConfig?: {
    httpsAgent: HttpsAgent;
  };
}

/** Build the axios request config that implements `verifySsl`. */
export function buildSslRequestOptions(verifySsl: boolean | string = true): SslRequestOptions {
  if (verifySsl === true) {
    return {};
  }

  if (verifySsl === false) {
    return {
      axiosRequestConfig: {
        httpsAgent: new HttpsAgent({ rejectUnauthorized: false }),
      },
    };
  }

  if (typeof verifySsl === 'string' && verifySsl.length > 0) {
    try {
      return {
        axiosRequestConfig: {
          httpsAgent: new HttpsAgent({ ca: readFileSync(verifySsl) }),
        },
      };
    } catch (error) {
      logger.warning(`Failed to read CA file '${verifySsl}': ${error}`);
      return {};
    }
  }

  return {};
}
