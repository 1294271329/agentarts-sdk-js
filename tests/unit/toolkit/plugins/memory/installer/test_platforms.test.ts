/**
 * Tests for the platform adapters.
 *
 * Ported 1:1 from `tests/unit/toolkit/plugins/memory/installer/test_platforms.py`.
 *
 * Mock strategy:
 * - `monkeypatch.setenv("HOME", str(tmp_path))` → `stubHome()` (HOME +
 *   USERPROFILE) plus `stubPlatform("linux")` in `beforeEach`, which reproduces
 *   the Linux CI the Python suite assumes (and keeps `%LOCALAPPDATA%\hermes`
 *   from winning on a Windows checkout);
 * - `monkeypatch.setattr(sys, "platform", ...)` → `stubPlatform()`; the Windows
 *   Hermes-home cases are the only ones overriding the default;
 * - `monkeypatch.setattr("os.path.dirname", ...)` (Windows path escaping) →
 *   a mixed-separator `scriptsDir`, which makes `dirname()` keep a backslash on
 *   every host, so the `.replace("\\", "/")` normalisation is exercised
 *   identically on Windows and POSIX;
 * - private helpers (`_loadHooksTemplate`, `_degradedScan`) are module/TS
 *   private; the template loader is reached through a structural cast and
 *   `_degradedScan` through its only caller (`_doUninstall`), asserting the
 *   user-visible "Found leftover" output.
 *
 * Behaviour differences documented in the reply: the deployed Hermes files are
 * `provider.ts`/`provider.js` + `index.ts`/`index.js` instead of
 * `provider.py`/`__init__.py`, and `statusOk`/`statusUpdated` output is captured
 * instead of `capsys`.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { _doUninstall } from 'agentarts-sdk/toolkit/plugins/memory/installer/cli';
import { ClaudePlatform } from 'agentarts-sdk/toolkit/plugins/memory/installer/platforms/claude';
import { CodexPlatform } from 'agentarts-sdk/toolkit/plugins/memory/installer/platforms/codex';
import {
  HermesPlatform,
  hermesHome,
} from 'agentarts-sdk/toolkit/plugins/memory/installer/platforms/hermes';
import {
  PLATFORMS,
  detectAll,
  getPlatform,
} from 'agentarts-sdk/toolkit/plugins/memory/installer/platforms/index';
import { OpenCodePlatform } from 'agentarts-sdk/toolkit/plugins/memory/installer/platforms/opencode';
import {
  ENV_API_KEY,
  ENV_REGION,
  ENV_SPACE_ID,
  MCP_SERVER_COMMAND,
  add,
  expand,
  find,
  isDir,
  isFile,
  listAll,
  remove,
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

let home: string;
let stdout: StdoutCapture;

beforeEach(() => {
  home = createTempDir('agentarts-platforms-');
  stubHome(home);
  // Python's suite runs on Linux: make the Hermes home resolution and the
  // shell-rc branch deterministic on every host.
  stubPlatform('linux');
  vi.stubEnv('HERMES_HOME', '');
  vi.stubEnv('LOCALAPPDATA', '');
  stdout = captureStdout();
});

afterEach(() => {
  restorePlatform();
  vi.unstubAllEnvs();
  removeTempDir(home);
});

/** Credentials used by every install round-trip. */
function makeCreds(): Record<string, string> {
  return {
    [ENV_SPACE_ID]: 'test-space-12345',
    [ENV_API_KEY]: 'test-api-key-abcdef-123456',
    [ENV_REGION]: 'cn-north-4',
  };
}

/** Read a JSON file. */
function readJsonFile(path: string): Record<string, any> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, any>;
}

/** Count the hook entries of a hooks mapping (Claude settings.json / hooks.json). */
function countHooks(hooks: Record<string, any[]>): number {
  let total = 0;
  for (const groups of Object.values(hooks)) {
    for (const group of groups ?? []) {
      total += (group['hooks'] ?? []).length;
    }
  }
  return total;
}

/** Iterate all hooks of a hooks mapping. */
function allHooks(hooks: Record<string, any[]>): Array<Record<string, any>> {
  const result: Array<Record<string, any>> = [];
  for (const groups of Object.values(hooks)) {
    for (const group of groups ?? []) {
      for (const hook of (group['hooks'] ?? []) as Array<Record<string, any>>) {
        result.push(hook);
      }
    }
  }
  return result;
}

