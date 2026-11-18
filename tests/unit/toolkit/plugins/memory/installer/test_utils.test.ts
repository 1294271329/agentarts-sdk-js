/**
 * Tests for the installer utilities (assets, config, manifest, prompts, creds).
 *
 * Ported 1:1 from `tests/unit/toolkit/plugins/memory/installer/test_utils.py`.
 *
 * Mock strategy (Python `monkeypatch`/`capsys` → vitest):
 * - `monkeypatch.setenv("HOME", tmp_path)` → `stubHome()` (HOME + USERPROFILE);
 * - `monkeypatch.setattr(sys, "platform", ...)` → `stubPlatform()` (`node:os`'s
 *   `platform()` reads `process.platform` on every call);
 * - `monkeypatch.setattr(utils, "prompt_input"/"confirm", ...)` → those are
 *   module-local bindings in ESM and cannot be patched, so the layer
 *   *underneath* them is replaced instead: `node:readline/promises` returns
 *   canned answers (the plain-reader path) and `process.stdin` is a fake TTY
 *   that streams canned keys (the POSIX raw-mode path). Module-private helpers
 *   (`_mask_api_key`, `_command_contains_scripts_dir`, `_input_with_esc`,
 *   `_HAS_TTY`) are exercised through these public entry points;
 * - `monkeypatch.setattr("subprocess.run", ...)` → `vi.mock("node:child_process")`
 *   with a `spawn()` fake, so `setx` is never executed;
 * - `capsys.readouterr().out` → a `process.stdout` spy plus the prompt texts the
 *   readline mock records.
 *
 * The canned-answer queue is strict: an unexpected prompt fails the test, which
 * is how the Python assertions "prompt_input should not be called" are enforced.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, normalize } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_REGION,
  ENV_API_KEY,
  ENV_REGION,
  ENV_SPACE_ID,
  EscapeInterrupt,
  add,
  checkEnv,
  claudeHooksTemplate,
  codeAgentScripts,
  codeAgentSource,
  codexHooksTemplate,
  confirm,
  ensureCredentials,
  expand,
  find,
  getShellRc,
  hermesFiles,
  hermesSource,
  interactiveFill,
  listAll,
  load,
  manifestPath,
  mergeHooks,
  mergeTomlFeatures,
  opencodeFiles,
  pluginsRoot,
  promptInput,
  readJson,
  remove,
  removeHooksKey,
  removeIfEmpty,
  repoRoot,
  selectOne,
  setYes,
  stripEnvKeys,
  stripHooks,
  stripJson5,
  stripTomlFeature,
  validateApiKey,
  validateRegion,
  validateSpaceId,
  writeEnvFile,
  writeJsonAtomic,
  writeShellRc,
} from 'agentarts-sdk/toolkit/plugins/memory/installer/utils';
import * as utils from 'agentarts-sdk/toolkit/plugins/memory/installer/utils';

import {
  captureStdout,
  createTempDir,
  fakeChild,
  removeTempDir,
  restorePlatform,
  restoreStdin,
  stubHome,
  stubPlatform,
  stubStdin,
  type StdoutCapture,
} from './_helpers.js';

const promptMocks = vi.hoisted(() => ({
  /** Canned prompt answers, consumed in order; an empty queue fails the test. */
  replies: [] as Array<{ line?: string; escape?: boolean }>,
  /** Recorded prompt texts (the plain reader is not written to stdout). */
  prompts: [] as string[],
  /** Error thrown on the plain-reader path when the user hits ESC. */
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

const childProcessMocks = vi.hoisted(() => ({ spawn: vi.fn() }));

vi.mock('node:child_process', () => ({ spawn: childProcessMocks.spawn }));

/**
 * Fake TTY stdin for the POSIX raw-mode path of `_inputWithEsc`.
 *
 * On Windows `_HAS_TTY` is `false`, so `confirm`/`promptInput`/`selectOne` use
 * the plain reader (the mocked `node:readline/promises`) instead and this object
 * only has to report `isTTY`.
 */
class FakeStdin {
  isTTY = true;

  private readonly dataHandlers: Array<(chunk: string) => void> = [];

  setRawMode(_mode: boolean): this {
    return this;
  }

  resume(): this {
    return this;
  }

  pause(): this {
    return this;
  }

  setEncoding(_encoding: BufferEncoding): this {
    return this;
  }

  on(event: string, handler: (chunk: string) => void): this {
    if (event === 'data') {
      this.dataHandlers.push(handler);
      this.schedule();
    }
    return this;
  }

  removeListener(event: string, handler: (chunk: string) => void): this {
    if (event === 'data') {
      const index = this.dataHandlers.indexOf(handler);
      if (index >= 0) {
        this.dataHandlers.splice(index, 1);
      }
    }
    return this;
  }

  /** Emit the next canned key sequence (one line, or a bare ESC). */
  private schedule(): void {
    setImmediate(() => {
      const reply = promptMocks.replies.shift();
      if (reply === undefined) {
        throw new Error('unexpected prompt');
      }
      const chunk = reply.escape ? '\x1b' : `${reply.line ?? ''}\r`;
      for (const handler of [...this.dataHandlers]) {
        handler(chunk);
      }
    });
  }
}

let home: string;
let stdout: StdoutCapture;
let stdinStub: FakeStdin;

/** Everything printed, plus the prompt texts of the plain-reader path. */
function out(): string {
  return stdout.text() + promptMocks.prompts.join('\n');
}

