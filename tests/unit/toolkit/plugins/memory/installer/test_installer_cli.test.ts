/**
 * Tests for the `agentarts memory install|uninstall` callbacks.
 *
 * Ported 1:1 from
 * `tests/unit/toolkit/plugins/memory/installer/test_installer_cli.py`.
 *
 * Mock strategy (Python `unittest.mock.patch` → vitest):
 * - `patch.object(cli, "get_platform")` / `patch.object(cli, "add")` → the real
 *   adapters run against a temporary `HOME` instead of a `MagicMock` platform,
 *   so the assertions look at the deployed files and the manifest entry (the
 *   observable effect of `platform.install` / `add`);
 * - `patch.object(cli, "ensure_mcp_installed")` → `vi.mock` of the `deps` module
 *   with `ensureMcpInstalled` replaced by a `vi.fn()`; the other exports
 *   (`needsMcp`, `MCP_REQUIRED_SPEC`) stay real, so no npm/pnpm process is ever
 *   spawned;
 * - `patch.object(cli, "_do_install", side_effect=cli.EscapeInterrupt())` →
 *   the escape is produced by the real prompt path: no credentials are set, the
 *   readline question raises `EscapeInterrupt`, and `installCmd` must catch it
 *   and return 0;
 * - `capsys.readouterr().out` → a `process.stdout` spy plus the recorded prompt
 *   texts.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  VALID_TARGETS,
  _doInstall,
  _doUninstall,
  installCmd,
} from 'agentarts-sdk/toolkit/plugins/memory/installer/cli';
import {
  ENV_API_KEY,
  ENV_REGION,
  ENV_SPACE_ID,
  EscapeInterrupt,
  expand,
  find,
  isDir,
  isFile,
  setYes,
} from 'agentarts-sdk/toolkit/plugins/memory/installer/utils';

import {
  captureStdout,
  createTempDir,
  removeTempDir,
  restorePlatform,
  stubHome,
  stubPlatform,
  type StdoutCapture,
} from './_helpers.js';

const depsMocks = vi.hoisted(() => ({ ensureMcpInstalled: vi.fn() }));

vi.mock('agentarts-sdk/toolkit/plugins/memory/installer/deps', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('agentarts-sdk/toolkit/plugins/memory/installer/deps')>();
  return { ...actual, ensureMcpInstalled: depsMocks.ensureMcpInstalled };
});

const promptMocks = vi.hoisted(() => ({
  /** Canned prompt answers, consumed in order; an empty queue fails the test. */
  replies: [] as Array<{ line?: string; escape?: boolean }>,
  /** Recorded prompt texts (`sys.stdin` prompts are not written to stdout). */
  prompts: [] as string[],
  /** Error thrown on the readline path when the user hits ESC. */
  escapeError: null as Error | null,
}));

vi.mock('node:readline/promises', () => ({
  createInterface: () => ({
    question: async (prompt: string): Promise<string> => {
      promptMocks.prompts.push(String(prompt));
      const reply = promptMocks.replies.shift();
      if (reply === undefined) {
        throw new Error(`unexpected prompt: ${prompt}`);
      }
      if (reply.escape) {
        throw promptMocks.escapeError ?? new Error('escape');
      }
      return reply.line ?? '';
    },
    close: () => undefined,
  }),
}));

let home: string;
let stdout: StdoutCapture;

/** Everything the CLI printed, including the interactive prompt texts. */
function out(): string {
  return stdout.text() + promptMocks.prompts.join('\n');
}

/** Redirect HOME to the temp dir and set valid credentials. */
function setHomeAndCreds(): void {
  vi.stubEnv(ENV_SPACE_ID, 'test-space-12345');
  vi.stubEnv(ENV_API_KEY, 'test-api-key-abcdef-123456');
  vi.stubEnv(ENV_REGION, 'cn-north-4');
}

beforeEach(() => {
  home = createTempDir('agentarts-cli-');
  stubHome(home);
  // Python's suite runs on Linux: keeps the Hermes home and the shell-rc branch
  // deterministic (no `setx` on a Windows checkout).
  stubPlatform('linux');
  vi.stubEnv('HERMES_HOME', '');
  vi.stubEnv('LOCALAPPDATA', '');
  stdout = captureStdout();
  promptMocks.replies = [];
  promptMocks.prompts = [];
  promptMocks.escapeError = null;
  depsMocks.ensureMcpInstalled.mockReset();
  depsMocks.ensureMcpInstalled.mockResolvedValue(true);
  setYes(false);
});

afterEach(() => {
  restorePlatform();
  vi.unstubAllEnvs();
  removeTempDir(home);
});

// ── targets ──────────────────────────────────────────────────────────

describe('TestTargets', () => {
  it('test_valid_targets', () => {
    expect(VALID_TARGETS).toEqual(['hermes', 'claude', 'codex', 'opencode', 'openclaw']);
  });
});

// ── openclaw placeholder ────────────────────────────────────────────

describe('TestOpenClawPlaceholder', () => {
  it('test_install_openclaw', async () => {
    expect(await _doInstall('openclaw', false, false)).toBe(0);
    expect(out()).toContain('not yet implemented');
  });

  it('test_uninstall_openclaw', async () => {
    expect(await _doUninstall('openclaw', false, false)).toBe(0);
    expect(out()).toContain('not yet implemented');
  });
});

// ── invalid target ──────────────────────────────────────────────────

describe('TestInvalidTarget', () => {
  it('test_install_invalid', async () => {
    expect(await _doInstall('bogus', false, false)).toBe(2);
  });

  it('test_uninstall_invalid', async () => {
    expect(await _doUninstall('bogus', false, false)).toBe(2);
  });
});

