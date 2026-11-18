/**
 * OpenClaw platform adapter (placeholder).
 *
 * Ported from
 * `agentarts/toolkit/plugins/memory/installer/platforms/openclaw.py`.
 *
 * OpenClaw support is not yet implemented: install/uninstall print a
 * placeholder message and exit normally.
 */

import { echoWarning } from '../../../../utils/common.js';

import { InstallResult, Platform } from './base.js';

/** OpenClaw platform adapter (placeholder). */
export class OpenClawPlatform extends Platform {
  override name = 'openclaw';
  override display = 'OpenClaw';
  override fixedUserLevel = false;

  override detect(): boolean {
    // We don't know how to detect OpenClaw yet.
    return false;
  }

  override configDir(_scope: string): string {
    return '';
  }

  override async install(
    _scope: string,
    _creds: Record<string, string>,
    _yes: boolean,
  ): Promise<InstallResult> {
    echoWarning('openclaw not yet implemented');
    return new InstallResult({ configDir: '', scriptsDir: '', files: [], configFiles: [] });
  }

  override async uninstall(_entry: Record<string, any>): Promise<void> {
    echoWarning('openclaw not yet implemented');
  }
}
