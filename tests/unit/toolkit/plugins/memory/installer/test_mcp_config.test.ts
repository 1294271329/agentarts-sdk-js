/**
 * Tests for the MCP config utility functions in `utils.ts`.
 *
 * Ported 1:1 from `tests/unit/toolkit/plugins/memory/installer/test_mcp_config.py`.
 *
 * The Python helpers are pure functions, so no file system or process mocking is
 * needed; the assertions mirror the Python ones verbatim (the TOML escaping
 * cases rely on `json.dumps`/`JSON.stringify` producing the same escape
 * sequences for TOML basic strings).
 *
 * Behaviour differences documented in the reply: `MCP_SERVER_ARGS` is a lazy
 * `mcpServerArgs()` function (Node runs a file instead of `-m module`) and
 * `MCP_SERVER_COMMAND` is `process.execPath` (Python: `sys.executable`).
 */

import { describe, expect, it } from 'vitest';

import {
  ENV_API_KEY,
  ENV_REGION,
  ENV_SPACE_ID,
  MCP_SERVER_COMMAND,
  MCP_SERVER_NAME,
  buildMcpEnv,
  isFile,
  mcpServerArgs,
  mergeMcpServers,
  mergeOpencodeMcp,
  mergeTomlMcpServer,
  stripMcpServers,
  stripOpencodeMcp,
  stripTomlMcpServer,
} from 'agentarts-sdk/toolkit/plugins/memory/installer/utils';

