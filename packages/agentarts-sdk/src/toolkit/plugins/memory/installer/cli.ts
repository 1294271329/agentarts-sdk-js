/**
 * Callbacks for `agentarts memory install|uninstall`.
 *
 * Ported from
 * `agentarts/toolkit/plugins/memory/installer/cli.py`. These callbacks are
 * registered onto the shared `memoryApp` in
 * `agentarts-sdk/toolkit/cli/memory/commands`. The business logic is ported
 * from the original argparse-based `agentarts-memory` installer.
 *
 * Python raises `typer.Exit(code)`; here the callbacks return the process exit
 * code and the CLI layer assigns it to `process.exitCode`.
 */

import { existsSync } from 'node:fs';
import { platform as currentPlatform } from 'node:os';
import { join, normalize } from 'node:path';

import { Console, echoError, echoKeyValue, echoSuccess, echoWarning } from '../../../utils/common.js';

import {
  MCP_REQUIRED_SPEC,
  ensureMcpInstalled,
  needsMcp,
} from './deps.js';
import { detectAll, getPlatform } from './platforms/index.js';
import { hermesHome } from './platforms/hermes.js';
import {
  EscapeInterrupt,
  add,
  confirm,
  ensureCredentials,
  expand,
  find,
  listAll,
  remove,
  selectOne,
  setYes,
} from './utils.js';

/** Shared `Console` (rich `Console()` counterpart). */
export const console = new Console();

/** Supported installer targets. */
export const VALID_TARGETS: readonly string[] = ['hermes', 'claude', 'codex', 'opencode', 'openclaw'];

/**
 * Determine the install scope (project or global).
 */
async function _selectScope(platformName: string, yes: boolean): Promise<string> {
  const platform = getPlatform(platformName);
  if (platform && platform.fixedUserLevel) {
    return 'global';
  }
  if (yes) {
    return 'project';
  }
  const index = await selectOne(
    'Install scope',
    ['Project \u2014 this project only', 'Global \u2014 all projects'],
    0,
  );
  return index === 0 ? 'project' : 'global';
}

/**
 * Attempt to find and clean up files when the manifest entry is missing.
 */
function _degradedScan(target: string): void {
  const candidates: Record<string, string[]> = {
    hermes: [expand(join(hermesHome(), 'plugins', 'agentarts'))],
    claude: [
      expand('~/.claude/agentarts-memory'),
      join(process.cwd(), '.claude', 'agentarts-memory'),
    ],
    codex: [
      expand('~/.codex/agentarts-memory'),
      join(process.cwd(), '.codex', 'agentarts-memory'),
    ],
    opencode: [expand('~/.config/opencode/plugins/agentarts-memory-capture.ts')],
  };

  const found = candidates[target] ?? [];
  let anyFound = false;
  for (const path of found) {
    if (existsPath(path)) {
      anyFound = true;
      console.print(`  Found leftover: ${normalize(path)}`);
      if (currentPlatform() === 'win32') {
        console.print(
          `  Remove manually: [yellow]Remove-Item -Recurse -Force '${normalize(path)}'[/yellow]`,
        );
      } else {
        console.print(`  Remove manually: [yellow]rm -rf ${normalize(path)}[/yellow]`);
      }
    }
  }

  if (!anyFound) {
    console.print(`  No leftover ${target} files found.`);
  }
}

/** Handle the install flow. Returns the process exit code. */
export async function _doInstall(
  target: string | null,
  globalScope: boolean,
  yes: boolean,
): Promise<number> {
  if (target !== null && !VALID_TARGETS.includes(target)) {
    echoError(`Invalid target '${target}'. Choose from: ${VALID_TARGETS.join(', ')}`);
    return 2;
  }

  if (target === 'openclaw') {
    echoWarning('openclaw not yet implemented');
    return 0;
  }

  if (target === null) {
    const detected = detectAll(globalScope);
    if (detected.length === 0) {
      console.print('\nNo supported platforms detected.');
      console.print(
        'Install Claude Code, Codex, OpenCode, or Hermes Agent, ' +
          'then run [cyan]agentarts memory install[/cyan] again.',
      );
      return 1;
    }
    console.print('Detecting platforms...');
    for (const [, detectedPlatform] of detected) {
      console.print(`  [green]\u221a[/green] ${detectedPlatform.display}`);
    }
    const options = detected.map(([, detectedPlatform]) => detectedPlatform.display);
    const index = await selectOne('\nSelect platform', options, 0);
    target = detected[index]![0];
  }

  const platform = getPlatform(target);
  if (platform === null) {
    echoError(`Unknown platform '${target}'`);
    return 2;
  }

  if (needsMcp(target)) {
    console.print('\nChecking dependencies...');
    if (!(await ensureMcpInstalled())) {
      echoError(
        `Installation aborted: required dependency '${MCP_REQUIRED_SPEC}' is unavailable.`,
      );
      return 1;
    }
  }

  console.print('\nChecking credentials...');
  const creds = await ensureCredentials(yes);

  const scope = globalScope ? 'global' : await _selectScope(target, yes);

  console.print(`\nInstalling ${platform.display} (${scope})...`);
  const result = await platform.install(scope, creds, yes);

  add({
    platform: target,
    scope,
    config_dir: result.configDir,
    scripts_dir: result.scriptsDir,
    files: result.files,
    config_files: result.configFiles,
  });

  echoSuccess(`Install complete: ${platform.display} (${scope})`);
  echoKeyValue('Config dir', result.configDir);
  if (result.scriptsDir) {
    echoKeyValue('Scripts', result.scriptsDir);
  }
  echoKeyValue('Files', `${result.files.length} deployed`);
  if (result.configFiles.length > 0) {
    echoKeyValue('Config', result.configFiles.join(', '));
  }
  console.print('\nRestart the platform to activate.');
  return 0;
}