// ── no detection / no installs ─────────────────────────────────────

describe('TestNoTargets', () => {
  it('test_install_no_target_no_detection', async () => {
    setHomeAndCreds();
    // No ~/.claude, ~/.codex, ~/.hermes, ~/.config/opencode.
    expect(await _doInstall(null, false, true)).toBe(1);
    expect(out()).toContain('No supported platforms detected');
  });

  it('test_uninstall_no_target_no_installs', async () => {
    setHomeAndCreds();
    expect(await _doUninstall(null, false, true)).toBe(1);
    expect(out()).toContain('No installations found');
  });

  it('test_uninstall_target_not_found', async () => {
    setHomeAndCreds();
    expect(await _doUninstall('hermes', false, true)).toBe(1);
    expect(out()).toContain('No hermes installation found');
  });
});

// ── end-to-end: install + uninstall hermes ───────────────────────────

describe('TestEndToEndHermes', () => {
  it('test_install_hermes_yes', async () => {
    setHomeAndCreds();
    expect(await _doInstall('hermes', false, true)).toBe(0);

    const pluginDir = expand('~/.hermes/plugins/agentarts');
    expect(isDir(pluginDir)).toBe(true);
    expect(isFile(join(pluginDir, 'provider.ts')) || isFile(join(pluginDir, 'provider.js'))).toBe(
      true,
    );

    const found = find('hermes');
    expect(found).not.toBeNull();
    // hermes is fixed_user_level.
    expect(found!['scope']).toBe('global');
  });

  it('test_install_hermes_global_yes', async () => {
    setHomeAndCreds();
    expect(await _doInstall('hermes', true, true)).toBe(0);

    // hermes is fixed_user_level, so scope should be "global" regardless.
    const found = find('hermes');
    expect(found).not.toBeNull();
    expect(found!['scope']).toBe('global');
  });

  it('test_uninstall_hermes_after_install', async () => {
    setHomeAndCreds();

    // Install first.
    await _doInstall('hermes', true, true);

    // Uninstall.
    expect(await _doUninstall('hermes', true, true)).toBe(0);

    // Verify cleaned.
    const pluginDir = expand('~/.hermes/plugins/agentarts');
    expect(existsSync(pluginDir)).toBe(false);
    expect(find('hermes')).toBeNull();
  });
});

// ── end-to-end: install + uninstall claude ──────────────────────────

describe('TestEndToEndClaude', () => {
  it('test_install_claude_global_yes', async () => {
    setHomeAndCreds();
    expect(await _doInstall('claude', true, true)).toBe(0);

    const scriptsDir = join(expand('~/.claude'), 'agentarts-memory', 'scripts');
    expect(isDir(scriptsDir)).toBe(true);

    const settingsPath = join(expand('~/.claude'), 'settings.json');
    expect(isFile(settingsPath)).toBe(true);

    const found = find('claude');
    expect(found).not.toBeNull();
    expect(found!['scope']).toBe('global');
  });

  it('test_uninstall_claude_after_install', async () => {
    setHomeAndCreds();

    await _doInstall('claude', true, true);
    expect(await _doUninstall('claude', true, true)).toBe(0);

    const scriptsDir = join(expand('~/.claude'), 'agentarts-memory', 'scripts');
    expect(existsSync(scriptsDir)).toBe(false);
    expect(find('claude')).toBeNull();
  });

  it('test_server_dependency_hint_printed', async () => {
    setHomeAndCreds();
    await _doInstall('claude', true, true);
    // Server hint removed; MCP config is written by the installer instead.
    expect(out()).toContain('Restart');
  });
});

// ── runtime dependencies ────────────────────────────────────────────

describe('TestInstallDependencies', () => {
  it('test_mcp_platform_installs_dependency', async () => {
    setHomeAndCreds();

    expect(await _doInstall('claude', true, true)).toBe(0);

    expect(depsMocks.ensureMcpInstalled).toHaveBeenCalledTimes(1);
    expect(depsMocks.ensureMcpInstalled).toHaveBeenCalledWith();
    // `platform.install` ran exactly once (it wrote the manifest entry).
    expect(find('claude')).not.toBeNull();
  });

  it('test_hermes_skips_dependency_install', async () => {
    setHomeAndCreds();

    expect(await _doInstall('hermes', false, true)).toBe(0);

    expect(depsMocks.ensureMcpInstalled).not.toHaveBeenCalled();
    expect(find('hermes')).not.toBeNull();
  });

  it('test_dependency_failure_aborts_install', async () => {
    setHomeAndCreds();
    depsMocks.ensureMcpInstalled.mockResolvedValue(false);

    expect(await _doInstall('claude', true, true)).toBe(1);

    // `platform.install` was not called.
    expect(find('claude')).toBeNull();
    expect(existsSync(join(expand('~/.claude'), 'agentarts-memory'))).toBe(false);
  });
});

// ── escape interrupt ───────────────────────────────────────────────

describe('TestEscapeInterrupt', () => {
  it('test_install_catches_escape', async () => {
    // Missing credentials in interactive mode: the prompt receives ESC and the
    // callback must report "Cancelled" instead of throwing.
    vi.stubEnv(ENV_SPACE_ID, '');
    vi.stubEnv(ENV_API_KEY, '');
    vi.stubEnv(ENV_REGION, '');
    promptMocks.escapeError = new EscapeInterrupt();
    promptMocks.replies = [{ escape: true }];

    const code = await installCmd({ target: 'hermes', globalScope: true, yes: false });

    expect(code).toBe(0);
    expect(out()).toContain('Cancelled');
  });
});