/** `str.count(needle)` counterpart. */
function countOf(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

describe('TestMergeStripMcpServers', () => {
  it('test_merge_adds_mcp_servers_key', () => {
    const settings = { theme: 'dark' };
    const result = mergeMcpServers(settings, 'my_server', 'python3', ['-m', 'foo'], {
      KEY: 'val',
    });

    expect('mcpServers' in result).toBe(true);
    expect(result['mcpServers']['my_server']['command']).toBe('python3');
    expect(result['mcpServers']['my_server']['args']).toEqual(['-m', 'foo']);
    expect(result['mcpServers']['my_server']['env']['KEY']).toBe('val');
    expect(result['theme']).toBe('dark');
  });

  it('test_merge_is_idempotent', () => {
    const settings = {};
    const result1 = mergeMcpServers(settings, 'srv', 'python3', [], {});
    const result2 = mergeMcpServers(result1, 'srv', 'python3', [], {});

    expect(Object.keys(result2['mcpServers'])).toEqual(['srv']);
  });

  it('test_merge_preserves_other_servers', () => {
    const settings = { mcpServers: { other: { command: 'node' } } };
    const result = mergeMcpServers(settings, 'srv', 'python3', [], {});

    expect('other' in result['mcpServers']).toBe(true);
    expect('srv' in result['mcpServers']).toBe(true);
  });

  it('test_strip_removes_server', () => {
    const settings = { mcpServers: { srv: { command: 'python3' } }, theme: 'dark' };
    const result = stripMcpServers(settings, 'srv');

    expect('mcpServers' in result).toBe(false);
    expect(result['theme']).toBe('dark');
  });

  it('test_strip_preserves_other_servers', () => {
    const settings = { mcpServers: { srv: {}, other: { command: 'node' } } };
    const result = stripMcpServers(settings, 'srv');

    expect('other' in result['mcpServers']).toBe(true);
    expect('srv' in result['mcpServers']).toBe(false);
  });

  it('test_strip_when_no_mcp_servers', () => {
    const settings = { theme: 'dark' };
    const result = stripMcpServers(settings, 'srv');

    expect('mcpServers' in result).toBe(false);
  });
});

describe('TestMergeStripTomlMcpServer', () => {
  it('test_merge_adds_section', () => {
    const text = '[features]\nhooks = true\n';
    const result = mergeTomlMcpServer(text, 'srv', 'python3', ['-m', 'foo'], { KEY: 'val' });

    expect(result).toContain('[mcp_servers.srv]');
    expect(result).toContain('command = "python3"');
    expect(result).toContain('args = ["-m", "foo"]');
    expect(result).toContain('KEY = "val"');
    expect(result).toContain('[features]');
    expect(result).toContain('hooks = true');
  });

  it('test_merge_is_idempotent', () => {
    const text = '';
    const result1 = mergeTomlMcpServer(text, 'srv', 'python3', [], {});
    const result2 = mergeTomlMcpServer(result1, 'srv', 'python3', [], {});

    expect(countOf(result2, '[mcp_servers.srv]')).toBe(1);
  });

  it('test_merge_no_env', () => {
    const text = '';
    const result = mergeTomlMcpServer(text, 'srv', 'python3', [], {});

    expect(result).toContain('[mcp_servers.srv]');
    expect(result).toContain('command = "python3"');
  });

  it('test_strip_removes_section', () => {
    const text =
      '[features]\nhooks = true\n\n[mcp_servers.srv]\ncommand = "python3"\nargs = []\n';
    const result = stripTomlMcpServer(text, 'srv');

    expect(result).not.toContain('[mcp_servers.srv]');
    expect(result).toContain('hooks = true');
  });

  it('test_strip_removes_env_subsection', () => {
    const text =
      '[features]\nhooks = true\n' +
      '\n[mcp_servers.srv]\ncommand = "python3"\nargs = []\n' +
      '\n[mcp_servers.srv.env]\nKEY = "val"\n';
    const result = stripTomlMcpServer(text, 'srv');

    expect(result).not.toContain('[mcp_servers.srv]');
    expect(result).toContain('hooks = true');
  });

  it('test_strip_preserves_other_sections', () => {
    const text =
      '[mcp_servers.other]\ncommand = "node"\n' + '\n[mcp_servers.srv]\ncommand = "python3"\n';
    const result = stripTomlMcpServer(text, 'srv');

    expect(result).toContain('[mcp_servers.other]');
    expect(result).not.toContain('[mcp_servers.srv]');
  });

  it('test_strip_when_not_present', () => {
    const text = '[features]\nhooks = true\n';
    const result = stripTomlMcpServer(text, 'srv');

    expect(result).toContain('hooks = true');
  });
});

describe('TestMergeStripOpenCodeMcp', () => {
  it('test_merge_adds_mcp_key', () => {
    const config = { theme: 'dark' };
    const result = mergeOpencodeMcp(config, 'srv', ['python3', '-m', 'foo'], { KEY: 'val' });

    expect('mcp' in result).toBe(true);
    expect(result['mcp']['srv']['type']).toBe('local');
    expect(result['mcp']['srv']['command']).toEqual(['python3', '-m', 'foo']);
    expect(result['mcp']['srv']['environment']['KEY']).toBe('val');
    expect(result['theme']).toBe('dark');
  });

  it('test_merge_is_idempotent', () => {
    const config = {};
    const result1 = mergeOpencodeMcp(config, 'srv', ['python3'], {});
    const result2 = mergeOpencodeMcp(result1, 'srv', ['python3'], {});

    expect(Object.keys(result2['mcp'])).toEqual(['srv']);
  });

  it('test_strip_removes_server', () => {
    const config = { mcp: { srv: { type: 'local' } }, theme: 'dark' };
    const result = stripOpencodeMcp(config, 'srv');

    expect('mcp' in result).toBe(false);
    expect(result['theme']).toBe('dark');
  });

  it('test_strip_preserves_other_servers', () => {
    const config = { mcp: { srv: {}, other: { type: 'local' } } };
    const result = stripOpencodeMcp(config, 'srv');

    expect('other' in result['mcp']).toBe(true);
    expect('srv' in result['mcp']).toBe(false);
  });
});

describe('TestBuildMcpEnv', () => {
  it('test_builds_env_from_creds', () => {
    const creds = {
      [ENV_API_KEY]: 'my-key',
      [ENV_SPACE_ID]: 'my-space',
      [ENV_REGION]: 'cn-north-4',
    };

    const env = buildMcpEnv(creds, 'opencode');

    expect(env[ENV_API_KEY]).toBe('my-key');
    expect(env[ENV_SPACE_ID]).toBe('my-space');
    expect(env[ENV_REGION]).toBe('cn-north-4');
    expect(env['AGENTARTS_MEMORY_PLATFORM']).toBe('opencode');
  });

  it('test_skips_missing_creds', () => {
    const creds = { [ENV_API_KEY]: 'my-key' };

    const env = buildMcpEnv(creds);

    expect(ENV_API_KEY in env).toBe(true);
    expect(ENV_SPACE_ID in env).toBe(false);
    expect(ENV_REGION in env).toBe(false);
  });

  it('test_empty_creds', () => {
    expect(buildMcpEnv({})).toEqual({});
  });

  it('test_platform_name_optional', () => {
    const creds = { [ENV_API_KEY]: 'my-key' };

    const env = buildMcpEnv(creds);

    expect('AGENTARTS_MEMORY_PLATFORM' in env).toBe(false);
  });
});

describe('TestConstants', () => {
  it('test_server_name', () => {
    expect(MCP_SERVER_NAME).toBe('agentarts_memory');
  });

  it('test_server_command', () => {
    expect(MCP_SERVER_COMMAND).toBe(process.execPath);
  });

  it('test_server_args', () => {
    // Node counterpart of `["-m", "agentarts.toolkit.plugins.memory.mcp.server"]`:
    // a single absolute path to the MCP server entry point.
    const args = mcpServerArgs();

    expect(args).toHaveLength(1);
    expect(args[0]).toContain('toolkit');
    expect(args[0]).toContain('mcp');
    expect(args[0]).toMatch(/server\.(ts|js)$/);
    expect(isFile(args[0]!)).toBe(true);
  });
});

describe('TestTomlBackslashEscaping', () => {
  it('test_command_with_backslashes', () => {
    const result = mergeTomlMcpServer('', 'srv', 'C:\\Users\\test\\python.exe', [], {});

    expect(result).toContain('command = "C:\\\\Users\\\\test\\\\python.exe"');
  });

  it('test_env_value_with_backslashes', () => {
    const result = mergeTomlMcpServer('', 'srv', 'python', [], { PATH: 'C:\\foo\\bar' });

    expect(result).toContain('PATH = "C:\\\\foo\\\\bar"');
  });

  it('test_args_with_backslashes', () => {
    const result = mergeTomlMcpServer('', 'srv', 'python', ['C:\\my module.py'], {});

    expect(result).toContain('"C:\\\\my module.py"');
  });

  it('test_normal_values_unchanged', () => {
    const result = mergeTomlMcpServer('', 'srv', 'python3', ['-m', 'foo'], { KEY: 'val' });

    expect(result).toContain('command = "python3"');
    expect(result).toContain('KEY = "val"');
  });
});
