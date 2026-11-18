/**
 * User-Agent construction utilities.
 *
 * Builds a User-Agent suffix of the form
 * `os/<system>/<release> agentarts-sdk-nodejs/<version>` and appends it to an
 * existing value rather than replacing it.
 */

import * as os from 'node:os';
import { SDK_PRODUCT, SDK_VERSION } from '../../version.js';

/** Return the installed SDK version. */
export function getSdkVersion(): string {
  return SDK_VERSION;
}

/** Return the operating system metadata in `os/<system>/<release>` form. */
export function getOsMetadata(): string {
  return `os/${os.type()}/${os.release()}`;
}

/**
 * Append the SDK version and OS metadata to an existing User-Agent.
 *
 * @param original The pre-existing User-Agent value to preserve. When omitted,
 *   the returned string contains only the SDK version and OS metadata.
 */
export function buildUserAgent(original?: string | null): string {
  const suffix = `${getOsMetadata()} ${SDK_PRODUCT}/${getSdkVersion()}`;
  if (original) {
    return `${original} ${suffix}`;
  }
  return suffix;
}