/** Access the TS-private `_loadHooksTemplate` (Python `p._load_hooks_template`). */
interface TemplateLoader {
  _loadHooksTemplate(scriptsDir: string): Record<string, any>;
}

function loadHooksTemplate(platform: ClaudePlatform | CodexPlatform, scriptsDir: string) {
  return (platform as unknown as TemplateLoader)._loadHooksTemplate(scriptsDir);
}

// ── Registry tests ──────────────────────────────────────────────────

describe('TestRegistry', () => {
  it('test_get_hermes', () => {
    const platform = getPlatform('hermes');

    expect(platform).not.toBeNull();
    expect(platform instanceof HermesPlatform).toBe(true);
  });

  it('test_get_unknown', () => {
    expect(getPlatform('bogus')).toBeNull();
  });

  it('test_hermes_in_registry', () => {
    expect('hermes' in PLATFORMS).toBe(true);
  });

  it('test_detect_all_with_hermes', () => {
    mkdirSync(expand('~/.hermes'), { recursive: true });

    const detected = detectAll(false);

    expect(detected.map(([name]) => name)).toContain('hermes');
  });

  it('test_detect_all_empty', () => {
    expect(detectAll(false)).toEqual([]);
  });
});

// ── Hermes round-trip ───────────────────────────────────────────────

describe('TestHermesRoundTrip', () => {
  it('test_install_deploys_files', async () => {
    const platform = new HermesPlatform();
    const creds = makeCreds();

    const result = await platform.install('global', creds, true);

    const pluginDir = expand('~/.hermes/plugins/agentarts');
    expect(isDir(pluginDir)).toBe(true);

    // 3 files deployed (provider + manifest + package entry).
    const files = readdirSync(pluginDir);
    expect(files).toHaveLength(3);
    expect(files).toContain('plugin.yaml');
    expect(files.some((name) => /^provider\.(ts|js)$/.test(name))).toBe(true);
    expect(files.some((name) => /^index\.(ts|js)$/.test(name))).toBe(true);
    expect(result.files).toHaveLength(3);

    // .env written with all credentials.
    const envPath = expand('~/.hermes/.env');
    expect(isFile(envPath)).toBe(true);
    const envContent = readFileSync(envPath, 'utf8');
    expect(envContent).toContain(ENV_API_KEY);
    expect(envContent).toContain('test-api-key-abcdef-123456');
    expect(envContent).toContain(ENV_SPACE_ID);
    expect(envContent).toContain('test-space-12345');
    expect(envContent).toContain(ENV_REGION);
    expect(envContent).toContain('cn-north-4');

    // config.yaml has the memory provider activated.
    const configYamlPath = expand('~/.hermes/config.yaml');
    expect(isFile(configYamlPath)).toBe(true);
    expect(readFileSync(configYamlPath, 'utf8')).toContain('provider: agentarts');
    expect(result.configFiles).toContain(configYamlPath);

    // InstallResult.
    expect(result.configDir).toBe(pluginDir);
    expect(result.configFiles).toContain(envPath);
  });

  it('test_uninstall_cleans_everything', async () => {
    const platform = new HermesPlatform();
    const creds = makeCreds();

    await platform.install('global', creds, true);

    const pluginDir = expand('~/.hermes/plugins/agentarts');
    expect(isDir(pluginDir)).toBe(true);
    expect(isFile(expand('~/.hermes/.env'))).toBe(true);

    await platform.uninstall({});

    // Plugin dir gone.
    expect(existsSync(pluginDir)).toBe(false);
    // .env gone (all keys stripped, so file removed).
    expect(existsSync(expand('~/.hermes/.env'))).toBe(false);

    // config.yaml memory provider deactivated (empty string).
    const configYamlPath = expand('~/.hermes/config.yaml');
    expect(isFile(configYamlPath)).toBe(true);
    expect(readFileSync(configYamlPath, 'utf8')).toContain("provider: ''");
  });

  it('test_install_idempotent', async () => {
    const platform = new HermesPlatform();
    const creds = makeCreds();

    await platform.install('global', creds, true);
    await platform.install('global', creds, true);

    const pluginDir = expand('~/.hermes/plugins/agentarts');
    const files = readdirSync(pluginDir);
    expect(files.filter((name) => /\.(ts|js|yaml)$/.test(name))).toHaveLength(3);

    const envContent = readFileSync(expand('~/.hermes/.env'), 'utf8');
    expect(countOccurrences(envContent, ENV_API_KEY)).toBe(1);
    expect(countOccurrences(envContent, ENV_SPACE_ID)).toBe(1);
    expect(countOccurrences(envContent, ENV_REGION)).toBe(1);
  });

  it('test_config_dir_always_plugin_dir', () => {
    const platform = new HermesPlatform();

    expect(platform.configDir('project')).toBe(platform.configDir('global'));
    expect(platform.fixedUserLevel).toBe(true);
  });

  it('test_detect_returns_false_for_missing', () => {
    expect(new HermesPlatform().detect()).toBe(false);
  });

  it('test_detect_returns_true_when_exists', () => {
    mkdirSync(expand('~/.hermes'), { recursive: true });

    expect(new HermesPlatform().detect()).toBe(true);
  });
});

