/**
 * Claude Code platform adapter.
 *
 * Ported from
 * `agentarts/toolkit/plugins/memory/installer/platforms/claude.py`.
 *
 * Deploys the 3 `.mjs` hook scripts to
 * `<configDir>/agentarts-memory/scripts/` and registers 2 hooks in
 * `<configDir>/settings.json` using absolute paths (the
 * `${CLAUDE_PLUGIN_ROOT}` placeholder is replaced).
 *
 * Config dir:
 * - project: `.claude/`
 * - global:  `~/.claude/`
 */

import { readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

import {
  MCP_SERVER_NAME,
  MCP_SERVER_COMMAND,
  buildMcpEnv,
  claudeHooksTemplate,
  codeAgentScripts,
  copyFile,
  expand,
  isDir,
  isFile,
  mergeHooks,
  mergeMcpServers,
  mcpServerArgs,
  readJson,
  removeHooksKey,
  removeIfEmpty,
  removeTree,
  statusOk,
  statusUpdated,
  stripJson5,
  stripMcpServers,
  tryRmdir,
  unlinkIfExists,
  writeJsonAtomic,
} from '../utils.js';

import { InstallResult, Platform } from './base.js';

export const CLAUDE_PLACEHOLDER = '${CLAUDE_PLUGIN_ROOT}';

/** Claude Code platform adapter. */
export class ClaudePlatform extends Platform {
  override name = 'claude';
  override display = 'Claude Code';
  override fixedUserLevel = false;

  override detect(): boolean {
    return Platform._dirExists('~/.claude');
  }

  override configDir(scope: string): string {
    if (scope === 'global') {
      return expand('~/.claude');
    }
    return join(process.cwd(), '.claude');
  }

  private _scriptsDir(scope: string): string {
    return join(this.configDir(scope), 'agentarts-memory', 'scripts');
  }

  private _settingsPath(scope: string): string {
    return join(this.configDir(scope), 'settings.json');
  }

  /** Read the hooks.json template and replace the placeholder with an absolute path. */
  private _loadHooksTemplate(scriptsDir: string): Record<string, any> {
    let raw = readFileSync(claudeHooksTemplate(), 'utf8');
    // Replace ${CLAUDE_PLUGIN_ROOT} with the parent of scriptsDir (pluginRoot =
    // configDir/agentarts-memory). Normalize to forward slashes so backslashes
    // don't break JSON parsing on Windows (e.g. C:\Users\... -> C:/Users/...).
    const pluginRoot = dirname(scriptsDir).replace(/\\/g, '/');
    raw = raw.split(CLAUDE_PLACEHOLDER).join(pluginRoot);
    return JSON.parse(stripJson5(raw)) as Record<string, any>;
  }

  override async install(
    scope: string,
    creds: Record<string, string>,
    _yes: boolean,
  ): Promise<InstallResult> {
    const configDir = this.configDir(scope);
    const scriptsDir = this._scriptsDir(scope);
    const settingsPath = this._settingsPath(scope);

    // Phase 1: deploy the hook scripts.
    const deployed: string[] = [];
    for (const src of codeAgentScripts()) {
      const dst = join(scriptsDir, basename(src));
      copyFile(src, dst);
      deployed.push(dst);
      statusOk(`Deploy ${basename(src)}`, dst);
    }

    // Phase 2: load the template with absolute paths.
    const hooksTemplate = this._loadHooksTemplate(scriptsDir);

    // Phase 3: merge into settings.json.
    const settings = readJson(settingsPath);
    let merged = mergeHooks(settings, hooksTemplate, scriptsDir);
    // Phase 4: merge the MCP server config.
    merged = mergeMcpServers(
      merged,
      MCP_SERVER_NAME,
      MCP_SERVER_COMMAND,
      mcpServerArgs(),
      buildMcpEnv(creds, 'claude-code'),
    );
    writeJsonAtomic(settingsPath, merged);
    statusUpdated('settings.json', settingsPath);

    return new InstallResult({
      configDir,
      scriptsDir,
      files: deployed,
      configFiles: [settingsPath],
    });
  }

  override async uninstall(entry: Record<string, any>): Promise<void> {
    const scriptsDir: string = entry['scripts_dir'] ?? '';
    const configDir: string = entry['config_dir'] ?? '';
    const settingsPath = configDir ? join(configDir, 'settings.json') : '';

    // Phase 1: strip our hooks from settings.json.
    if (settingsPath && isFile(settingsPath)) {
      let settings = readJson(settingsPath);
      // Also strip the MCP server config.
      settings = stripMcpServers(settings, MCP_SERVER_NAME);
      const cleaned = removeHooksKey(settings, scriptsDir);
      if (Object.keys(cleaned).length > 0) {
        // Preserve other settings.
        writeJsonAtomic(settingsPath, cleaned);
        statusOk('Stripped hooks from settings.json', settingsPath);
      } else {
        // File is now empty or only had hooks.
        unlinkIfExists(settingsPath);
        statusOk('Removed settings.json', settingsPath);
      }
    }

    // Phase 2: remove the scripts directory.
    if (scriptsDir && isDir(scriptsDir)) {
      removeTree(scriptsDir);
      statusOk('Remove scripts dir', scriptsDir);
      // Clean up the empty parent (agentarts-memory/).
      const parent = dirname(scriptsDir);
      if (isDir(parent)) {
        tryRmdir(parent);
      }
      // Clean up the empty config dir (only if .claude/ is now empty).
      if (configDir) {
        removeIfEmpty(configDir);
      }
    }
  }
}