/** `str.count(needle)` counterpart. */
function countOf(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

/** Set valid credentials in the environment. */
function setEnvCreds(): void {
  vi.stubEnv(ENV_SPACE_ID, 'my-space-12345');
  vi.stubEnv(ENV_API_KEY, 'abcdefghijklmnop123456');
  vi.stubEnv(ENV_REGION, 'cn-north-4');
}

/** Record what `utils.console.print` renders (`capsys` counterpart). */
function trackConsolePrint(): string[] {
  const printed: string[] = [];
  const original = utils.console.print.bind(utils.console);
  vi.spyOn(utils.console, 'print').mockImplementation((message = '') => {
    printed.push(String(message));
    original(message);
  });
  return printed;
}

beforeEach(() => {
  home = createTempDir('agentarts-utils-');
  stubHome(home);
  // Python's suite runs on Linux: deterministic shell rc / Hermes home.
  stubPlatform('linux');
  vi.stubEnv('HERMES_HOME', '');
  vi.stubEnv('LOCALAPPDATA', '');
  stdout = captureStdout();
  stdinStub = new FakeStdin();
  stubStdin(stdinStub);
  promptMocks.replies = [];
  promptMocks.prompts = [];
  promptMocks.escapeError = null;
  childProcessMocks.spawn.mockReset();
  childProcessMocks.spawn.mockImplementation(() => fakeChild(0));
  setYes(false);
});

afterEach(() => {
  restorePlatform();
  restoreStdin();
  vi.unstubAllEnvs();
  removeTempDir(home);
});

// ── Paths / assets ───────────────────────────────────────────────────

describe('TestPaths', () => {
  it('test_repo_root_is_parent_of_plugins', () => {
    expect(pluginsRoot().startsWith(repoRoot())).toBe(true);
  });

  it('test_plugins_root_exists', () => {
    expect(utils.isDir(pluginsRoot())).toBe(true);
  });

  it('test_hermes_source_exists', () => {
    expect(utils.isDir(hermesSource())).toBe(true);
  });

  it('test_code_agent_source_exists', () => {
    expect(utils.isDir(codeAgentSource())).toBe(true);
  });
});

describe('TestHermesFiles', () => {
  it('test_returns_three_files', () => {
    expect(hermesFiles()).toHaveLength(3);
  });

  it('test_files_exist', () => {
    for (const file of hermesFiles()) {
      expect(utils.isFile(file)).toBe(true);
    }
  });

  it('test_no_cli_py', () => {
    for (const file of hermesFiles()) {
      expect(file).not.toContain('cli.py');
    }
  });

  it('test_contains_expected_names', () => {
    const names = hermesFiles().map((file) => basename(file));
    // Python deploys provider.py / plugin.yaml / __init__.py.
    expect(names).toContain('plugin.yaml');
    expect(names.some((name) => /^provider\.(ts|js)$/.test(name))).toBe(true);
    expect(names.some((name) => /^index\.(ts|js)$/.test(name))).toBe(true);
  });
});

describe('TestCodeAgentScripts', () => {
  it('test_returns_three', () => {
    expect(codeAgentScripts()).toHaveLength(3);
  });

  it('test_scripts_exist', () => {
    for (const script of codeAgentScripts()) {
      expect(utils.isFile(script)).toBe(true);
    }
  });

  it('test_contains_shared', () => {
    expect(codeAgentScripts().map((script) => basename(script))).toContain('_shared.mjs');
  });

  it('test_contains_all_expected', () => {
    const expected = ['_shared.mjs', 'prompt-submit.mjs', 'pre-compact.mjs'];
    const names = codeAgentScripts().map((script) => basename(script));
    for (const name of expected) {
      expect(names).toContain(name);
    }
  });
});

describe('TestHooksTemplates', () => {
  it('test_claude_template_exists', () => {
    expect(utils.isFile(claudeHooksTemplate())).toBe(true);
  });

  it('test_codex_template_exists', () => {
    expect(utils.isFile(codexHooksTemplate())).toBe(true);
  });
});

describe('TestOpenCodeFiles', () => {
  it('test_returns_three_entries', () => {
    expect(Object.keys(opencodeFiles())).toHaveLength(3);
  });

  it('test_all_source_files_exist', () => {
    for (const source of Object.values(opencodeFiles())) {
      expect(utils.isFile(source)).toBe(true);
    }
  });

  it('test_keys_are_relative_paths', () => {
    const files = opencodeFiles();
    expect('plugins/agentarts-memory-capture.ts' in files).toBe(true);
    expect('commands/recall.md' in files).toBe(true);
    expect('commands/remember.md' in files).toBe(true);
  });
});

// ── Validators ───────────────────────────────────────────────────────

describe('TestValidateSpaceId', () => {
  it('test_empty', () => {
    const [ok, message] = validateSpaceId('');

    expect(ok).toBe(false);
    expect(message).toContain('empty');
  });

  it('test_too_short', () => {
    const [ok, message] = validateSpaceId('abc');

    expect(ok).toBe(false);
    expect(message).toContain('8');
  });

  it('test_valid', () => {
    const [ok, value] = validateSpaceId('  my-space-12345  ');

    expect(ok).toBe(true);
    expect(value).toBe('my-space-12345');
  });
});

describe('TestValidateApiKey', () => {
  it('test_empty', () => {
    const [ok] = validateApiKey('');

    expect(ok).toBe(false);
  });

  it('test_too_short', () => {
    const [ok, message] = validateApiKey('shortkey12345'); // 13 chars

    expect(ok).toBe(false);
    expect(message).toContain('16');
  });

  it('test_valid', () => {
    const [ok, value] = validateApiKey('  abcdefghijklmnop123456  ');

    expect(ok).toBe(true);
    expect(value).toBe('abcdefghijklmnop123456');
  });
});

describe('TestValidateRegion', () => {
  it('test_empty_defaults', () => {
    const [ok, value] = validateRegion('');

    expect(ok).toBe(true);
    expect(value).toBe(DEFAULT_REGION);
  });

  it('test_valid', () => {
    const [ok, value] = validateRegion('cn-north-4');

    expect(ok).toBe(true);
    expect(value).toBe('cn-north-4');
  });

  it('test_invalid_format', () => {
    const [ok, message] = validateRegion('invalid');

    expect(ok).toBe(false);
    expect(message.toLowerCase()).toContain('format');
  });

  it('test_two_parts_invalid', () => {
    expect(validateRegion('cn-north')[0]).toBe(false);
  });
});

// ── check_env ───────────────────────────────────────────────────────

describe('TestCheckEnv', () => {
  it('test_all_missing', () => {
    vi.stubEnv(ENV_SPACE_ID, '');
    vi.stubEnv(ENV_API_KEY, '');
    vi.stubEnv(ENV_REGION, '');

    const [ok, config] = checkEnv();

    expect(ok).toBe(false);
    expect(ENV_REGION in config).toBe(true);
    expect(config[ENV_REGION]).toBe(DEFAULT_REGION);
  });

  it('test_all_set_valid', () => {
    vi.stubEnv(ENV_SPACE_ID, 'my-space-12345');
    vi.stubEnv(ENV_API_KEY, 'abcdefghijklmnop123456');
    vi.stubEnv(ENV_REGION, 'cn-north-4');

    const [ok, config] = checkEnv();

    expect(ok).toBe(true);
    expect(config[ENV_SPACE_ID]).toBe('my-space-12345');
    expect(config[ENV_REGION]).toBe('cn-north-4');
  });

  it('test_invalid_values_fail', () => {
    vi.stubEnv(ENV_SPACE_ID, 'short');
    vi.stubEnv(ENV_API_KEY, 'short');

    const [ok] = checkEnv();

    expect(ok).toBe(false);
  });
});

// ── interactive_fill ─────────────────────────────────────────────────

describe('TestInteractiveFill', () => {
  it('test_yes_mode_returns_defaults', async () => {
    const filled = await interactiveFill([ENV_SPACE_ID, ENV_API_KEY], true);

    expect(filled[ENV_SPACE_ID]).toBe('');
    expect(filled[ENV_API_KEY]).toBe('');
  });

  it('test_yes_mode_region_default', async () => {
    const filled = await interactiveFill([ENV_REGION], true);

    expect(filled[ENV_REGION]).toBe(DEFAULT_REGION);
  });
});

// ── ensure_credentials (--yes mode) ─────────────────────────────────

describe('TestEnsureCredentials', () => {
  it('test_with_env_set', async () => {
    setEnvCreds();

    const config = await ensureCredentials(true);

    expect(config[ENV_SPACE_ID]).toBe('my-space-12345');
    expect(config[ENV_API_KEY]).toBe('abcdefghijklmnop123456');
  });

  it('test_missing_in_yes_mode_no_crash', async () => {
    vi.stubEnv(ENV_SPACE_ID, '');
    vi.stubEnv(ENV_API_KEY, '');

    // Should not crash even if missing in yes mode.
    const config = await ensureCredentials(true);

    expect(ENV_SPACE_ID in config).toBe(true);
  });
});

describe('TestEnsureCredentialsRegionPrompt', () => {
  it('test_region_prompted_when_unset_interactive', async () => {
    vi.stubEnv(ENV_SPACE_ID, 'my-space-12345');
    vi.stubEnv(ENV_API_KEY, 'abcdefghijklmnop123456');
    vi.stubEnv(ENV_REGION, '');
    // Region prompt (empty → default) then "Save configuration?" → no.
    promptMocks.replies = [{ line: '' }, { line: 'n' }];

    const config = await ensureCredentials(false);

    expect(config[ENV_REGION]).toBe(DEFAULT_REGION);
    expect(out()).toContain(`default: ${DEFAULT_REGION}`);
  });

  it('test_region_not_prompted_when_set_in_env', async () => {
    setEnvCreds();
    // The strict queue fails the test when `prompt_input` is called for region:
    // only the "Use existing configuration?" confirmation is answered.
    promptMocks.replies = [{ line: 'y' }];

    const config = await ensureCredentials(false);

    expect(config[ENV_REGION]).toBe('cn-north-4');
  });

  it('test_region_not_prompted_in_yes_mode', async () => {
    vi.stubEnv(ENV_SPACE_ID, 'my-space-12345');
    vi.stubEnv(ENV_API_KEY, 'abcdefghijklmnop123456');
    vi.stubEnv(ENV_REGION, '');
    // No replies: any prompt fails the test.

    const config = await ensureCredentials(true);

    expect(config[ENV_REGION]).toBe(DEFAULT_REGION);
  });
});

// ── Shell rc helpers ─────────────────────────────────────────────────

describe('TestShellRc', () => {
  it('test_get_shell_rc_zsh', () => {
    vi.stubEnv('SHELL', '/bin/zsh');

    expect(getShellRc()).toBe(join(home, '.zshrc'));
  });

  it('test_get_shell_rc_bash', () => {
    vi.stubEnv('SHELL', '/bin/bash');

    expect(getShellRc()).toBe(join(home, '.bashrc'));
  });

  it('test_write_shell_rc_dedup', async () => {
    vi.stubEnv('SHELL', '/bin/zsh');
    const rc = join(home, '.zshrc');

    // Write once.
    await writeShellRc({ [ENV_API_KEY]: 'secret1' });
    // Write again — should update, not duplicate.
    await writeShellRc({ [ENV_API_KEY]: 'secret2' });

    const content = readFileSync(rc, 'utf8');
    expect(content).toContain('secret2');
    expect(content).not.toContain('secret1');
    // Only one export line for the key.
    expect(countOf(content, `export ${ENV_API_KEY}=`)).toBe(1);
  });
});

// ── Manifest ─────────────────────────────────────────────────────────

describe('TestLoad', () => {
  it('test_nonexistent_returns_skeleton', () => {
    const data = load();

    expect(data['version']).toBe(1);
    expect(data['installs']).toEqual([]);
  });

  it('test_manifest_path', () => {
    expect(manifestPath().includes(home)).toBe(true);
    expect(manifestPath().endsWith('installed.json')).toBe(true);
  });
});

describe('TestAddRemove', () => {
  it('test_add_then_load', () => {
    add({
      platform: 'hermes',
      scope: 'global',
      config_dir: '/home/x/.hermes/plugins/agentarts',
      scripts_dir: '',
      files: ['/path/to/provider.py'],
      config_files: ['/path/to/agentarts.json'],
    });

    const data = load();

    expect(data['installs']).toHaveLength(1);
    expect(data['installs'][0]['platform']).toBe('hermes');
    expect('installed_at' in data['installs'][0]).toBe(true);
  });

  it('test_add_idempotent', () => {
    const entry = {
      platform: 'claude',
      scope: 'global',
      config_dir: '/home/x/.claude',
      scripts_dir: '/home/x/.claude/agentarts-memory/scripts',
      files: [],
      config_files: [],
    };

    add(entry);
    add(entry); // re-add should not duplicate

    expect(load()['installs']).toHaveLength(1);
  });

  it('test_add_multiple_platforms', () => {
    add({
      platform: 'hermes',
      scope: 'global',
      config_dir: '/a',
      scripts_dir: '',
      files: [],
      config_files: [],
    });
    add({
      platform: 'claude',
      scope: 'global',
      config_dir: '/b',
      scripts_dir: '/b/scripts',
      files: [],
      config_files: [],
    });

    expect(load()['installs']).toHaveLength(2);
  });

  it('test_remove_returns_entry', () => {
    add({
      platform: 'codex',
      scope: 'project',
      config_dir: '/c/.codex',
      scripts_dir: '/c/.codex/agentarts-memory/scripts',
      files: [],
      config_files: [],
    });

    const removed = remove('codex', 'project', '/c/.codex');

    expect(removed).not.toBeNull();
    expect(removed!['platform']).toBe('codex');
    expect(load()['installs']).toHaveLength(0);
  });

  it('test_remove_nonexistent_returns_none', () => {
    expect(remove('nonexistent', 'global', '/nope')).toBeNull();
  });

  it('test_remove_cleans_up_empty_manifest_file', () => {
    add({
      platform: 'hermes',
      scope: 'global',
      config_dir: '/a',
      scripts_dir: '',
      files: [],
      config_files: [],
    });

    remove('hermes', 'global', '/a');

    expect(existsSync(manifestPath())).toBe(false);
  });
});

describe('TestFind', () => {
  it('test_find_by_platform', () => {
    add({
      platform: 'claude',
      scope: 'global',
      config_dir: '/x/.claude',
      scripts_dir: '/x/.claude/agentarts-memory/scripts',
      files: [],
      config_files: [],
    });

    const result = find('claude');

    expect(result).not.toBeNull();
    expect(result!['platform']).toBe('claude');
  });

  it('test_find_by_platform_scope_configdir', () => {
    add({
      platform: 'claude',
      scope: 'global',
      config_dir: '/x/.claude',
      scripts_dir: '/x/.claude/agentarts-memory/scripts',
      files: [],
      config_files: [],
    });

    // Match all.
    expect(find('claude', 'global', '/x/.claude')).not.toBeNull();
    // Mismatch scope.
    expect(find('claude', 'project', '/x/.claude')).toBeNull();
    // Mismatch config_dir.
    expect(find('claude', 'global', '/wrong')).toBeNull();
  });

  it('test_find_nonexistent', () => {
    expect(find('bogus')).toBeNull();
  });
});

describe('TestListAll', () => {
  it('test_empty', () => {
    expect(listAll()).toEqual([]);
  });

  it('test_multiple', () => {
    ['hermes', 'claude', 'codex'].forEach((platform, index) => {
      add({
        platform,
        scope: 'global',
        config_dir: `/dir${index}`,
        scripts_dir: '',
        files: [],
        config_files: [],
      });
    });

    expect(listAll()).toHaveLength(3);
  });
});

// ── expand ───────────────────────────────────────────────────────────

describe('TestExpand', () => {
  it('test_tilde', () => {
    expect(expand('~/.claude')).toBe(join(home, '.claude'));
  });

  it('test_env_var', () => {
    // Python uses "/bar"; a temporary directory keeps `normpath` host-neutral.
    vi.stubEnv('FOO', home);

    expect(expand('$FOO/baz')).toBe(join(home, 'baz'));
  });

  it('test_no_expansion_needed', () => {
    expect(expand('/usr/local/bin')).toBe(normalize('/usr/local/bin'));
  });
});

// ── strip_json5 ──────────────────────────────────────────────────────

describe('TestStripJson5', () => {
  it('test_line_comment', () => {
    expect(JSON.parse(stripJson5('{ "a": 1 // comment\n}'))).toEqual({ a: 1 });
  });

  it('test_block_comment', () => {
    expect(JSON.parse(stripJson5('{ "a": /* block */ 1 }'))).toEqual({ a: 1 });
  });

  it('test_trailing_comma_object', () => {
    expect(JSON.parse(stripJson5('{"a": 1, "b": 2,}'))).toEqual({ a: 1, b: 2 });
  });

  it('test_trailing_comma_array', () => {
    expect(JSON.parse(stripJson5('[1, 2, 3,]'))).toEqual([1, 2, 3]);
  });

  it('test_url_in_string_preserved', () => {
    expect(JSON.parse(stripJson5('{"url": "http://example.com"}'))).toEqual({
      url: 'http://example.com',
    });
  });

  it('test_escaped_quote_in_string', () => {
    expect(JSON.parse(stripJson5('{"a": "he said \\"hi\\""}'))['a']).toBe('he said "hi"');
  });
});

// ── read_json / write_json_atomic ────────────────────────────────────

describe('TestJsonIO', () => {
  it('test_read_nonexistent_returns_empty', () => {
    expect(readJson(join(home, 'nope.json'))).toEqual({});
  });

  it('test_read_with_comments', () => {
    const path = join(home, 'test.json');
    writeFileSync(path, '{\n  // comment\n  "a": 1,\n}', 'utf8');

    expect(readJson(path)).toEqual({ a: 1 });
  });

  it('test_write_then_read_roundtrip', () => {
    const path = join(home, 'out.json');
    const data = { hooks: { Event: [{ hooks: [{ command: 'echo' }] }] } };

    writeJsonAtomic(path, data);

    expect(readJson(path)).toEqual(data);
  });

  it('test_atomic_write_preserves_other_keys', () => {
    const path = join(home, 'settings.json');
    const original = { permissions: { allow: ['*'] }, hooks: {} };
    writeJsonAtomic(path, original);
    writeJsonAtomic(path, { ...original, hooks: { NewEvent: [] } });

    const result = readJson(path);
    expect('permissions' in result).toBe(true);
    expect(result['hooks']['NewEvent']).toEqual([]);
  });
});

// ── merge_hooks / strip_hooks ────────────────────────────────────────

const SAMPLE_HOOKS_TEMPLATE = {
  hooks: {
    SessionStart: [
      {
        hooks: [
          {
            type: 'command',
            command: 'node "/home/u/.claude/agentarts-memory/scripts/session-start.mjs"',
          },
        ],
      },
    ],
    PreToolUse: [
      {
        matcher: 'Edit|Write',
        hooks: [
          {
            type: 'command',
            command: 'node "/home/u/.claude/agentarts-memory/scripts/pre-tool-use.mjs"',
          },
        ],
      },
    ],
  },
};

const SCRIPTS_DIR = '/home/u/.claude/agentarts-memory/scripts';

describe('TestMergeStripHooks', () => {
  it('test_merge_into_empty', () => {
    const result = mergeHooks({}, SAMPLE_HOOKS_TEMPLATE, SCRIPTS_DIR);

    expect('hooks' in result).toBe(true);
    expect('SessionStart' in result['hooks']).toBe(true);
    expect('PreToolUse' in result['hooks']).toBe(true);
  });

  it('test_merge_preserves_other_keys', () => {
    const existing = { permissions: { allow: ['*'] } };

    const result = mergeHooks(existing, SAMPLE_HOOKS_TEMPLATE, SCRIPTS_DIR);

    expect('permissions' in result).toBe(true);
    expect('hooks' in result).toBe(true);
  });

  it('test_merge_idempotent', () => {
    // Merge twice — should not duplicate.
    const once = mergeHooks({}, SAMPLE_HOOKS_TEMPLATE, SCRIPTS_DIR);
    const twice = mergeHooks(once, SAMPLE_HOOKS_TEMPLATE, SCRIPTS_DIR);

    expect(twice).toEqual(once);
  });

  it('test_strip_returns_to_empty', () => {
    const merged = mergeHooks({}, SAMPLE_HOOKS_TEMPLATE, SCRIPTS_DIR);

    expect(stripHooks(merged['hooks'], SCRIPTS_DIR)).toEqual({});
  });

  it('test_strip_preserves_user_hooks', () => {
    const existing = {
      hooks: {
        SessionStart: [
          {
            hooks: [
              { type: 'command', command: 'echo user-hook' },
              {
                type: 'command',
                command: `node "${SCRIPTS_DIR}/session-start.mjs"`,
              },
            ],
          },
        ],
        Stop: [{ hooks: [{ type: 'command', command: 'echo keep' }] }],
      },
    };

    const merged = mergeHooks(existing, SAMPLE_HOOKS_TEMPLATE, SCRIPTS_DIR);

    // After merge: SessionStart has 2 groups (user group stripped + our group).
    const sessionStart = merged['hooks']['SessionStart'] as Array<Record<string, any>>;
    expect(sessionStart).toHaveLength(2);
    // Group 0 = user hook (our hook stripped from it).
    expect(sessionStart[0]['hooks']).toHaveLength(1);
    expect(String(sessionStart[0]['hooks'][0]['command'])).toContain('echo user-hook');
    // Group 1 = our incoming hook.
    expect(String(sessionStart[1]['hooks'][0]['command'])).toContain(SCRIPTS_DIR);

    // Strip should remove our group but keep the user's.
    const stripped = removeHooksKey(merged, SCRIPTS_DIR);
    const sessionAfter = stripped['hooks']['SessionStart'][0]['hooks'] as Array<
      Record<string, any>
    >;
    expect(sessionAfter).toHaveLength(1);
    expect(String(sessionAfter[0]['command'])).toContain('echo user-hook');
    expect('Stop' in stripped['hooks']).toBe(true);
  });

  it('test_strip_removes_empty_event', () => {
    const merged = mergeHooks({}, SAMPLE_HOOKS_TEMPLATE, SCRIPTS_DIR);

    const result = removeHooksKey(merged, SCRIPTS_DIR);

    expect('hooks' in result).toBe(false);
  });

  it('test_strip_removes_empty_hook_group', () => {
    const existing = {
      hooks: {
        SessionStart: [
          {
            matcher: 'Edit',
            hooks: [
              {
                type: 'command',
                command: `node "${SCRIPTS_DIR}/session-start.mjs"`,
              },
            ],
          },
        ],
      },
    };

    const result = removeHooksKey(existing, SCRIPTS_DIR);

    expect('hooks' in result).toBe(false);
  });
});

// ── TOML merge / strip ───────────────────────────────────────────────

describe('TestTomlMerge', () => {
  it('test_add_to_empty', () => {
    const result = mergeTomlFeatures('', 'hooks', 'true');

    expect(result).toContain('[features]');
    expect(result).toContain('hooks = true');
  });

  it('test_add_to_existing_no_features', () => {
    const result = mergeTomlFeatures('[other]\nkey = "val"\n', 'hooks', 'true');

    expect(result).toContain('[features]');
    expect(result).toContain('hooks = true');
    expect(result).toContain('[other]');
    expect(result).toContain('key = "val"');
  });

  it('test_add_to_existing_features', () => {
    const result = mergeTomlFeatures('[features]\nother_key = false\n', 'hooks', 'true');

    expect(result).toContain('other_key = false');
    expect(result).toContain('hooks = true');
  });

  it('test_update_existing_key', () => {
    const result = mergeTomlFeatures('[features]\nhooks = false\n', 'hooks', 'true');

    expect(result).toContain('hooks = true');
    expect(result).not.toContain('hooks = false');
  });

  it('test_removes_deprecated_keys', () => {
    const result = mergeTomlFeatures(
      '[features]\ncodex_hooks = true\nother_key = false\n',
      'hooks',
      'true',
      { deprecatedKeys: ['codex_hooks'] },
    );

    expect(result).not.toContain('codex_hooks');
    expect(result).toContain('hooks = true');
    expect(result).toContain('other_key = false');
  });

  it('test_removes_deprecated_and_updates_existing', () => {
    const result = mergeTomlFeatures(
      '[features]\ncodex_hooks = true\nhooks = false\n',
      'hooks',
      'true',
      { deprecatedKeys: ['codex_hooks'] },
    );

    expect(result).not.toContain('codex_hooks');
    expect(result).toContain('hooks = true');
    expect(result).not.toContain('hooks = false');
  });

  it('test_strip_removes_key', () => {
    const result = stripTomlFeature('[features]\nhooks = true\nother_key = false\n', 'hooks');

    expect(result).not.toContain('hooks');
    expect(result).toContain('other_key = false');
  });

  it('test_strip_removes_empty_section', () => {
    const result = stripTomlFeature('[features]\nhooks = true\n', 'hooks');

    expect(result).not.toContain('[features]');
  });

  it('test_roundtrip', () => {
    const merged = mergeTomlFeatures('[other]\nfoo = 1\n', 'hooks', 'true');
    const stripped = stripTomlFeature(merged, 'hooks');

    expect(stripped).not.toContain('hooks');
    expect(stripped).toContain('foo = 1');
  });

  it('test_preserves_other_sections_after', () => {
    const result = stripTomlFeature('[features]\nhooks = true\n\n[other]\nbar = 2\n', 'hooks');

    expect(result).toContain('[other]');
    expect(result).toContain('bar = 2');
    expect(result).not.toContain('[features]');
  });
});

// ── .env file ────────────────────────────────────────────────────────

describe('TestEnvFile', () => {
  it('test_write_new', () => {
    const path = join(home, '.env');
    writeEnvFile(path, { API_KEY: 'secret123' });

    expect(readFileSync(path, 'utf8')).toContain('API_KEY=secret123');
  });

  it('test_dedup_update', () => {
    const path = join(home, '.env');
    writeEnvFile(path, { API_KEY: 'old', SPACE: 's1' });
    writeEnvFile(path, { API_KEY: 'new' });

    const content = readFileSync(path, 'utf8');
    expect(content).toContain('API_KEY=new');
    expect(content).not.toContain('API_KEY=old');
    expect(content).toContain('SPACE=s1');
  });

  it('test_preserves_comments', () => {
    const path = join(home, '.env');
    writeFileSync(path, '# comment line\nAPI_KEY=old\n', 'utf8');
    writeEnvFile(path, { API_KEY: 'new' });

    const content = readFileSync(path, 'utf8');
    expect(content).toContain('# comment line');
    expect(content).toContain('API_KEY=new');
  });

  it('test_strip_keys', () => {
    const path = join(home, '.env');
    writeEnvFile(path, { API_KEY: 'val', REGION: 'cn-test-1' });
    stripEnvKeys(path, ['API_KEY']);

    const content = readFileSync(path, 'utf8');
    expect(content).not.toContain('API_KEY');
    expect(content).toContain('REGION=cn-test-1');
  });

  it('test_strip_all_keys_removes_file', () => {
    const path = join(home, '.env');
    writeEnvFile(path, { API_KEY: 'val' });
    stripEnvKeys(path, ['API_KEY']);

    expect(existsSync(path)).toBe(false);
  });
});

// ── remove_if_empty ──────────────────────────────────────────────────

describe('TestRemoveIfEmpty', () => {
  it('test_empty_file_removed', () => {
    const path = join(home, 'empty.txt');
    writeFileSync(path, '', 'utf8');

    removeIfEmpty(path);

    expect(existsSync(path)).toBe(false);
  });

  it('test_nonempty_file_kept', () => {
    const path = join(home, 'data.txt');
    writeFileSync(path, 'data', 'utf8');

    removeIfEmpty(path);

    expect(existsSync(path)).toBe(true);
  });

  it('test_empty_dir_removed', () => {
    const directory = join(home, 'emptydir');
    mkdirSync(directory);

    removeIfEmpty(directory);

    expect(existsSync(directory)).toBe(false);
  });

  it('test_nonempty_dir_kept', () => {
    const directory = join(home, 'nonempty');
    mkdirSync(directory);
    writeFileSync(join(directory, 'file.txt'), 'data', 'utf8');

    removeIfEmpty(directory);

    expect(existsSync(directory)).toBe(true);
  });
});

// ── Interactive prompts (with --yes) ─────────────────────────────────

describe('TestInteractive', () => {
  it('test_confirm_yes_flag', async () => {
    setYes(true);
    expect(await confirm('test?', true)).toBe(true);
    expect(await confirm('test?', false)).toBe(false);
    setYes(false);
  });

  it('test_prompt_input_yes_flag', async () => {
    setYes(true);
    expect(await promptInput('enter', 'fallback')).toBe('fallback');
    setYes(false);
  });

  it('test_select_one_yes_flag', async () => {
    setYes(true);
    expect(await selectOne('pick', ['a', 'b'], 1)).toBe(1);
    setYes(false);
  });
});

describe('TestEscapeInterrupt', () => {
  it('test_confirm_propagates_escape', async () => {
    // confirm() must not swallow EscapeInterrupt.
    setYes(false);
    promptMocks.escapeError = new EscapeInterrupt();
    promptMocks.replies = [{ escape: true }];

    await expect(confirm('test?', true)).rejects.toBeInstanceOf(EscapeInterrupt);
  });

  it('test_prompt_input_propagates_escape', async () => {
    setYes(false);
    promptMocks.escapeError = new EscapeInterrupt();
    promptMocks.replies = [{ escape: true }];

    await expect(promptInput('enter')).rejects.toBeInstanceOf(EscapeInterrupt);
  });

  it('test_select_one_propagates_escape', async () => {
    setYes(false);
    promptMocks.escapeError = new EscapeInterrupt();
    promptMocks.replies = [{ escape: true }];

    await expect(selectOne('pick', ['a', 'b'])).rejects.toBeInstanceOf(EscapeInterrupt);
  });

  it('test_confirm_returns_default_without_tty', async () => {
    // Python falls back to `input()` when there is no TTY; the Node port returns
    // the default instead of reading (see the reply for the difference).
    setYes(false);
    stdinStub.isTTY = false;
    // No replies: reading would fail the test.

    await expect(confirm('test?', false)).resolves.toBe(false);
  });
});

// -- _command_contains_scripts_dir (cross-platform slash matching) --

describe('TestCommandContainsScriptsDir', () => {
  /**
   * `_command_contains_scripts_dir` is module-private in the port, so the
   * matching rule is asserted through `stripHooks`: "matches" ⇔ the hook is
   * removed.
   */
  const hooksWith = (command: string): Record<string, any[]> => ({
    SessionStart: [{ hooks: [{ type: 'command', command }] }],
  });

  it('test_forward_slash_match', () => {
    const entry = 'node "/home/u/.codex/agentarts-memory/scripts/prompt-submit.mjs"';

    expect(stripHooks(hooksWith(entry), '/home/u/.codex/agentarts-memory/scripts')).toEqual({});
  });

  it('test_backslash_scripts_dir_matches_forward_slash_cmd', () => {
    // Windows scripts_dir (backslashes) matches a forward-slash command.
    const entry = 'node "C:/Users/test/.codex/agentarts-memory/scripts/prompt-submit.mjs"';
    const winScriptsDir = 'C:\\Users\\test\\.codex\\agentarts-memory\\scripts';

    expect(stripHooks(hooksWith(entry), winScriptsDir)).toEqual({});
  });

  it('test_backslash_cmd_matches_forward_slash_scripts_dir', () => {
    // Forward-slash scripts_dir matches a backslash command (legacy file).
    const entry = 'node "C:\\Users\\test\\.codex\\agentarts-memory\\scripts\\prompt-submit.mjs"';
    const scriptsDir = 'C:/Users/test/.codex/agentarts-memory/scripts';

    expect(stripHooks(hooksWith(entry), scriptsDir)).toEqual({});
  });

  it('test_no_match_unrelated_command', () => {
    const hooks = hooksWith('echo hello');

    expect(stripHooks(hooks, '/home/u/.codex/agentarts-memory/scripts')).toEqual(hooks);
  });

  it('test_no_match_different_scripts_dir', () => {
    const hooks = hooksWith('node "/other/path/scripts/prompt-submit.mjs"');

    expect(stripHooks(hooks, '/home/u/.codex/agentarts-memory/scripts')).toEqual(hooks);
  });
});

// -- Shell rc: Windows behavior --

describe('TestShellRcWindows', () => {
  it('test_get_shell_rc_returns_empty_on_windows', () => {
    stubPlatform('win32');

    expect(getShellRc()).toBe('');
  });

  it('test_write_shell_rc_uses_setx_on_windows', async () => {
    stubPlatform('win32');

    await writeShellRc({ [ENV_API_KEY]: 'secret123', [ENV_SPACE_ID]: 'space-12345' });

    expect(childProcessMocks.spawn).toHaveBeenCalledTimes(2);
    expect(childProcessMocks.spawn).toHaveBeenNthCalledWith(
      1,
      'setx',
      [ENV_API_KEY, 'secret123'],
      { stdio: 'ignore' },
    );
    expect(childProcessMocks.spawn).toHaveBeenNthCalledWith(
      2,
      'setx',
      [ENV_SPACE_ID, 'space-12345'],
      { stdio: 'ignore' },
    );
  });

  it('test_get_shell_rc_unix_unchanged', () => {
    stubPlatform('darwin');
    vi.stubEnv('SHELL', '/bin/zsh');

    expect(getShellRc()).toBe(join(home, '.zshrc'));
  });
});

// -- _mask_api_key --

describe('TestMaskApiKey', () => {
  /**
   * `_mask_api_key` is module-private and only reachable through the
   * existing-configuration display, which is the assertion below. The Python
   * cases for values shorter than 11 characters are unreachable in the port
   * because the API-key validator rejects them before any display happens
   * (documented in the reply).
   */
  it('test_shows_first_6_and_last_4', async () => {
    setEnvCreds();
    const printed = trackConsolePrint();
    promptMocks.replies = [{ line: 'y' }];

    await ensureCredentials(false);

    const apiLines = printed.filter((line) => line.includes('API Key'));
    expect(apiLines.some((line) => line.includes('abcdef***3456'))).toBe(true);
    expect(apiLines.some((line) => line.includes('abcdefghijklmnop123456'))).toBe(false);
  });
});

// -- ensure_credentials: existing config flow --

describe('TestEnsureCredentialsExistingConfig', () => {
  it('test_use_existing_skips_shell_rc', async () => {
    // Accepting existing config does not prompt for shell rc.
    setEnvCreds();
    promptMocks.replies = [{ line: 'y' }];

    const config = await ensureCredentials(false);

    expect(config[ENV_SPACE_ID]).toBe('my-space-12345');
    expect(config[ENV_API_KEY]).toBe('abcdefghijklmnop123456');
    expect(config[ENV_REGION]).toBe('cn-north-4');
    const text = out();
    expect(text).toContain('Use existing');
    expect(text).not.toContain('Save configuration');
  });

  it('test_override_triggers_shell_rc', async () => {
    // Overriding a value triggers the shell rc prompt.
    setEnvCreds();
    promptMocks.replies = [
      { line: 'n' }, // Use existing configuration? → no
      { line: '' }, // Space ID → default (unchanged)
      { line: 'new-api-key-12345678' }, // API Key → overridden
      { line: '' }, // Region → default (unchanged)
      { line: 'y' }, // Save configuration? → yes
    ];

    const config = await ensureCredentials(false);

    expect(config[ENV_API_KEY]).toBe('new-api-key-12345678');
    expect(config[ENV_SPACE_ID]).toBe('my-space-12345');
    expect(config[ENV_REGION]).toBe('cn-north-4');
    expect(out()).toContain('Save configuration');
  });

  it('test_override_same_values_skips_shell_rc', async () => {
    // Overriding but entering the same values does not trigger the shell rc.
    setEnvCreds();
    promptMocks.replies = [{ line: 'n' }, { line: '' }, { line: '' }, { line: '' }];

    const config = await ensureCredentials(false);

    expect(config[ENV_SPACE_ID]).toBe('my-space-12345');
    expect(config[ENV_API_KEY]).toBe('abcdefghijklmnop123456');
    expect(config[ENV_REGION]).toBe('cn-north-4');
    // "Use existing?" was asked, "Save configuration?" was NOT.
    const text = out();
    expect(text).toContain('Use existing');
    expect(text).not.toContain('Save configuration');
  });

  it('test_api_key_masked_in_display', async () => {
    // API key is shown as first 6 + *** + last 4, not the full key.
    setEnvCreds();
    const printed = trackConsolePrint();
    promptMocks.replies = [{ line: 'y' }];

    await ensureCredentials(false);

    const apiLines = printed.filter((line) => line.includes('API Key'));
    expect(apiLines.some((line) => line.includes('abcdef***3456'))).toBe(true);
    expect(apiLines.some((line) => line.includes('abcdefghijklmnop123456'))).toBe(false);
  });

  it('test_space_id_and_region_shown_full', async () => {
    // Space ID and Region are shown in full, not masked.
    setEnvCreds();
    const printed = trackConsolePrint();
    promptMocks.replies = [{ line: 'y' }];

    await ensureCredentials(false);

    expect(printed.some((line) => line.includes('my-space-12345'))).toBe(true);
    expect(printed.some((line) => line.includes('cn-north-4'))).toBe(true);
  });
});