/** `str.count(needle)` counterpart. */
function countOccurrences(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

// ── Hermes home resolution ──────────────────────────────────────────

describe('TestHermesHomeResolution', () => {
  it('test_default_fallback', () => {
    // Without HERMES_HOME or Windows env, returns ~/.hermes.
    vi.stubEnv('HERMES_HOME', '');
    vi.stubEnv('LOCALAPPDATA', '');
    stubPlatform('linux');

    expect(hermesHome()).toBe('~/.hermes');
  });

  it('test_hermes_home_env_var', () => {
    // HERMES_HOME env var takes top priority.
    const custom = join(home, 'custom-hermes');
    vi.stubEnv('HERMES_HOME', custom);
    stubPlatform('linux');

    expect(hermesHome()).toBe(custom);
  });

  it('test_hermes_home_env_overrides_windows', () => {
    // HERMES_HOME wins even on Windows.
    const custom = join(home, 'custom-hermes');
    vi.stubEnv('HERMES_HOME', custom);
    vi.stubEnv('LOCALAPPDATA', home);
    stubPlatform('win32');

    expect(hermesHome()).toBe(custom);
  });

  it('test_windows_localappdata', () => {
    // On Windows without HERMES_HOME, uses %LOCALAPPDATA%\hermes.
    vi.stubEnv('HERMES_HOME', '');
    vi.stubEnv('LOCALAPPDATA', home);
    stubPlatform('win32');

    expect(hermesHome()).toBe(join(home, 'hermes'));
  });

  it('test_windows_no_localappdata_falls_back', () => {
    // On Windows without LOCALAPPDATA, falls back to ~/.hermes.
    vi.stubEnv('HERMES_HOME', '');
    vi.stubEnv('LOCALAPPDATA', '');
    stubPlatform('win32');

    expect(hermesHome()).toBe('~/.hermes');
  });

  it('test_detect_with_hermes_home_env', () => {
    // detect() finds Hermes when HERMES_HOME points to a real dir.
    const custom = join(home, 'custom-hermes');
    vi.stubEnv('HERMES_HOME', custom);
    stubPlatform('linux');
    mkdirSync(custom, { recursive: true });

    expect(new HermesPlatform().detect()).toBe(true);
  });

  it('test_detect_windows_localappdata', () => {
    // detect() finds Hermes at %LOCALAPPDATA%\hermes on Windows.
    vi.stubEnv('HERMES_HOME', '');
    vi.stubEnv('LOCALAPPDATA', home);
    stubPlatform('win32');
    mkdirSync(join(home, 'hermes'), { recursive: true });

    expect(new HermesPlatform().detect()).toBe(true);
  });

  it('test_detect_windows_ignores_userprofile_dot_hermes', () => {
    // On Windows native, ~/.hermes is the wrong path — must not match.
    vi.stubEnv('HERMES_HOME', '');
    vi.stubEnv('LOCALAPPDATA', home);
    stubPlatform('win32');
    mkdirSync(expand('~/.hermes'), { recursive: true });

    expect(new HermesPlatform().detect()).toBe(false);
  });

  it('test_install_uses_hermes_home_env', async () => {
    // install() deploys to HERMES_HOME, not ~/.hermes.
    const custom = join(home, 'custom-hermes');
    vi.stubEnv('HERMES_HOME', custom);
    stubPlatform('linux');
    const platform = new HermesPlatform();

    const result = await platform.install('global', makeCreds(), true);

    const pluginDir = expand(join(custom, 'plugins', 'agentarts'));
    expect(isDir(pluginDir)).toBe(true);
    expect(result.configDir).toBe(pluginDir);
    expect(isFile(join(custom, '.env'))).toBe(true);
    expect(isFile(join(custom, 'config.yaml'))).toBe(true);
  });

  it('test_install_windows_localappdata', async () => {
    // install() deploys to %LOCALAPPDATA%\hermes on Windows.
    vi.stubEnv('HERMES_HOME', '');
    vi.stubEnv('LOCALAPPDATA', home);
    stubPlatform('win32');
    const platform = new HermesPlatform();

    const result = await platform.install('global', makeCreds(), true);

    const pluginDir = expand(join(home, 'hermes', 'plugins', 'agentarts'));
    expect(isDir(pluginDir)).toBe(true);
    expect(result.configDir).toBe(pluginDir);
    expect(isFile(join(home, 'hermes', '.env'))).toBe(true);
    expect(isFile(join(home, 'hermes', 'config.yaml'))).toBe(true);
  });

  it('test_config_dir_follows_hermes_home', () => {
    // config_dir() returns the path under the resolved hermes home.
    const custom = join(home, 'custom-hermes');
    vi.stubEnv('HERMES_HOME', custom);
    stubPlatform('linux');

    expect(new HermesPlatform().configDir('global')).toBe(
      expand(join(custom, 'plugins', 'agentarts')),
    );
  });

  it('test_degraded_scan_uses_hermes_home', async () => {
    // _degraded_scan looks in the resolved hermes home, not just ~/.hermes.
    const custom = join(home, 'custom-hermes');
    vi.stubEnv('HERMES_HOME', custom);
    stubPlatform('linux');
    mkdirSync(join(custom, 'plugins', 'agentarts'), { recursive: true });

    // No manifest entry → the degraded scan runs and reports the leftover.
    const code = await _doUninstall('hermes', true, true);

    expect(code).toBe(1);
    expect(stdout.text()).toContain('Found leftover');
  });
});

// ── Hermes + manifest integration ─────────────────────────────────────

describe('TestHermesManifestIntegration', () => {
  it('test_install_then_manifest_then_uninstall', async () => {
    const platform = new HermesPlatform();
    const creds = makeCreds();

    // Install.
    const result = await platform.install('global', creds, true);

    // Record in manifest.
    add({
      platform: 'hermes',
      scope: 'global',
      config_dir: result.configDir,
      scripts_dir: result.scriptsDir,
      files: result.files,
      config_files: result.configFiles,
    });

    // Manifest has one record.
    const found = find('hermes');
    expect(found).not.toBeNull();
    expect(found!['platform']).toBe('hermes');
    expect(listAll()).toHaveLength(1);

    // Uninstall.
    await platform.uninstall(found!);

    // Remove from manifest.
    remove('hermes', 'global', result.configDir);
    expect(find('hermes')).toBeNull();
    expect(listAll()).toEqual([]);
  });
});

// ── Claude round-trip ───────────────────────────────────────────────

describe('TestClaudeRoundTrip', () => {
  it('test_install_deploys_scripts_and_hooks', async () => {
    const platform = new ClaudePlatform();
    const creds = makeCreds();

    const result = await platform.install('global', creds, true);

    const scriptsDir = join(expand('~/.claude'), 'agentarts-memory', 'scripts');
    expect(isDir(scriptsDir)).toBe(true);
    // 3 scripts deployed (_shared, prompt-submit, pre-compact).
    expect(readdirSync(scriptsDir).filter((name) => name.endsWith('.mjs'))).toHaveLength(3);
    expect(result.files).toHaveLength(3);

    // settings.json has hooks.
    const settingsPath = join(expand('~/.claude'), 'settings.json');
    expect(isFile(settingsPath)).toBe(true);
    const settings = readJsonFile(settingsPath);
    expect('hooks' in settings).toBe(true);

    // Count hook entries — multiple events.
    const hookEvents = settings['hooks'] as Record<string, any[]>;
    expect(Object.keys(hookEvents)).toHaveLength(2); // UserPromptSubmit + PreCompact

    // Commands carry absolute paths (no placeholder).
    for (const hook of allHooks(hookEvents)) {
      const command = String(hook['command'] ?? '');
      expect(command).not.toContain('${CLAUDE_PLUGIN_ROOT}');
      expect(command.replace(/\\/g, '/')).toContain(scriptsDir.replace(/\\/g, '/'));
    }
  });

  it('test_uninstall_cleans_settings_and_scripts', async () => {
    const platform = new ClaudePlatform();
    const creds = makeCreds();

    const result = await platform.install('global', creds, true);

    const scriptsDir = result.scriptsDir;
    const settingsPath = join(result.configDir, 'settings.json');

    expect(isDir(scriptsDir)).toBe(true);
    expect(isFile(settingsPath)).toBe(true);

    await platform.uninstall({ config_dir: result.configDir, scripts_dir: scriptsDir });

    // Scripts dir gone.
    expect(existsSync(scriptsDir)).toBe(false);
    // settings.json gone (was empty after stripping hooks + MCP config).
    expect(existsSync(settingsPath)).toBe(false);
  });

  it('test_install_idempotent_no_duplicate_hooks', async () => {
    const platform = new ClaudePlatform();
    const creds = makeCreds();

    await platform.install('global', creds, true);
    await platform.install('global', creds, true);

    const settingsPath = join(expand('~/.claude'), 'settings.json');
    const settings = readJsonFile(settingsPath);

    // 2 hooks, not 4.
    expect(countHooks(settings['hooks'] as Record<string, any[]>)).toBe(2);
  });

  it('test_uninstall_preserves_user_hooks', async () => {
    const platform = new ClaudePlatform();

    // Pre-populate settings.json with a user hook.
    const configDir = expand('~/.claude');
    mkdirSync(configDir, { recursive: true });
    const settingsPath = join(configDir, 'settings.json');
    writeFileSync(
      settingsPath,
      JSON.stringify({
        hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo user-hook' }] }] },
        permissions: { allow: ['*'] },
      }),
      'utf8',
    );

    const result = await platform.install('global', makeCreds(), true);

    await platform.uninstall({ config_dir: result.configDir, scripts_dir: result.scriptsDir });

    // settings.json still exists with user hook and permissions.
    expect(isFile(settingsPath)).toBe(true);
    const remaining = readJsonFile(settingsPath);
    expect('permissions' in remaining).toBe(true);
    expect('Stop' in remaining['hooks']).toBe(true);
    const stopHooks = remaining['hooks']['Stop'][0]['hooks'] as Array<Record<string, any>>;
    expect(stopHooks).toHaveLength(1);
    expect(String(stopHooks[0]!['command'])).toContain('echo user-hook');
  });

  it('test_detect_returns_false_when_missing', () => {
    expect(new ClaudePlatform().detect()).toBe(false);
  });

  it('test_detect_returns_true_when_exists', () => {
    mkdirSync(expand('~/.claude'), { recursive: true });

    expect(new ClaudePlatform().detect()).toBe(true);
  });
});

// ── Codex round-trip ────────────────────────────────────────────────

describe('TestCodexRoundTrip', () => {
  it('test_install_deploys_scripts_hooks_and_toml', async () => {
    const platform = new CodexPlatform();
    const creds = makeCreds();

    const result = await platform.install('global', creds, true);

    const scriptsDir = join(expand('~/.codex'), 'agentarts-memory', 'scripts');
    expect(isDir(scriptsDir)).toBe(true);
    expect(readdirSync(scriptsDir).filter((name) => name.endsWith('.mjs'))).toHaveLength(3);

    // hooks.json has 2 hooks.
    const hooksPath = join(expand('~/.codex'), 'hooks.json');
    expect(isFile(hooksPath)).toBe(true);
    const hooksData = readJsonFile(hooksPath);
    expect('hooks' in hooksData).toBe(true);
    expect(countHooks(hooksData['hooks'] as Record<string, any[]>)).toBe(2);

    // Commands carry absolute paths (no placeholder).
    for (const hook of allHooks(hooksData['hooks'] as Record<string, any[]>)) {
      const command = String(hook['command'] ?? '');
      expect(command).not.toContain('${CODEX_PLUGIN_ROOT}');
      expect(command.replace(/\\/g, '/')).toContain(scriptsDir.replace(/\\/g, '/'));
    }

    // config.toml has hooks = true.
    const tomlPath = join(expand('~/.codex'), 'config.toml');
    expect(isFile(tomlPath)).toBe(true);
    const tomlContent = readFileSync(tomlPath, 'utf8');
    expect(tomlContent).toContain('hooks = true');
    expect(tomlContent).toContain('[features]');
  });

  it('test_uninstall_cleans_hooks_toml_and_scripts', async () => {
    const platform = new CodexPlatform();
    const creds = makeCreds();

    const result = await platform.install('global', creds, true);

    const scriptsDir = result.scriptsDir;
    const hooksPath = join(result.configDir, 'hooks.json');
    const tomlPath = join(result.configDir, 'config.toml');

    expect(isDir(scriptsDir)).toBe(true);
    expect(isFile(hooksPath)).toBe(true);
    expect(isFile(tomlPath)).toBe(true);

    await platform.uninstall({ config_dir: result.configDir, scripts_dir: scriptsDir });

    expect(existsSync(scriptsDir)).toBe(false);
    expect(existsSync(hooksPath)).toBe(false);
    expect(existsSync(tomlPath)).toBe(false);
  });

  it('test_install_idempotent_no_duplicate_hooks', async () => {
    const platform = new CodexPlatform();
    const creds = makeCreds();

    await platform.install('global', creds, true);
    await platform.install('global', creds, true);

    const hooksPath = join(expand('~/.codex'), 'hooks.json');
    const hooksData = readJsonFile(hooksPath);
    expect(countHooks(hooksData['hooks'] as Record<string, any[]>)).toBe(2);

    // config.toml should have one hooks line.
    const tomlContent = readFileSync(join(expand('~/.codex'), 'config.toml'), 'utf8');
    expect(countOccurrences(tomlContent, 'hooks = true')).toBe(1);
  });

  it('test_uninstall_preserves_user_hooks_and_other_toml_keys', async () => {
    const platform = new CodexPlatform();

    // Pre-populate hooks.json with a user hook.
    const configDir = expand('~/.codex');
    mkdirSync(configDir, { recursive: true });
    const hooksPath = join(configDir, 'hooks.json');
    writeFileSync(
      hooksPath,
      JSON.stringify({
        hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo user' }] }] },
      }),
      'utf8',
    );

    // Pre-populate config.toml with an existing feature key.
    const tomlPath = join(configDir, 'config.toml');
    writeFileSync(tomlPath, '[features]\nother_feature = true\n', 'utf8');

    const result = await platform.install('global', makeCreds(), true);

    await platform.uninstall({ config_dir: result.configDir, scripts_dir: result.scriptsDir });

    // hooks.json should still have the user hook.
    expect(isFile(hooksPath)).toBe(true);
    const remaining = readJsonFile(hooksPath);
    expect('Stop' in remaining['hooks']).toBe(true);
    expect(remaining['hooks']['Stop'][0]['hooks']).toHaveLength(1);

    // config.toml should still have other_feature.
    expect(isFile(tomlPath)).toBe(true);
    const toml = readFileSync(tomlPath, 'utf8');
    expect(toml).toContain('other_feature = true');
    expect(toml).not.toContain('hooks = true');
  });

  it('test_detect_returns_false_when_missing', () => {
    expect(new CodexPlatform().detect()).toBe(false);
  });

  it('test_detect_returns_true_when_exists', () => {
    mkdirSync(expand('~/.codex'), { recursive: true });

    expect(new CodexPlatform().detect()).toBe(true);
  });
});

// ── OpenCode round-trip ─────────────────────────────────────────────

describe('TestOpenCodeRoundTrip', () => {
  it('test_install_deploys_plugin_commands_and_json', async () => {
    const platform = new OpenCodePlatform();
    const creds = makeCreds();

    const result = await platform.install('global', creds, true);

    const configDir = expand('~/.config/opencode');

    // TS plugin deployed.
    const tsPath = join(configDir, 'plugins', 'agentarts-memory-capture.ts');
    expect(isFile(tsPath)).toBe(true);

    // Commands deployed.
    expect(isFile(join(configDir, 'commands', 'recall.md'))).toBe(true);
    expect(isFile(join(configDir, 'commands', 'remember.md'))).toBe(true);

    // opencode.json has the plugin entry.
    const jsonPath = join(configDir, 'opencode.json');
    expect(isFile(jsonPath)).toBe(true);
    const config = readJsonFile(jsonPath);
    expect('plugin' in config).toBe(true);
    expect(config['plugin']).toContain('./plugins/agentarts-memory-capture.ts');

    // 3 files deployed.
    expect(result.files).toHaveLength(3);
  });

  it('test_uninstall_cleans_plugin_commands_and_json', async () => {
    const platform = new OpenCodePlatform();
    const creds = makeCreds();

    const result = await platform.install('global', creds, true);

    const configDir = result.configDir;

    await platform.uninstall({ config_dir: configDir });

    // TS plugin gone.
    expect(existsSync(join(configDir, 'plugins', 'agentarts-memory-capture.ts'))).toBe(false);
    // Commands gone.
    expect(existsSync(join(configDir, 'commands', 'recall.md'))).toBe(false);
    expect(existsSync(join(configDir, 'commands', 'remember.md'))).toBe(false);
    // opencode.json gone (was only our entry).
    expect(existsSync(join(configDir, 'opencode.json'))).toBe(false);
  });

  it('test_install_idempotent_no_duplicate_entries', async () => {
    const platform = new OpenCodePlatform();
    const creds = makeCreds();

    await platform.install('global', creds, true);
    await platform.install('global', creds, true);

    const jsonPath = join(expand('~/.config/opencode'), 'opencode.json');
    const config = readJsonFile(jsonPath);
    // Only one entry, not two.
    expect(
      (config['plugin'] as string[]).filter(
        (entry) => entry === './plugins/agentarts-memory-capture.ts',
      ),
    ).toHaveLength(1);
  });

  it('test_uninstall_preserves_user_config', async () => {
    const platform = new OpenCodePlatform();

    // Pre-populate opencode.json with user settings.
    const configDir = expand('~/.config/opencode');
    mkdirSync(configDir, { recursive: true });
    const jsonPath = join(configDir, 'opencode.json');
    writeFileSync(
      jsonPath,
      JSON.stringify({ theme: 'dark', plugin: ['./plugins/user-plugin.ts'] }),
      'utf8',
    );

    const result = await platform.install('global', makeCreds(), true);

    // Verify both plugins are registered.
    expect(readJsonFile(jsonPath)['plugin']).toHaveLength(2);

    await platform.uninstall({ config_dir: configDir });

    // Should still have user plugin and theme.
    const remaining = readJsonFile(jsonPath);
    expect(remaining['theme']).toBe('dark');
    expect(remaining['plugin']).toContain('./plugins/user-plugin.ts');
    expect(remaining['plugin']).not.toContain('./plugins/agentarts-memory-capture.ts');
  });

  it('test_detect_returns_false_when_missing', () => {
    expect(new OpenCodePlatform().detect()).toBe(false);
  });

  it('test_detect_returns_true_when_exists', () => {
    mkdirSync(expand('~/.config/opencode'), { recursive: true });

    expect(new OpenCodePlatform().detect()).toBe(true);
  });
});

// ── MCP config integration ─────────────────────────────────────────

describe('TestMcpConfigIntegration', () => {
  it('test_claude_install_writes_mcp_config', async () => {
    const platform = new ClaudePlatform();
    const result = await platform.install('global', makeCreds(), true);

    const settingsPath = join(result.configDir, 'settings.json');
    const settings = readJsonFile(settingsPath);
    expect('mcpServers' in settings).toBe(true);
    expect('agentarts_memory' in settings['mcpServers']).toBe(true);
    expect(settings['mcpServers']['agentarts_memory']['command']).toBe(MCP_SERVER_COMMAND);
    expect(
      settings['mcpServers']['agentarts_memory']['env']['AGENTARTS_MEMORY_PLATFORM'],
    ).toBe('claude-code');
  });

  it('test_claude_uninstall_removes_mcp_config', async () => {
    const platform = new ClaudePlatform();
    const result = await platform.install('global', makeCreds(), true);

    await platform.uninstall({ config_dir: result.configDir, scripts_dir: result.scriptsDir });

    const settingsPath = join(result.configDir, 'settings.json');
    if (isFile(settingsPath)) {
      const settings = readJsonFile(settingsPath);
      expect(
        !('mcpServers' in settings) ||
          !('agentarts_memory' in (settings['mcpServers'] ?? {})),
      ).toBe(true);
    }
  });

  it('test_codex_install_writes_mcp_config', async () => {
    const platform = new CodexPlatform();
    const result = await platform.install('global', makeCreds(), true);

    const tomlPath = join(result.configDir, 'config.toml');
    const tomlContent = readFileSync(tomlPath, 'utf8');
    expect(tomlContent).toContain('[mcp_servers.agentarts_memory]');
    expect(tomlContent).toContain(`command = ${JSON.stringify(MCP_SERVER_COMMAND)}`);
    expect(tomlContent).toContain('AGENTARTS_MEMORY_PLATFORM');
    // Codex TOML format: key = "value" inside [mcp_servers.agentarts_memory.env]
    expect(tomlContent).toContain('AGENTARTS_MEMORY_PLATFORM = "codex"');
  });

  it('test_codex_uninstall_removes_mcp_config', async () => {
    const platform = new CodexPlatform();
    const result = await platform.install('global', makeCreds(), true);

    await platform.uninstall({ config_dir: result.configDir, scripts_dir: result.scriptsDir });

    const tomlPath = join(result.configDir, 'config.toml');
    if (isFile(tomlPath)) {
      expect(readFileSync(tomlPath, 'utf8')).not.toContain('[mcp_servers.agentarts_memory]');
    }
  });

  it('test_opencode_install_writes_mcp_config', async () => {
    const platform = new OpenCodePlatform();
    const result = await platform.install('global', makeCreds(), true);

    const jsonPath = join(result.configDir, 'opencode.json');
    const config = readJsonFile(jsonPath);
    expect('mcp' in config).toBe(true);
    expect('agentarts_memory' in config['mcp']).toBe(true);
    expect(config['mcp']['agentarts_memory']['type']).toBe('local');
    expect(config['mcp']['agentarts_memory']['environment']['AGENTARTS_MEMORY_PLATFORM']).toBe(
      'opencode',
    );
  });

  it('test_opencode_uninstall_removes_mcp_config', async () => {
    const platform = new OpenCodePlatform();
    const result = await platform.install('global', makeCreds(), true);

    await platform.uninstall({ config_dir: result.configDir });

    const jsonPath = join(result.configDir, 'opencode.json');
    if (isFile(jsonPath)) {
      const config = readJsonFile(jsonPath);
      expect(!('mcp' in config) || !('agentarts_memory' in (config['mcp'] ?? {}))).toBe(true);
    }
  });
});

// -- Windows path escaping --

describe('TestWindowsPathEscaping', () => {
  /**
   * `os.path.dirname` returns backslashes on Windows; the mixed-separator input
   * below makes `dirname()` return a backslash-containing root on every host, so
   * the `.replace("\\", "/")` normalisation is always exercised.
   */
  it('test_codex_template_windows_path_no_json_error', () => {
    const platform = new CodexPlatform();
    const scriptsDir = 'C:\\Users/test/.codex/agentarts-memory/scripts';

    const result = loadHooksTemplate(platform, scriptsDir);

    expect(typeof result).toBe('object');
    expect('hooks' in result).toBe(true);
    for (const hook of allHooks(result['hooks'] as Record<string, any[]>)) {
      const command = String(hook['command'] ?? '');
      expect(command).not.toContain('\\');
      expect(command).toContain('C:/Users/test/.codex/agentarts-memory');
    }
  });

  it('test_claude_template_windows_path_no_json_error', () => {
    const platform = new ClaudePlatform();
    const scriptsDir = 'C:\\Users/test/.claude/agentarts-memory/scripts';

    const result = loadHooksTemplate(platform, scriptsDir);

    expect(typeof result).toBe('object');
    expect('hooks' in result).toBe(true);
    for (const hook of allHooks(result['hooks'] as Record<string, any[]>)) {
      const command = String(hook['command'] ?? '');
      expect(command).not.toContain('\\');
      expect(command).toContain('C:/Users/test/.claude/agentarts-memory');
    }
  });

  it('test_codex_uninstall_with_backslash_scripts_dir', async () => {
    const platform = new CodexPlatform();
    const result = await platform.install('global', makeCreds(), true);

    const hooksPath = join(result.configDir, 'hooks.json');
    expect(isFile(hooksPath)).toBe(true);

    // Simulate Windows: convert scripts_dir to backslash form.
    const winScriptsDir = result.scriptsDir.replace(/\//g, '\\');
    await platform.uninstall({ config_dir: result.configDir, scripts_dir: winScriptsDir });

    // hooks.json should be gone (our hooks were found and stripped).
    expect(existsSync(hooksPath)).toBe(false);
  });

  it('test_claude_uninstall_with_backslash_scripts_dir', async () => {
    const platform = new ClaudePlatform();
    const result = await platform.install('global', makeCreds(), true);

    const settingsPath = join(result.configDir, 'settings.json');
    expect(isFile(settingsPath)).toBe(true);

    const winScriptsDir = result.scriptsDir.replace(/\//g, '\\');
    await platform.uninstall({ config_dir: result.configDir, scripts_dir: winScriptsDir });

    expect(existsSync(settingsPath)).toBe(false);
  });
});
