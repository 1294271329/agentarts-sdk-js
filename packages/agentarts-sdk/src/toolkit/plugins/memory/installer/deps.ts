/**
 * Runtime dependency checks for the memory plugin installer.
 *
 * Ported from `agentarts/toolkit/plugins/memory/installer/deps.py`.
 *
 * Claude Code, Codex, and OpenCode launch the packaged MCP server
 * (`node <pkg>/dist/toolkit/plugins/memory/mcp/server.js`), which imports the
 * optional `@modelcontextprotocol/sdk` package. Hermes deploys a provider that
 * talks to the cloud SDK directly, so it does not need it.
 *
 * `@modelcontextprotocol/sdk` is an optional dependency of the SDK
 * (`optionalDependencies`). When a platform that needs the server is installed,
 * make sure the package is present next to the SDK that will launch the server.
 */

import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import { Console } from '../../../utils/common.js';
import { memoryModuleRoot } from '../resources.js';

/** Shared `Console` (rich `Console()` counterpart). */
export const console = new Console();

/** npm spec of the required MCP SDK. */
export const MCP_REQUIRED_SPEC = '@modelcontextprotocol/sdk';

/** Minimum supported major version of the MCP SDK. */
export const MCP_MIN_MAJOR_VERSION = 1;

/** Import specifier used for the availability probe. */
const MCP_ENTRY_SPECIFIER = '@modelcontextprotocol/sdk/server/mcp.js';

/** Platforms whose generated config launches the local MCP server. */
export const MCP_PLATFORMS: ReadonlySet<string> = new Set(['claude', 'codex', 'opencode']);

/** Return `true` when installing `target` requires the MCP server package. */
export function needsMcp(target: string): boolean {
  return MCP_PLATFORMS.has(target);
}

/** Run the availability probe, returning the module namespace or `null`. */
async function _tryImportMcp(): Promise<unknown | null> {
  try {
    return await import(MCP_ENTRY_SPECIFIER);
  } catch {
    return null;
  }
}

/** Installed version of the MCP SDK, or `null` when it cannot be read. */
function _installedVersion(): string | null {
  try {
    const require = createRequire(import.meta.url);
    let current = dirname(require.resolve(MCP_REQUIRED_SPEC));
    for (;;) {
      const candidate = join(current, 'package.json');
      if (existsSync(candidate)) {
        try {
          const data = JSON.parse(readFileSync(candidate, 'utf8')) as Record<string, any>;
          if (data['name'] === MCP_REQUIRED_SPEC && typeof data['version'] === 'string') {
            return data['version'];
          }
        } catch {
          return null;
        }
      }
      const parent = dirname(current);
      if (parent === current) {
        return null;
      }
      current = parent;
    }
  } catch {
    return null;
  }
}

/** Return `true` when a supported MCP SDK version is importable. */
export async function isMcpAvailable(): Promise<boolean> {
  if ((await _tryImportMcp()) === null) {
    return false;
  }

  const installed = _installedVersion();
  if (installed === null) {
    // Distribution metadata can be missing for vendored/editable installs.
    return true;
  }

  const major = Number.parseInt(installed.split('.', 1)[0] ?? '', 10);
  if (Number.isNaN(major)) {
    return true;
  }
  return major >= MCP_MIN_MAJOR_VERSION;
}

/** True when `name` resolves to an executable file inside one of the `PATH` entries. */
function _which(name: string): string | null {
  // On Windows prefer the shims that `CreateProcess`/cmd can actually launch.
  const extensions =
    process.platform === 'win32' ? ['.cmd', '.exe', '.bat', ''] : ['', '.sh'];
  const separator = process.platform === 'win32' ? ';' : ':';
  for (const directory of (process.env['PATH'] ?? '').split(separator)) {
    if (!directory) {
      continue;
    }
    for (const extension of extensions) {
      const candidate = join(directory, `${name}${extension}`);
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

/**
 * Build the command that installs the MCP SDK next to this package.
 *
 * Prefers npm (always shipped with Node.js) and targets the SDK package
 * directory, mirroring `pip install` into the running interpreter. pnpm-managed
 * workspaces often invoke their own package manager, so fall back to `pnpm`
 * when npm is unavailable.
 */
export function installCommand(): string[] | null {
  const packageRoot = _packageRoot();
  const npm = _which('npm');
  if (npm) {
    return [npm, 'install', '--prefix', packageRoot, '--no-save', MCP_REQUIRED_SPEC];
  }

  const pnpm = _which('pnpm');
  if (pnpm) {
    return [pnpm, 'add', '--dir', packageRoot, '--ignore-workspace-root-check', MCP_REQUIRED_SPEC];
  }

  return null;
}

/** Root directory of the `agentarts-sdk` package (`<pkg>/dist/..` or `<pkg>/src/..`). */
function _packageRoot(): string {
  try {
    return dirname(memoryModuleRoot());
  } catch {
    return process.cwd();
  }
}

/**
 * Install the MCP SDK if it is missing or older than the supported major.
 *
 * @returns `true` when a supported SDK is available afterwards.
 */
export async function ensureMcpInstalled(): Promise<boolean> {
  if (await isMcpAvailable()) {
    return true;
  }

  const command = installCommand();
  if (command === null) {
    console.print(
      `  [red]\u00d7[/red] Cannot install '${MCP_REQUIRED_SPEC}': npm and pnpm were not found.`,
    );
    console.print(
      `  Install it manually: [cyan]npm install "${MCP_REQUIRED_SPEC}"[/cyan]`,
    );
    return false;
  }

  console.print(`  Installing required dependency [cyan]${MCP_REQUIRED_SPEC}[/cyan] ...`);
  try {
    await runInstaller(command);
  } catch (error) {
    console.print(`  [red]\u00d7[/red] Failed to run installer: ${_errorMessage(error)}`);
    return false;
  }

  if (!(await isMcpAvailable())) {
    console.print(`  [red]\u00d7[/red] Failed to install '${MCP_REQUIRED_SPEC}'.`);
    console.print(
      `  Install it manually: [cyan]npm install "${MCP_REQUIRED_SPEC}"[/cyan]`,
    );
    return false;
  }

  console.print('  [green]\u221a[/green] Installed @modelcontextprotocol/sdk');
  return true;
}

/**
 * Run the installer command with inherited stdio (`subprocess.run(cmd)`).
 *
 * On Windows the command runs through the shell (`.cmd` shims such as `npm`
 * cannot be spawned directly by Node >= 20), so every argument is quoted.
 *
 * @returns The exit code.
 */
function runInstaller(command: string[]): Promise<number> {
  return new Promise<number>((resolvePromise, reject) => {
    const [program, ...args] = command;
    if (!program) {
      resolvePromise(1);
      return;
    }
    const child =
      process.platform === 'win32'
        ? spawn([program, ...args].map(_quoteShellArg).join(' '), {
            stdio: 'inherit',
            shell: true,
          })
        : spawn(program, args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) => resolvePromise(code ?? 1));
  });
}

/** Quote one command-line argument for `cmd.exe` when it contains spaces/quotes. */
function _quoteShellArg(value: string): string {
  if (!/[\s"]/.test(value)) {
    return value;
  }
  return `"${value.replace(/"/g, '\\"')}"`;
}

/** `str(exc)` counterpart. */
function _errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
