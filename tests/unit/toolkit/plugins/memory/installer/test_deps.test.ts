/**
 * Tests for installer runtime dependency checks.
 *
 * Ported 1:1 from `tests/unit/toolkit/plugins/memory/installer/test_deps.py`.
 *
 * Mock strategy (Python `monkeypatch` -> vitest):
 * - `monkeypatch.setattr(deps.importlib.util, "find_spec", ...)` -> the dynamic
 *   `import()` probe is replaced by `vi.mock("@modelcontextprotocol/sdk/server/mcp.js")`,
 *   whose factory throws while `mcpState.importOk` is `false`;
 * - `monkeypatch.setattr(deps, "version", ...)` -> `vi.mock("node:module")` with a
 *   `createRequire()` whose `resolve()` points at a temporary `package.json`
 *   (a queue of version directories makes "available after install" observable);
 * - `monkeypatch.setattr(deps.shutil, "which", ...)` -> a temporary directory on
 *   `PATH` holding fake `npm`/`pnpm` files (`_which` reads `PATH` directly);
 * - `monkeypatch.setattr(deps.subprocess, "run", ...)` -> `vi.mock("node:child_process")`
 *   with a `spawn()` fake that closes with a canned exit code (or errors);
 * - `monkeypatch.setattr(deps, ...)` is module-wide in Python; here `deps` is
 *   re-imported per test after `vi.resetModules()` so the mocked `node:module`
 *   factory is re-evaluated.
 *
 * Behaviour differences documented in the reply: the package manager is npm/pnpm
 * (not pip/uv), the required spec is `@modelcontextprotocol/sdk`, and the
 * supported major version starts at 1 (Python: mcp >= 2).
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { memoryModuleRoot } from 'agentarts-sdk/toolkit/plugins/memory/resources';

import {
  captureStdout,
  createTempDir,
  fakeChild,
  removeTempDir,
  restorePlatform,
  stubPlatform,
} from './_helpers.js';

const mcpState = vi.hoisted(() => ({
  /** `true` when the MCP entry point is importable (`importlib.util.find_spec`). */
  importOk: false,
  /** Directories holding a fake `package.json`, consumed in order. */
  resolveDirs: [] as string[],
  /** Number of `createRequire().resolve()` calls so far. */
  resolveCalls: 0,
}));

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => {
  if (!mcpState.importOk) {
    throw new Error("Cannot find module '@modelcontextprotocol/sdk/server/mcp.js'");
  }
  return { stub: true };
});

vi.mock('node:module', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:module')>();
  const createRequire = ((_filename: string | URL) => ({
    resolve: (_specifier: string): string => {
      const index = Math.min(mcpState.resolveCalls, mcpState.resolveDirs.length - 1);
      mcpState.resolveCalls += 1;
      const directory = mcpState.resolveDirs[index];
      if (directory === undefined) {
        // Python `importlib.metadata.PackageNotFoundError`.
        throw new Error('PackageNotFoundError: @modelcontextprotocol/sdk');
      }
      return `${directory}/index.js`;
    },
  })) as unknown as typeof actual.createRequire;
  return { ...actual, createRequire };
});

const childProcessMocks = vi.hoisted(() => ({ spawn: vi.fn() }));

vi.mock('node:child_process', () => ({ spawn: childProcessMocks.spawn }));

type DepsModule = typeof import('agentarts-sdk/toolkit/plugins/memory/installer/deps');

let tempDir: string;
let deps: DepsModule;

/** Create a directory whose `package.json` reports `version` for the MCP SDK. */
function createFakePackage(version: string): string {
  const directory = join(tempDir, `mcp-${version}`);
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    join(directory, 'package.json'),
    JSON.stringify({ name: '@modelcontextprotocol/sdk', version }),
    'utf8',
  );
  return directory;
}

/** Create a fake `PATH` entry holding executables named `names`. */
function createBinDir(names: string[]): string {
  const directory = join(tempDir, 'bin');
  mkdirSync(directory, { recursive: true });
  for (const name of names) {
    writeFileSync(join(directory, name), '', 'utf8');
  }
  return directory;
}

/**
 * `PATH` entry for the fake bin directory.
 *
 * The stubbed `linux` platform splits `PATH` on `:`, so a Windows drive letter
 * (`C:`) inside the entry would be split off; the cwd-relative form has no
 * colon and still resolves to the same files.
 */
function pathEntry(directory: string): string {
  return relative(process.cwd(), directory);
}

beforeEach(async () => {
  tempDir = createTempDir('agentarts-deps-');
  mcpState.importOk = false;
  mcpState.resolveDirs = [];
  mcpState.resolveCalls = 0;
  childProcessMocks.spawn.mockReset();
  // `_which` walks `PATH`; an empty entry list means "no package manager".
  vi.stubEnv('PATH', '');
  stubPlatform('linux');
  // The installer status messages are not asserted here (Python used `capsys`).
  captureStdout();
  vi.resetModules();
  deps = await import('agentarts-sdk/toolkit/plugins/memory/installer/deps');
});

afterEach(() => {
  restorePlatform();
  vi.unstubAllEnvs();
  removeTempDir(tempDir);
});

describe('TestNeedsMcp', () => {
  it('test_mcp_server_platforms_need_mcp', () => {
    for (const target of ['claude', 'codex', 'opencode']) {
      expect(deps.needsMcp(target)).toBe(true);
    }
  });

  it('test_other_platforms_do_not_need_mcp', () => {
    expect(deps.needsMcp('hermes')).toBe(false);
    expect(deps.needsMcp('openclaw')).toBe(false);
  });
});

