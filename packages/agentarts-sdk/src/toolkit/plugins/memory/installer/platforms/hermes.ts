/**
 * Hermes Agent platform adapter.
 *
 * Ported from
 * `agentarts/toolkit/plugins/memory/installer/platforms/hermes.py`.
 *
 * Deploys the hermes memory provider (provider module, plugin.yaml, package
 * entry) into the active Hermes home's `plugins/agentarts/` directory.
 *
 * Hermes home resolution priority (see {@link hermesHome}):
 * 1. `HERMES_HOME` env var — set by the Hermes installer on *all* platforms.
 * 2. On Windows native: `%LOCALAPPDATA%\hermes` (the installer default). The
 *    Windows installer does *not* create `~/.hermes`; it stores data under
 *    `%LOCALAPPDATA%\hermes` and sets `HERMES_HOME` accordingly.
 * 3. `~/.hermes` — the default on Linux / macOS / WSL.
 *
 * All credentials (API key, space ID, region) are written to
 * `<hermesHome>/.env` (deduplicated by key). Hermes does NOT depend on the
 * local adapter server (the provider connects to the cloud SDK directly).
 */

import { existsSync, rmdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

import {
  ENV_API_KEY,
  ENV_REGION,
  ENV_SPACE_ID,
  copyFile,
  expand,
  hermesFiles,
  removeIfEmpty,
  removeTree,
  setYamlKey,
  statusErr,
  statusOk,
  stripEnvKeys,
  writeEnvFile,
} from '../utils.js';

import { InstallResult, Platform } from './base.js';

/** Default Hermes home (Linux / macOS / WSL). */
export const HERMES_HOME_DEFAULT = '~/.hermes';

/**
 * Resolve the Hermes home directory.
 *
 * Priority:
 * 1. `HERMES_HOME` env var (set by the Hermes installer on all platforms).
 * 2. Windows native: `%LOCALAPPDATA%\hermes` (Hermes Windows default).
 * 3. `~/.hermes` (Linux / macOS / WSL default).
 */
export function hermesHome(): string {
  const envHome = process.env['HERMES_HOME'] ?? '';
  if (envHome) {
    return envHome;
  }
  if (process.platform === 'win32') {
    const localAppData = process.env['LOCALAPPDATA'] ?? '';
    if (localAppData) {
      return join(localAppData, 'hermes');
    }
  }
  return HERMES_HOME_DEFAULT;
}

/** Hermes Agent platform adapter. */
export class HermesPlatform extends Platform {
  override name = 'hermes';
  override display = 'Hermes Agent';
  override fixedUserLevel = true;

  override detect(): boolean {
    return Platform._dirExists(hermesHome());
  }

  override configDir(_scope: string): string {
    // scope is ignored — hermes is always user-level.
    return expand(join(hermesHome(), 'plugins', 'agentarts'));
  }

  override async install(
    _scope: string,
    creds: Record<string, string>,
    _yes: boolean,
  ): Promise<InstallResult> {
    const pluginDir = expand(join(hermesHome(), 'plugins', 'agentarts'));
    const envPath = expand(join(hermesHome(), '.env'));

    // Phase 1: deploy the plugin files.
    const deployed: string[] = [];
    for (const src of hermesFiles()) {
      const dst = join(pluginDir, basename(src));
      copyFile(src, dst);
      deployed.push(dst);
      statusOk(`Deploy ${basename(src)}`, dst);
    }

    // Phase 2: write .env (API key, space ID, region).
    const envEntries: Record<string, string> = {};
    for (const variable of [ENV_API_KEY, ENV_SPACE_ID, ENV_REGION]) {
      const value = creds[variable];
      if (value) {
        envEntries[variable] = value;
      }
    }
    if (Object.keys(envEntries).length > 0) {
      writeEnvFile(envPath, envEntries);
      statusOk('Write .env', envPath);
    } else {
      statusErr('Write .env', 'Credentials missing');
    }

    // Phase 3: activate the hermes memory provider in config.yaml.
    const configYamlPath = expand(join(hermesHome(), 'config.yaml'));
    setYamlKey(configYamlPath, 'memory', 'provider', 'agentarts');
    statusOk('Activate memory provider', configYamlPath);

    return new InstallResult({
      configDir: pluginDir,
      scriptsDir: '',
      files: deployed,
      configFiles: [envPath, configYamlPath],
    });
  }

  override async uninstall(_entry: Record<string, any>): Promise<void> {
    const pluginDir = expand(join(hermesHome(), 'plugins', 'agentarts'));
    const envPath = expand(join(hermesHome(), '.env'));

    // Phase 1: remove the plugin directory.
    if (existsSync(pluginDir)) {
      removeTree(pluginDir);
      statusOk('Remove plugin dir', pluginDir);
      // Clean up empty parent directories up to the hermes home.
      let parent = dirname(pluginDir);
      const hermesHomeExpanded = expand(hermesHome());
      while (parent !== hermesHomeExpanded && existsSync(parent)) {
        try {
          rmdirSync(parent);
        } catch {
          break;
        }
        parent = dirname(parent);
      }
    }

    // Phase 2: strip the env keys from .env.
    stripEnvKeys(envPath, [ENV_API_KEY, ENV_SPACE_ID, ENV_REGION]);
    statusOk('Strip .env', envPath);

    // Phase 3: deactivate the hermes memory provider in config.yaml.
    const configYamlPath = expand(join(hermesHome(), 'config.yaml'));
    setYamlKey(configYamlPath, 'memory', 'provider', '');
    statusOk('Deactivate memory provider', configYamlPath);

    // Clean up empty directories.
    removeIfEmpty(expand(hermesHome()));
  }
}