/** Handle the uninstall flow. Returns the process exit code. */
export async function _doUninstall(
  target: string | null,
  globalScope: boolean,
  yes: boolean,
): Promise<number> {
  if (target !== null && !VALID_TARGETS.includes(target)) {
    echoError(`Invalid target '${target}'. Choose from: ${VALID_TARGETS.join(', ')}`);
    return 2;
  }

  if (target === 'openclaw') {
    echoWarning('openclaw not yet implemented');
    return 0;
  }

  const scope = globalScope ? 'global' : null;

  let entry: Record<string, any> | null = null;
  if (target !== null) {
    entry = find(target, scope, null);
    if (entry === null) {
      console.print(`\nNo ${target} installation found in manifest.`);
      console.print('Attempting degraded scan...');
      _degradedScan(target);
      return 1;
    }
  } else {
    const allInstalls = listAll();
    if (allInstalls.length === 0) {
      console.print('\nNo installations found.');
      return 1;
    }
    console.print('\nInstalled platforms:');
    const options = allInstalls.map(
      (install) =>
        `${install['platform']} (${install['scope'] ?? '?'}) \u2014 ` +
        `${normalize(install['config_dir'] ?? '?')}`,
    );
    const index = await selectOne('Select installation to remove', options, 0);
    entry = allInstalls[index]!;
    target = entry['platform'];
  }

  const resolvedTarget = String(target);
  const platform = getPlatform(resolvedTarget);
  if (platform === null) {
    echoError(`Unknown platform '${resolvedTarget}'`);
    return 2;
  }

  if (
    !yes &&
    !(await confirm(`Remove ${platform.display} from ${normalize(entry['config_dir'] ?? '?')}?`, true))
  ) {
    console.print('[yellow]Cancelled.[/yellow]');
    return 0;
  }

  console.print(`\nUninstalling ${platform.display}...`);
  await platform.uninstall(entry);

  remove(resolvedTarget, entry['scope'] ?? '', entry['config_dir'] ?? '');

  echoSuccess(`Uninstall complete: ${platform.display}`);
  console.print('Restart the platform to apply changes.');
  return 0;
}

/** Options accepted by {@link installCmd}. */
export interface InstallCommandOptions {
  /** Platform (`hermes`, `claude`, `codex`, `opencode`, `openclaw`); detect when omitted. */
  target?: string | null;
  /** Install to user-level config. */
  globalScope?: boolean;
  /** Auto-confirm all prompts. */
  yes?: boolean;
}

/** Install the AgentArts Memory plugin for a supported AI agent. */
export async function installCmd(options: InstallCommandOptions = {}): Promise<number> {
  const yes = options.yes ?? false;
  setYes(yes);
  let code: number;
  try {
    code = await _doInstall(options.target ?? null, options.globalScope ?? false, yes);
  } catch (error) {
    if (error instanceof EscapeInterrupt) {
      console.print('\n[yellow]Cancelled.[/yellow]');
      code = 0;
    } else {
      throw error;
    }
  }
  return code;
}

/** Options accepted by {@link uninstallCmd}. */
export interface UninstallCommandOptions {
  /** Platform; select interactively when omitted. */
  target?: string | null;
  /** Limit to user-level installs. */
  globalScope?: boolean;
  /** Auto-confirm all prompts. */
  yes?: boolean;
}

/** Uninstall an AgentArts Memory plugin. */
export async function uninstallCmd(options: UninstallCommandOptions = {}): Promise<number> {
  const yes = options.yes ?? false;
  setYes(yes);
  let code: number;
  try {
    code = await _doUninstall(options.target ?? null, options.globalScope ?? false, yes);
  } catch (error) {
    if (error instanceof EscapeInterrupt) {
      console.print('\n[yellow]Cancelled.[/yellow]');
      code = 0;
    } else {
      throw error;
    }
  }
  return code;
}

/** True when `path` exists (Python `os.path.exists`). */
function existsPath(path: string): boolean {
  return existsSync(path);
}

