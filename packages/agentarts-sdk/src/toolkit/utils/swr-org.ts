/**
 * SWR organization name generator.
 *
 * Ported from `agentarts/toolkit/utils/swr_org.py`.
 */

import { createHash, randomInt } from 'node:crypto';

import { getAk } from '../../sdk/utils/constant.js';

const RANDOM_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Shorten a region name to a compact form.
 *
 * Examples:
 *   cn-southwest-2 -> cnso2
 *   cn-north-4 -> cnno4
 *   ap-southeast-1 -> apse1
 *
 * @param region Full region name (e.g. `cn-southwest-2`).
 * @returns Shortened region name (max 6 chars).
 */
export function shortenRegion(region: string): string {
  const parts = region.split('-');
  if (parts.length >= 3) {
    const provider = parts[0].slice(0, 2);
    const area = parts[1].slice(0, 2);
    let num = parts[2];
    if (num.length > 2) {
      num = num.slice(0, 2);
    }
    return `${provider}${area}${num}`;
  }
  return region.replace(/-/g, '').slice(0, 6);
}

/**
 * Generate an identifier from the AK (Access Key).
 *
 * If an AK is available, uses a hash of the AK so the identifier is consistent
 * per account; otherwise a random identifier is generated.
 *
 * @param ak Access Key string. If `null`/`undefined`, read from the environment.
 * @param length Length of the identifier to generate.
 */
export function generateAkIdentifier(ak?: string | null, length = 8): string {
  const accessKey = ak ?? getAk();
  if (accessKey && accessKey.length > 0) {
    const hashHex = createHash('md5').update(accessKey, 'utf8').digest('hex');
    return hashHex.slice(0, length).toLowerCase();
  }
  return randomString(length);
}

/**
 * Generate a random suffix for uniqueness.
 *
 * @param length Length of the random suffix.
 * @returns Random string of lowercase letters and digits.
 */
export function generateRandomSuffix(length = 6): string {
  return randomString(length);
}

/**
 * Generate a default agent name with a random suffix.
 *
 * @param baseName Base name for the agent.
 * @param suffixLength Length of the random suffix.
 * @returns Agent name with a random suffix (e.g. `myagent-abc12`).
 */
export function generateDefaultAgentName(baseName = 'myagent', suffixLength = 5): string {
  return `${baseName}-${generateRandomSuffix(suffixLength)}`;
}

/**
 * Generate a unique SWR organization name.
 *
 * Format: `agentarts-{region_short}-{ak_identifier}-org`
 *
 * The generated name is:
 * 1. unique per account (based on the AK hash);
 * 2. consistent per account (the same AK generates the same name);
 * 3. within the `maxLength` constraint (default 64 chars).
 *
 * @param region Huawei Cloud region (e.g. `cn-southwest-2`). Defaults to
 *   `default` as a placeholder.
 * @param ak Access Key used to identify the account. If omitted, the AK is read
 *   from the environment.
 * @param maxLength Maximum length of the organization name.
 */
export function generateSwrOrgName(
  region?: string | null,
  ak?: string | null,
  maxLength = 64,
): string {
  const prefix = 'agentarts-';
  const suffix = '-org';

  let regionShort = shortenRegion(region || 'default');
  let akIdentifier = generateAkIdentifier(ak, 8);

  let baseName = `${prefix}${regionShort}-${akIdentifier}${suffix}`;

  if (baseName.length > maxLength) {
    const excess = baseName.length - maxLength;
    akIdentifier = generateAkIdentifier(ak, 8 - Math.min(excess, 8));
    baseName = `${prefix}${regionShort}-${akIdentifier}${suffix}`;

    if (baseName.length > maxLength) {
      regionShort = regionShort.slice(
        0,
        regionShort.length - Math.min(baseName.length - maxLength, regionShort.length),
      );
      baseName = `${prefix}${regionShort}${suffix}`;
    }
  }

  return baseName.toLowerCase();
}

/** Generate a random lowercase-letter/digit string of `length` characters. */
function randomString(length: number): string {
  let result = '';
  for (let index = 0; index < length; index += 1) {
    result += RANDOM_CHARS[randomInt(0, RANDOM_CHARS.length)];
  }
  return result;
}
