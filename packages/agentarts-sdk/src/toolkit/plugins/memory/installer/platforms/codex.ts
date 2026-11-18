/**
 * Codex platform adapter.
 *
 * Ported from
 * `agentarts/toolkit/plugins/memory/installer/platforms/codex.py`.
 *
 * Deploys the 3 `.mjs` hook scripts to `<configDir>/agentarts-memory/scripts/`
 * and registers 2 hooks in `<configDir>/hooks.json` using absolute paths (the
 * `${CODEX_PLUGIN_ROOT}` placeholder is replaced).
 *
 * Also updates `<configDir>/config.toml` to enable `hooks = true` under
 * `[features]` and adds the `[mcp_servers.agentarts_memory]` section (text-level
 * merges, no toml dependency).
 *
 * Config dir:
 * - project: `.codex/`
 * - global:  `~/.codex/`
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

import {
  MCP_SERVER_NAME,
  MCP_SERVER_COMMAND,
  buildMcpEnv,
  codeAgentScripts,
  codexHooksTemplate,
  copyFile,
  expand,
  isDir,
  isFile,
  mergeHooks,
  mergeTomlFeatures,
  mergeTomlMcpServer,
  mcpServerArgs,
  readJson,
  removeHooksKey,
  removeIfEmpty,
  removeTree,
  statusOk,
  statusUpdated,
  stripJson5,
  stripTomlFeature,
  stripTomlMcpServer,
  tryRmdir,
  unlinkIfExists,
  writeJsonAtomic,
} from '../utils.js';

import { InstallResult, Platform } from './base.js';

export const CODEX_PLACEHOLDER = '${CODEX_PLUGIN_ROOT}';
export const TOML_KEY = 'hooks';

/** Codex platform adapter. */
export class CodexPlatform extends Platform {
  override name = 'codex';
  override display = 'Codex';
  override fixedUserLevel = false;

  override detect(): boolean {
    return Platform._dirExists('~/.codex');
  }

  override configDir(scope: string): string {
    if (scope === 'global') {
      return expand('~/.codex');
    }
    return join(process.cwd(), '.codex');
  }

  private _scriptsDir(scope: string): string {
    return join(this.configDir(scope), 'agentarts-memory', 'scripts');
  }

  private _hooksPath(scope: string): string {
    return join(this.configDir(scope), 'hooks.json');
  }

  private _configTomlPath(scope: string): string {
    return join(this.configDir(scope), 'config.toml');
  }

  /** Read the hooks.codex.json template and replace the placeholder with an absolute path. */
  private _loadHooksTemplate(scriptsDir: string): Record<string, any> {
    let raw = readFileSync(codexHooksTemplate(), 'utf8');
    // Normalize to forward slashes so backslashes don't break JSON parsing on
    // Windows (e.g. C:\Users\... -> C:/Users/...).
    const pluginRoot = dirname(scriptsDir).replace(/\\/g, '/');
    raw = raw.split(CODEX_PLACEHOLDER).join(pluginRoot);
    return JSON.parse(stripJson5(raw)) as Record<string, any>;
  }

  override async install(
    scope: string,
    creds: Record<string, string>,
    _yes: boolean,
  ): Promise<InstallResult> {
    const configDir = this.configDir(scope);
    const scriptsDir = this._scriptsDir(scope);
    const hooksPath = this._hooksPath(scope);
    const tomlPath = this._configTomlPath(scope);

    // Phase 1: deploy the hook scripts.
    const deployed: string[] = [];
    for (const src of codeAgentScripts()) {
      const dst = join(scriptsDir, basename(src));
      copyFile(src, dst);
      deployed.push(dst);
      statusOk(`Deploy ${basename(src)}`, dst);
    }

    // Phase 2: merge hooks into hooks.json.
    const hooksTemplate = this._loadHooksTemplate(scriptsDir);
    const existingHooks = readJson(hooksPath);
    const merged = mergeHooks(existingHooks, hooksTemplate, scriptsDir);
    writeJsonAtomic(hooksPath, merged);
    statusUpdated('hooks.json', hooksPath);

    // Phase 3: update config.toml — enable hooks.
    let tomlText = isFile(tomlPath) ? readFileSync(tomlPath, 'utf8') : '';
    let updatedToml = mergeTomlFeatures(tomlText, TOML_KEY, 'true', {
      deprecatedKeys: ['codex_hooks'],
    });
    writeToml(tomlPath, updatedToml);
    statusUpdated('config.toml', tomlPath);

    // Phase 4: merge the MCP server config into config.toml.
    tomlText = readFileSync(tomlPath, 'utf8');
    updatedToml = mergeTomlMcpServer(
      tomlText,
      MCP_SERVER_NAME,
      MCP_SERVER_COMMAND,
      mcpServerArgs(),
      buildMcpEnv(creds, 'codex'),
    );
    writeToml(tomlPath, updatedToml);
    statusUpdated('config.toml (MCP)', tomlPath);

    return new InstallResult({
      configDir,
      scriptsDir,
      files: deployed,
      configFiles: [hooksPath, tomlPath],
    });
  }

  override async uninstall(entry: Record<string, any>): Promise<void> {
    const scriptsDir: string = entry['scripts_dir'] ?? '';
    const configDir: string = entry['config_dir'] ?? '';
    const hooksPath = configDir ? join(configDir, 'hooks.json') : '';
    const tomlPath = configDir ? join(configDir, 'config.toml') : '';

    // Phase 1: strip our hooks from hooks.json.
    if (hooksPath && isFile(hooksPath)) {
      const hooksData = readJson(hooksPath);
      const cleaned = removeHooksKey(hooksData, scriptsDir);
      if (Object.keys(cleaned).length > 0) {
        writeJsonAtomic(hooksPath, cleaned);
        statusOk('Stripped hooks from hooks.json', hooksPath);
      } else {
        unlinkIfExists(hooksPath);
        statusOk('Removed hooks.json', hooksPath);
      }
    }

    // Phase 2: strip hooks from config.toml.
    if (tomlPath && isFile(tomlPath)) {
      let tomlText = readFileSync(tomlPath, 'utf8');
      // Strip the MCP server config first, then the hooks feature.
      tomlText = stripTomlMcpServer(tomlText, MCP_SERVER_NAME);
      const updated = stripTomlFeature(tomlText, TOML_KEY);
      if (updated.trim()) {
        writeToml(tomlPath, updated);
        statusOk('Stripped hooks and MCP from config.toml', tomlPath);
      } else {
        unlinkIfExists(tomlPath);
        statusOk('Removed config.toml', tomlPath);
      }
    }

    // Phase 3: remove the scripts directory.
    if (scriptsDir && isDir(scriptsDir)) {
      removeTree(scriptsDir);
      statusOk('Remove scripts dir', scriptsDir);
      const parent = dirname(scriptsDir);
      if (isDir(parent)) {
        tryRmdir(parent);
      }
      if (configDir) {
        removeIfEmpty(configDir);
      }
    }
  }
}

/** Write TOML text, creating the parent directory first. */
function writeToml(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text, 'utf8');
}

