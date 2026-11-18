/**
 * OpenCode platform adapter.
 *
 * Ported from
 * `agentarts/toolkit/plugins/memory/installer/platforms/opencode.py`.
 *
 * Deploys the TypeScript plugin (`agentarts-memory-capture.ts`) to
 * `<configDir>/plugins/` and slash commands (`recall.md`, `remember.md`) to
 * `<configDir>/commands/`.
 *
 * Registers the plugin in `<configDir>/opencode.json` under the `plugin` array
 * (deduplicated), and adds the `mcp.agentarts_memory` server entry.
 *
 * Config dir:
 * - project: `.opencode/`
 * - global:  `~/.config/opencode/`
 */

import { basename, join } from 'node:path';

import {
  MCP_SERVER_NAME,
  MCP_SERVER_COMMAND,
  buildMcpEnv,
  copyFile,
  expand,
  isFile,
  mergeOpencodeMcp,
  mcpServerArgs,
  opencodeFiles,
  readJson,
  removeIfEmpty,
  statusOk,
  statusUpdated,
  stripOpencodeMcp,
  unlinkIfExists,
  writeJsonAtomic,
} from '../utils.js';

import { InstallResult, Platform } from './base.js';

/** The relative path registered in `opencode.json`. */
export const PLUGIN_ENTRY = './plugins/agentarts-memory-capture.ts';

/** OpenCode platform adapter. */
export class OpenCodePlatform extends Platform {
  override name = 'opencode';
  override display = 'OpenCode';
  override fixedUserLevel = false;

  override detect(): boolean {
    return Platform._dirExists('~/.config/opencode');
  }

  override configDir(scope: string): string {
    if (scope === 'global') {
      return expand('~/.config/opencode');
    }
    return join(process.cwd(), '.opencode');
  }

  private _opencodeJsonPath(scope: string): string {
    return join(this.configDir(scope), 'opencode.json');
  }

  override async install(
    scope: string,
    creds: Record<string, string>,
    _yes: boolean,
  ): Promise<InstallResult> {
    const configDir = this.configDir(scope);
    const jsonPath = this._opencodeJsonPath(scope);

    const deployed: string[] = [];

    // Phase 1: deploy the TS plugin and slash commands.
    for (const [relativeTarget, sourcePath] of Object.entries(opencodeFiles())) {
      // Split on "/" so `join` uses OS-native separators instead of embedding
      // forward slashes.
      const dst = join(configDir, ...relativeTarget.split('/'));
      copyFile(sourcePath, dst);
      deployed.push(dst);
      statusOk(`Deploy ${basename(dst)}`, dst);
    }

    // Phase 2: register the plugin in opencode.json.
    const config = readJson(jsonPath);
    let pluginList: any[] = config['plugin'] ?? [];

    // Dedup: remove the existing entry first, then add.
    pluginList = pluginList.filter((entry) => entry !== PLUGIN_ENTRY);
    pluginList.push(PLUGIN_ENTRY);

    config['plugin'] = pluginList;
    // Phase 3: merge the MCP server config.
    const merged = mergeOpencodeMcp(
      config,
      MCP_SERVER_NAME,
      [MCP_SERVER_COMMAND, ...mcpServerArgs()],
      buildMcpEnv(creds, 'opencode'),
    );
    writeJsonAtomic(jsonPath, merged);
    statusUpdated('opencode.json', jsonPath);

    return new InstallResult({
      configDir,
      scriptsDir: '', // opencode has no scripts dir
      files: deployed,
      configFiles: [jsonPath],
    });
  }

  override async uninstall(entry: Record<string, any>): Promise<void> {
    const configDir: string = entry['config_dir'] ?? '';
    const jsonPath = configDir ? join(configDir, 'opencode.json') : '';

    // Phase 1: remove our entry from opencode.json.
    if (jsonPath && isFile(jsonPath)) {
      let config = readJson(jsonPath);
      const pluginList: any[] = (config['plugin'] ?? []).filter(
        (plugin: any) => plugin !== PLUGIN_ENTRY,
      );

      config = stripOpencodeMcp(config, MCP_SERVER_NAME);
      if (pluginList.length > 0) {
        config['plugin'] = pluginList;
        writeJsonAtomic(jsonPath, config);
        statusOk('Stripped plugin entry from opencode.json', jsonPath);
      } else {
        delete config['plugin'];
        if (Object.keys(config).length > 0) {
          writeJsonAtomic(jsonPath, config);
          statusOk('Removed plugin entry from opencode.json', jsonPath);
        } else {
          unlinkIfExists(jsonPath);
          statusOk('Removed opencode.json', jsonPath);
        }
      }
    }

    // Phase 2: delete the deployed files.
    if (configDir) {
      const filesToRemove = [
        join(configDir, 'plugins', 'agentarts-memory-capture.ts'),
        join(configDir, 'commands', 'recall.md'),
        join(configDir, 'commands', 'remember.md'),
      ];
      for (const file of filesToRemove) {
        if (isFile(file)) {
          unlinkIfExists(file);
          statusOk(`Remove ${basename(file)}`, file);
        }
      }

      // Phase 3: clean up empty directories.
      for (const sub of ['commands', 'plugins']) {
        removeIfEmpty(join(configDir, sub));
      }
      removeIfEmpty(configDir);
    }
  }
}