describe('TestIsMcpAvailable', () => {
  it('test_missing_module', async () => {
    mcpState.importOk = false;

    expect(await deps.isMcpAvailable()).toBe(false);
  });

  it('test_supported_major_version', async () => {
    mcpState.importOk = true;
    mcpState.resolveDirs = [createFakePackage(`${deps.MCP_MIN_MAJOR_VERSION}.3.0`)];

    expect(await deps.isMcpAvailable()).toBe(true);
  });

  it('test_older_major_version_is_too_old', async () => {
    mcpState.importOk = true;
    mcpState.resolveDirs = [createFakePackage(`${deps.MCP_MIN_MAJOR_VERSION - 1}.12.0`)];

    expect(await deps.isMcpAvailable()).toBe(false);
  });

  it('test_missing_distribution_metadata_is_tolerated', async () => {
    mcpState.importOk = true;
    // `resolve()` throws -> Python `PackageNotFoundError` metadata branch.
    mcpState.resolveDirs = [];

    expect(await deps.isMcpAvailable()).toBe(true);
  });
});

describe('TestInstallCommand', () => {
  it('test_prefers_npm', () => {
    const binDir = pathEntry(createBinDir(['npm', 'pnpm']));
    vi.stubEnv('PATH', binDir);

    const command = deps.installCommand();

    expect(command).not.toBeNull();
    expect(command![0]).toBe(join(binDir, 'npm'));
    expect(command!.slice(1, 4)).toEqual(['install', '--prefix', dirname(memoryModuleRoot())]);
    expect(command!.slice(4, 5)).toEqual(['--no-save']);
    expect(command![command!.length - 1]).toBe(deps.MCP_REQUIRED_SPEC);
  });

  it('test_falls_back_to_pnpm', () => {
    const binDir = pathEntry(createBinDir(['pnpm']));
    vi.stubEnv('PATH', binDir);

    const command = deps.installCommand();

    expect(command).not.toBeNull();
    expect(command![0]).toBe(join(binDir, 'pnpm'));
    expect(command!.slice(1, 3)).toEqual(['add', '--dir']);
    expect(command).toContain('--ignore-workspace-root-check');
    expect(command).toContain(dirname(memoryModuleRoot()));
    expect(command![command!.length - 1]).toBe(deps.MCP_REQUIRED_SPEC);
  });

  it('test_returns_none_without_installer', () => {
    expect(deps.installCommand()).toBeNull();
  });
});

describe('TestEnsureMcpInstalled', () => {
  it('test_noop_when_available', async () => {
    mcpState.importOk = true;
    mcpState.resolveDirs = [createFakePackage(`${deps.MCP_MIN_MAJOR_VERSION}.3.0`)];

    expect(await deps.ensureMcpInstalled()).toBe(true);
    expect(childProcessMocks.spawn).not.toHaveBeenCalled();
  });

  it('test_runs_installer_when_missing', async () => {
    // First probe sees the old version, the probe after the install sees the
    // supported one (Python toggled `state["available"]` inside `fake_run`).
    mcpState.importOk = true;
    mcpState.resolveDirs = [
      createFakePackage(`${deps.MCP_MIN_MAJOR_VERSION - 1}.0.0`),
      createFakePackage(`${deps.MCP_MIN_MAJOR_VERSION}.3.0`),
    ];
    const binDir = pathEntry(createBinDir(['npm']));
    vi.stubEnv('PATH', binDir);
    childProcessMocks.spawn.mockImplementation(() => fakeChild(0));

    expect(await deps.ensureMcpInstalled()).toBe(true);

    expect(childProcessMocks.spawn).toHaveBeenCalledTimes(1);
    const [program, args, options] = childProcessMocks.spawn.mock.calls[0] as [
      string,
      string[],
      Record<string, unknown>,
    ];
    expect(program).toBe(join(binDir, 'npm'));
    expect(args).toEqual([
      'install',
      '--prefix',
      dirname(memoryModuleRoot()),
      '--no-save',
      deps.MCP_REQUIRED_SPEC,
    ]);
    expect(options).toEqual({ stdio: 'inherit' });
  });

  it('test_returns_false_on_installer_failure', async () => {
    // The installed distribution stays older than the supported major, so the
    // post-install probe keeps failing (Python: `returncode=1`).
    mcpState.importOk = true;
    mcpState.resolveDirs = [createFakePackage(`${deps.MCP_MIN_MAJOR_VERSION - 1}.0.0`)];
    const binDir = pathEntry(createBinDir(['npm']));
    vi.stubEnv('PATH', binDir);
    childProcessMocks.spawn.mockImplementation(() => fakeChild(1));

    expect(await deps.ensureMcpInstalled()).toBe(false);
    expect(childProcessMocks.spawn).toHaveBeenCalledTimes(1);
  });

  it('test_returns_false_when_installer_cannot_run', async () => {
    mcpState.importOk = true;
    mcpState.resolveDirs = [createFakePackage(`${deps.MCP_MIN_MAJOR_VERSION - 1}.0.0`)];
    const binDir = pathEntry(createBinDir(['npm']));
    vi.stubEnv('PATH', binDir);
    // Python `OSError("cannot execute")` -> `spawn()` emits `error`.
    childProcessMocks.spawn.mockImplementation(() => fakeChild(1, new Error('cannot execute')));

    expect(await deps.ensureMcpInstalled()).toBe(false);
  });

  it('test_returns_false_when_no_installer', async () => {
    mcpState.importOk = true;
    mcpState.resolveDirs = [createFakePackage(`${deps.MCP_MIN_MAJOR_VERSION - 1}.0.0`)];

    expect(await deps.ensureMcpInstalled()).toBe(false);
    expect(childProcessMocks.spawn).not.toHaveBeenCalled();
  });
});
