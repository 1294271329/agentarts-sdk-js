/**
 * Platform adapters registry for the AgentArts Memory installer.
 *
 * Ported from
 * `agentarts/toolkit/plugins/memory/installer/platforms/__init__.py`.
 */

import type { Platform } from './base.js';
import { ClaudePlatform } from './claude.js';
import { CodexPlatform } from './codex.js';
import { HermesPlatform } from './hermes.js';
import { OpenClawPlatform } from './openclaw.js';
import { OpenCodePlatform } from './opencode.js';

export { InstallResult, Platform } from './base.js';
export { ClaudePlatform, CLAUDE_PLACEHOLDER } from './claude.js';
export { CodexPlatform, CODEX_PLACEHOLDER, TOML_KEY } from './codex.js';
export { HermesPlatform, HERMES_HOME_DEFAULT, hermesHome } from './hermes.js';
export { OpenClawPlatform } from './openclaw.js';
export { OpenCodePlatform, PLUGIN_ENTRY } from './opencode.js';

/** Registry of all supported platforms. */
export const PLATFORMS: Record<string, Platform> = {
  hermes: new HermesPlatform(),
  claude: new ClaudePlatform(),
  codex: new CodexPlatform(),
  opencode: new OpenCodePlatform(),
  openclaw: new OpenClawPlatform(),
};

/** Get a platform adapter by name, or `null` if unknown. */
export function getPlatform(name: string): Platform | null {
  return PLATFORMS[name] ?? null;
}

/**
 * Detect all platforms whose config directories exist.
 *
 * @returns List of `[name, platform]` pairs.
 */
export function detectAll(_globalScope = false): Array<[string, Platform]> {
  const detected: Array<[string, Platform]> = [];
  for (const [name, platform] of Object.entries(PLATFORMS)) {
    if (platform.detect()) {
      detected.push([name, platform]);
    }
  }
  return detected;
}
