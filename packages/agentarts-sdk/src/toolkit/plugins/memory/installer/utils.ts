/**
 * AgentArts Memory installer - utilities.
 *
 * Ported from
 * `agentarts/toolkit/plugins/memory/installer/utils.py`. Consolidates: path
 * expansion, JSON5-tolerant read, atomic write, hook merge/strip, TOML
 * text-level merge, YAML text-level key set, .env dedup, status output,
 * interactive prompts, source-asset location, manifest (`installed.json`) CRUD,
 * and credential detection/validation/interactive fill.
 *
 * The Python helpers are synchronous; the ones that prompt the user are
 * asynchronous here (PORTING.md section 4) and are marked `async`.
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { spawn } from 'node:child_process';
import { homedir, platform } from 'node:os';
import { dirname, join, normalize } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

import { Console } from '../../../utils/common.js';
import { getMemoryAssetPath, memoryAssetsRoot, resolveMemoryModuleFile } from '../resources.js';

/** Shared `Console` (rich `Console()` counterpart). */
export const console = new Console();

let _YES = false;

/** True when the current platform has a POSIX TTY (Python `_HAS_TTY`). */
const _HAS_TTY = platform() !== 'win32';

/**
 * Python `str.splitlines()` counterpart.
 *
 * `''.splitlines()` is `[]` (not `['']`) and a trailing newline does not
 * produce a trailing empty element, unlike `String.prototype.split`.
 */
export function splitLines(text: string): string[] {
  if (text === '') {
    return [];
  }
  const lines = text.split(/\r?\n/);
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines;
}


/** Raised when the user presses ESC during an interactive prompt. */
export class EscapeInterrupt extends Error {
  constructor(message = 'escape pressed') {
    super(message);
    this.name = 'EscapeInterrupt';
  }
}

/** Raised when the user presses Ctrl+C during an interactive prompt. */
export class KeyboardInterrupt extends Error {
  constructor(message = 'keyboard interrupt') {
    super(message);
    this.name = 'KeyboardInterrupt';
  }
}

/** Raised when stdin reaches end-of-file during an interactive prompt. */
export class EOFError extends Error {
  constructor(message = 'EOF when reading a line') {
    super(message);
    this.name = 'EOFError';
  }
}

/** Set the global non-interactive flag (`--yes`). */
export function setYes(value: boolean): void {
  _YES = value;
}

/** The global non-interactive flag. */
export function isYes(): boolean {
  return _YES;
}

// ---- Path helpers ----------------------------------------------------

/**
 * Expand `~` and environment variables in `path`.
 *
 * `normalize` ensures OS-native separators (on Windows `expanduser("~/.codex")`
 * would otherwise produce `C:\Users\.../.codex` with mixed separators).
 */
export function expand(path: string): string {
  return normalize(expandVars(expandUser(path)));
}

/** `os.path.expanduser` counterpart. */
function expandUser(path: string): string {
  if (path === '~') {
    return homedir();
  }
  if (path.startsWith('~/') || path.startsWith('~\\')) {
    return join(homedir(), path.slice(2));
  }
  return path;
}

/** `os.path.expandvars` counterpart (`$VAR` / `${VAR}`; unknown stays intact). */
function expandVars(path: string): string {
  return path.replace(
    /\$(\w+)|\$\{([^}]+)\}/g,
    (match, bare: string | undefined, braced: string | undefined) => {
      const name = bare ?? braced ?? '';
      const value = process.env[name];
      return value === undefined ? match : value;
    },
  );
}

// ---- JSON5 tolerance -------------------------------------------------

/**
 * Remove line comments, block comments and trailing commas from `text`.
 *
 * Respects string literals so `http://` inside strings is preserved.
 */
export function stripJson5(text: string): string {
  const result: string[] = [];
  let i = 0;
  const length = text.length;
  let inString = false;
  let stringChar = '';

  while (i < length) {
    const ch = text[i]!;

    // Handle string boundaries (skip escaped quotes).
    if (inString) {
      result.push(ch);
      if (ch === '\\' && i + 1 < length) {
        result.push(text[i + 1]!);
        i += 2;
        continue;
      }
      if (ch === stringChar) {
        inString = false;
      }
      i += 1;
      continue;
    }

    // Enter string.
    if (ch === '"' || ch === "'") {
      inString = true;
      stringChar = ch;
      result.push(ch);
      i += 1;
      continue;
    }

    // Line comment: // to end of line.
    if (ch === '/' && i + 1 < length && text[i + 1] === '/') {
      while (i < length && text[i] !== '\n') {
        i += 1;
      }
      continue;
    }

    // Block comment: slash-star to star-slash.
    if (ch === '/' && i + 1 < length && text[i + 1] === '*') {
      i += 2;
      while (i < length && !(text[i] === '*' && i + 1 < length && text[i + 1] === '/')) {
        i += 1;
      }
      i += 2; // skip the closing star-slash
      continue;
    }

    result.push(ch);
    i += 1;
  }

  // Remove trailing commas before } or ].
  return result.join('').replace(/,\s*([}\]])/g, '$1');
}

/** Read a JSON file with comment/trailing-comma tolerance; `{}` if missing. */
export function readJson(path: string): Record<string, any> {
  if (!existsSync(path)) {
    return {};
  }
  return JSON.parse(stripJson5(readFileSync(path, 'utf8'))) as Record<string, any>;
}

/** Atomically write `data` as JSON to `path` (write tmp + rename). */
export function writeJsonAtomic(path: string, data: Record<string, any>, indent = 2): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(data, null, indent)}\n`, 'utf8');
  renameSync(tmp, path);
}

// ---- Hook merge / strip ---------------------------------------------

/** Check whether a single hook entry's command references `scriptsDir`. */
function _commandContainsScriptsDir(hookEntry: Record<string, any>, scriptsDir: string): boolean {
  const cmd = String(hookEntry?.['command'] ?? '');
  // Normalize to forward slashes for cross-platform matching. Commands are
  // written with forward slashes (see `_loadHooksTemplate`), but `scriptsDir`
  // may carry OS-native backslashes on Windows.
  return cmd.replace(/\\/g, '/').includes(scriptsDir.replace(/\\/g, '/'));
}

/**
 * Remove all hook entries whose command contains `scriptsDir`.
 *
 * `hooksObj` is the value of the `"hooks"` key, i.e. a mapping of event names
 * to lists of hook groups. Empty groups / events are removed.
 */
export function stripHooks(
  hooksObj: Record<string, any[]>,
  scriptsDir: string,
): Record<string, any[]> {
  const result: Record<string, any[]> = {};
  for (const [event, groups] of Object.entries(hooksObj ?? {})) {
    const newGroups: Record<string, any>[] = [];
    for (const group of groups ?? []) {
      const innerHooks: Record<string, any>[] = group?.['hooks'] ?? [];
      const filtered = innerHooks.filter((hook) => !_commandContainsScriptsDir(hook, scriptsDir));
      if (filtered.length > 0) {
        newGroups.push({ ...group, hooks: filtered });
      }
    }
    if (newGroups.length > 0) {
      result[event] = newGroups;
    }
  }
  return result;
}

/**
 * Merge `incoming` hooks into `existing` (idempotent: strip then add).
 *
 * Both objects may have a top-level `"hooks"` key. The returned object
 * preserves all non-hooks keys from `existing`.
 */
export function mergeHooks(
  existing: Record<string, any>,
  incoming: Record<string, any>,
  scriptsDir: string,
): Record<string, any> {
  const result: Record<string, any> = { ...existing };
  const existingHooks = stripHooks(result['hooks'] ?? {}, scriptsDir);
  const incomingHooks: Record<string, any[]> = incoming?.['hooks'] ?? {};

  // Append incoming groups to each event.
  for (const [event, groups] of Object.entries(incomingHooks)) {
    if (!(event in existingHooks)) {
      existingHooks[event] = [];
    }
    existingHooks[event]!.push(...(groups ?? []));
  }

  if (Object.keys(existingHooks).length > 0) {
    result['hooks'] = existingHooks;
  } else {
    delete result['hooks'];
  }

  return result;
}

/** Strip our hooks from `settings` and remove the hooks key if it becomes empty. */
export function removeHooksKey(
  settings: Record<string, any>,
  scriptsDir: string,
): Record<string, any> {
  const cleaned = stripHooks(settings?.['hooks'] ?? {}, scriptsDir);
  const result: Record<string, any> = { ...settings };
  if (Object.keys(cleaned).length > 0) {
    result['hooks'] = cleaned;
  } else {
    delete result['hooks'];
  }
  return result;
}

// ---- TOML text-level merge -------------------------------------------

/** Options of {@link mergeTomlFeatures}. */
export interface MergeTomlFeaturesOptions {
  /** Deprecated keys removed from the section first. */
  deprecatedKeys?: string[] | null;
}

/**
 * Ensure the `[features]` section contains `key = value`.
 *
 * Works at the text level (no toml dependency). Preserves existing keys and
 * sections. If `deprecatedKeys` is provided, those keys are removed from the
 * section first.
 */
export function mergeTomlFeatures(
  text: string,
  key: string,
  value: string,
  options: MergeTomlFeaturesOptions = {},
): string {
  const deprecatedKeys = options.deprecatedKeys ?? null;
  let lines = splitLines(text);

  // Try to find an existing [features] section.
  let featuresStart: number | null = null;
  let featuresEnd = lines.length;
  for (let idx = 0; idx < lines.length; idx += 1) {
    const stripped = lines[idx]!.trim();
    if (stripped === '[features]') {
      featuresStart = idx;
      continue;
    }
    if (featuresStart !== null && stripped.startsWith('[') && stripped.endsWith(']')) {
      featuresEnd = idx;
      break;
    }
  }

  if (featuresStart !== null) {
    // Check if the key already exists in the section.
    let sectionLines = lines.slice(featuresStart + 1, featuresEnd);
    const keyLine = `${key} = ${value}`;

    // Remove deprecated keys.
    if (deprecatedKeys) {
      sectionLines = sectionLines.filter(
        (line) => !deprecatedKeys.some((deprecated) => line.trim().startsWith(`${deprecated} `)),
      );
    }

    let found = false;
    for (let i = 0; i < sectionLines.length; i += 1) {
      if (sectionLines[i]!.trim().startsWith(`${key} `)) {
        sectionLines[i] = keyLine;
        found = true;
        break;
      }
    }
    if (!found) {
      sectionLines.push(keyLine);
    }
    lines = [...lines.slice(0, featuresStart + 1), ...sectionLines, ...lines.slice(featuresEnd)];
  } else {
    // No [features] section - append one.
    if (lines.length > 0 && lines[lines.length - 1]!.trim() !== '') {
      lines.push('');
    }
    lines.push('[features]');
    lines.push(`${key} = ${value}`);
  }

  return `${lines.join('\n')}\n`;
}

/**
 * Remove the `key = ...` line from the `[features]` section.
 *
 * If the section becomes empty, the section header is removed too.
 */
export function stripTomlFeature(text: string, key: string): string {
  const lines = splitLines(text);
  let featuresStart: number | null = null;
  let featuresEnd = lines.length;
  for (let idx = 0; idx < lines.length; idx += 1) {
    const stripped = lines[idx]!.trim();
    if (stripped === '[features]') {
      featuresStart = idx;
      continue;
    }
    if (featuresStart !== null && stripped.startsWith('[') && stripped.endsWith(']')) {
      featuresEnd = idx;
      break;
    }
  }

  if (featuresStart === null) {
    return text;
  }

  const sectionLines = lines
    .slice(featuresStart + 1, featuresEnd)
    .filter((line) => !line.trim().startsWith(`${key} `));

  let result = [...lines.slice(0, featuresStart + 1), ...sectionLines, ...lines.slice(featuresEnd)];
  // If the section body is now empty (only whitespace), remove the header too.
  const body = sectionLines.filter((line) => line.trim() !== '');
  if (body.length === 0) {
    result = [...lines.slice(0, featuresStart), ...lines.slice(featuresEnd)];
  }

  // Ensure trailing newline.
  let textResult = result.join('\n');
  if (text.length > 0 && text.endsWith('\n') && !textResult.endsWith('\n')) {
    textResult += '\n';
  }
  return textResult;
}

/**
 * Set `section.key` in a YAML file at the text level.
 *
 * Preserves all other content. Creates the file and section if absent. Uses
 * 2-space indentation, like the Python implementation (no YAML round-trip).
 */
export function setYamlKey(path: string, section: string, key: string, value: string): void {
  const text = existsSync(path) ? readFileSync(path, 'utf8') : '';
  let lines = splitLines(text);

  // Find the section header (top-level key, e.g. "memory:").
  let sectionStart: number | null = null;
  let sectionEnd = lines.length;
  for (let idx = 0; idx < lines.length; idx += 1) {
    const line = lines[idx]!;
    const stripped = line.trim();
    const isTop = stripped !== '' && !/^\s/.test(line);
    if (sectionStart === null) {
      if (isTop && (stripped === `${section}:` || stripped.startsWith(`${section}:`))) {
        sectionStart = idx;
        continue;
      }
    } else if (isTop && !stripped.startsWith('#') && stripped.includes(':')) {
      sectionEnd = idx;
      break;
    }
  }

  // Format the key line.
  const keyLine = value ? `  ${key}: ${value}` : `  ${key}: ''`;

  if (sectionStart !== null) {
    const sectionLines = lines.slice(sectionStart + 1, sectionEnd);
    let found = false;
    for (let i = 0; i < sectionLines.length; i += 1) {
      if (sectionLines[i]!.trim().startsWith(`${key}:`)) {
        sectionLines[i] = keyLine;
        found = true;
        break;
      }
    }
    if (!found) {
      sectionLines.push(keyLine);
    }
    lines = [...lines.slice(0, sectionStart + 1), ...sectionLines, ...lines.slice(sectionEnd)];
  } else {
    if (lines.length > 0 && lines[lines.length - 1]!.trim() !== '') {
      lines.push('');
    }
    lines.push(`${section}:`);
    lines.push(keyLine);
  }

  mkdirSync(dirname(path), { recursive: true });
  const result = `${lines.join('\n')}\n`;
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, result, 'utf8');
  renameSync(tmp, path);
}

// ---- MCP server config helpers ---------------------------------------

/**
 * Merge an MCP server entry into a settings object (Claude Code
 * `settings.json`). Idempotent: replaces an existing entry with the same name.
 */
export function mergeMcpServers(
  settings: Record<string, any>,
  name: string,
  command: string,
  args: string[],
  env: Record<string, string>,
): Record<string, any> {
  const result: Record<string, any> = { ...settings };
  const mcpServers: Record<string, any> = { ...(result['mcpServers'] ?? {}) };
  mcpServers[name] = { command, args: [...args], env: { ...env } };
  result['mcpServers'] = mcpServers;
  return result;
}

/**
 * Remove an MCP server entry from a settings object.
 *
 * Returns the settings without the named server; removes the `mcpServers` key
 * when it becomes empty.
 */
export function stripMcpServers(settings: Record<string, any>, name: string): Record<string, any> {
  const result: Record<string, any> = { ...settings };
  const mcpServers: Record<string, any> = { ...(result['mcpServers'] ?? {}) };
  delete mcpServers[name];
  if (Object.keys(mcpServers).length > 0) {
    result['mcpServers'] = mcpServers;
  } else {
    delete result['mcpServers'];
  }
  return result;
}

/**
 * Ensure the TOML text contains `[mcp_servers.{name}]`.
 *
 * Works at the text level (no toml dependency). Idempotent: removes an existing
 * section with the same name first, then appends.
 */
export function mergeTomlMcpServer(
  text: string,
  name: string,
  command: string,
  args: string[],
  env: Record<string, string>,
): string {
  // First strip any existing section with this name.
  const stripped = stripTomlMcpServer(text, name);

  const lines: string[] = [];
  // Format args as a TOML array - JSON.stringify properly escapes backslashes
  // and quotes (TOML basic strings use the same escape sequences).
  const argsStr = args.map((arg) => JSON.stringify(arg)).join(', ');
  lines.push(`[mcp_servers.${name}]`);
  lines.push(`command = ${JSON.stringify(command)}`);
  lines.push(`args = [${argsStr}]`);
  if (Object.keys(env).length > 0) {
    lines.push('');
    for (const [key, value] of Object.entries(env)) {
      lines.push(`${key} = ${JSON.stringify(value)}`);
    }
  }
  lines.push('');

  let result = stripped.replace(/\s+$/, '');
  if (result) {
    result += '\n';
  }
  result += `${lines.join('\n')}\n`;
  return result;
}

/**
 * Remove the `[mcp_servers.{name}]` section from TOML text.
 *
 * Handles both `[mcp_servers.name]` and `[mcp_servers.name.env]` sub-sections.
 */
export function stripTomlMcpServer(text: string, name: string): string {
  const sectionHeader = `[mcp_servers.${name}`;
  const lines = splitLines(text);
  const result: string[] = [];
  let inSection = false;

  for (const line of lines) {
    const stripped = line.trim();
    // Check if this line starts a new section.
    if (stripped.startsWith('[') && stripped.endsWith(']')) {
      if (stripped.startsWith(sectionHeader)) {
        inSection = true;
        continue;
      }
      inSection = false;
    }
    if (inSection) {
      continue;
    }
    result.push(line);
  }

  let textResult = result.join('\n');
  // Clean up trailing blank lines.
  textResult = textResult.trim() !== '' ? `${textResult.replace(/\s+$/, '')}\n` : '';
  return textResult;
}

/**
 * Merge an MCP server entry into an `opencode.json` config object.
 *
 * Idempotent: replaces an existing entry with the same name first.
 */
export function mergeOpencodeMcp(
  config: Record<string, any>,
  name: string,
  command: string[],
  env: Record<string, string>,
): Record<string, any> {
  const result: Record<string, any> = { ...config };
  const mcp: Record<string, any> = { ...(result['mcp'] ?? {}) };
  mcp[name] = { type: 'local', command: [...command], environment: { ...env } };
  result['mcp'] = mcp;
  return result;
}

/**
 * Remove an MCP server entry from an `opencode.json` config object.
 *
 * Returns the config without the named server; removes the `mcp` key when it
 * becomes empty.
 */
export function stripOpencodeMcp(config: Record<string, any>, name: string): Record<string, any> {
  const result: Record<string, any> = { ...config };
  const mcp: Record<string, any> = { ...(result['mcp'] ?? {}) };
  delete mcp[name];
  if (Object.keys(mcp).length > 0) {
    result['mcp'] = mcp;
  } else {
    delete result['mcp'];
  }
  return result;
}

// ---- MCP server config constants -------------------------------------

export const MCP_SERVER_NAME = 'agentarts_memory';

/** Package-internal module path (Python: `agentarts.toolkit.plugins.memory.mcp.server`). */
export const MCP_SERVER_MODULE = 'toolkit/plugins/memory/mcp/server';

/**
 * Command used to launch the MCP server.
 *
 * Python uses `sys.executable` so the server runs under the interpreter that
 * has `agentarts` installed; the Node.js counterpart is the current Node
 * executable.
 */
export const MCP_SERVER_COMMAND = process.execPath;

/**
 * Arguments of the MCP server command.
 *
 * Resolved lazily: the absolute path of `toolkit/plugins/memory/mcp/server.js`
 * inside the installed package (`dist/`) or its `.ts` source in a checkout
 * (Python counterpart: `["-m", "agentarts.toolkit.plugins.memory.mcp.server"]`).
 */
export function mcpServerArgs(): string[] {
  return [resolveMemoryModuleFile('plugins/memory/mcp/server')];
}

/**
 * Build the env dict for MCP server config from credentials.
 *
 * Includes `AGENTARTS_MEMORY_PLATFORM` so the MCP server subprocess can resolve
 * the correct default user ID (e.g. `opencode-user`, `cc-user`).
 */
export function buildMcpEnv(
  creds: Record<string, string>,
  platformName = '',
): Record<string, string> {
  const env: Record<string, string> = {};
  if (platformName) {
    env['AGENTARTS_MEMORY_PLATFORM'] = platformName;
  }
  if (creds[ENV_API_KEY]) {
    env[ENV_API_KEY] = creds[ENV_API_KEY]!;
  }
  if (creds[ENV_SPACE_ID]) {
    env[ENV_SPACE_ID] = creds[ENV_SPACE_ID]!;
  }
  if (creds[ENV_REGION]) {
    env[ENV_REGION] = creds[ENV_REGION]!;
  }
  return env;
}

/** Write `entries` to a `.env` file, deduplicating by key (atomic write). */
export function writeEnvFile(path: string, entries: Record<string, string>): void {
  const existing: Record<string, string> = {};
  const otherLines: string[] = [];

  if (existsSync(path)) {
    for (const line of splitLines(readFileSync(path, 'utf8'))) {
      if (line.includes('=') && !line.trim().startsWith('#')) {
        const separator = line.indexOf('=');
        existing[line.slice(0, separator).trim()] = line.slice(separator + 1);
      } else {
        otherLines.push(line);
      }
    }
  }

  Object.assign(existing, entries);
  mkdirSync(dirname(path), { recursive: true });

  const lines: string[] = [];
  // Preserve comment/blank lines first.
  lines.push(...otherLines);
  for (const [key, value] of Object.entries(existing)) {
    lines.push(`${key}=${value}`);
  }

  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${lines.join('\n')}\n`, 'utf8');
  renameSync(tmp, path);
}

/** Remove the specified keys from a `.env` file. An empty file is removed. */
export function stripEnvKeys(path: string, keys: string[]): void {
  if (!existsSync(path)) {
    return;
  }
  const keyset = new Set(keys);
  const kept: string[] = [];
  for (const line of splitLines(readFileSync(path, 'utf8'))) {
    if (line.includes('=') && !line.trim().startsWith('#')) {
      const key = line.slice(0, line.indexOf('=')).trim();
      if (keyset.has(key)) {
        continue;
      }
    }
    kept.push(line);
  }
  if (kept.length > 0) {
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, `${kept.join('\n')}\n`, 'utf8');
    renameSync(tmp, path);
  } else {
    try {
      unlinkSync(path);
    } catch {
      // Already gone.
    }
  }
}

// ---- Empty file/dir cleanup ------------------------------------------

/**
 * Remove `path` if it is an empty file or empty directory.
 *
 * For directories, recursively removes if all children are gone.
 */
export function removeIfEmpty(path: string): void {
  if (!existsSync(path)) {
    return;
  }
  const stats = statSync(path);
  if (stats.isFile()) {
    if (stats.size === 0) {
      unlinkSync(path);
    }
    return;
  }
  if (stats.isDirectory()) {
    // Try to remove if empty (ignore failure = not empty).
    try {
      const children = listTree(path).sort().reverse();
      for (const child of children) {
        const childStats = statSync(child);
        if (childStats.isFile() && childStats.size === 0) {
          unlinkSync(child);
        } else if (childStats.isDirectory()) {
          rmdirSync(child);
        }
      }
      rmdirSync(path);
    } catch {
      // Directory is not empty - nothing to do.
    }
  }
}

/** All descendants of `dir` (files and directories), depth-first. */
function listTree(dir: string): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const child = join(dir, entry.name);
    result.push(child);
    if (entry.isDirectory()) {
      result.push(...listTree(child));
    }
  }
  return result;
}

// ---- Status output ---------------------------------------------------

/** Print a green check mark, the label and an arrow to `path`. */
export function statusOk(label: string, path: string): void {
  console.print(`  [green]\u221a[/green] ${label} \u2192 ${normalize(path)}`);
}

/** Print a red cross mark and the error. */
export function statusErr(label: string, err: string): void {
  console.print(`  [red]\u00d7[/red] ${label} \u2014 ${err}`);
}

/** Print a yellow refresh mark for an updated file. */
export function statusUpdated(label: string, path: string): void {
  console.print(`  [yellow]\u21bb[/yellow] ${label} (updated) \u2192 ${normalize(path)}`);
}

// ---- Interactive prompts ---------------------------------------------

/**
 * Read a line of input with ESC detection.
 *
 * In raw terminal mode (POSIX TTY), ESC (`\x1b`) raises {@link EscapeInterrupt}
 * immediately; other platforms fall back to a regular line read, mirroring the
 * Python `input()` fallback when `termios` is unavailable.
 */
async function _inputWithEsc(prompt: string): Promise<string> {
  if (!_HAS_TTY || !process.stdin.isTTY) {
    return _readLine(prompt);
  }

  process.stdout.write(prompt);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');

  return new Promise<string>((resolve, reject) => {
    const buffer: string[] = [];
    const cleanup = (): void => {
      process.stdin.removeListener('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
    };
    const onData = (chunk: string): void => {
      for (const ch of chunk) {
        if (ch === '\x1b') {
          cleanup();
          process.stdout.write('\r\n');
          reject(new EscapeInterrupt());
          return;
        }
        if (ch === '\r' || ch === '\n') {
          cleanup();
          process.stdout.write('\r\n');
          resolve(buffer.join(''));
          return;
        }
        if (ch === '\x7f' || ch === '\b') {
          if (buffer.length > 0) {
            buffer.pop();
            process.stdout.write('\b \b');
          }
          continue;
        }
        if (ch === '\x03') {
          cleanup();
          process.stdout.write('\r\n');
          reject(new KeyboardInterrupt());
          return;
        }
        if (ch === '\x04') {
          cleanup();
          process.stdout.write('\r\n');
          reject(new EOFError());
          return;
        }
        if (ch >= '\x20' && ch <= '\x7e') {
          buffer.push(ch);
          process.stdout.write(ch);
        }
        // Ignore other control characters.
      }
    };
    process.stdin.on('data', onData);
  });
}

/** Plain line read via `node:readline/promises` (Python `input()`). */
async function _readLine(prompt: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await rl.question(prompt);
  } finally {
    rl.close();
  }
}

/**
 * Yes/no confirmation. Returns `defaultValue` when `--yes` or non-interactive.
 */
export async function confirm(prompt: string, defaultValue = true): Promise<boolean> {
  if (_YES || !process.stdin.isTTY) {
    return defaultValue;
  }
  const suffix = defaultValue ? ' [Y/n] ' : ' [y/N] ';
  let raw: string;
  try {
    raw = (await _inputWithEsc(prompt + suffix)).trim().toLowerCase();
  } catch (error) {
    if (error instanceof EOFError || error instanceof KeyboardInterrupt) {
      return defaultValue;
    }
    throw error;
  }
  if (!raw) {
    return defaultValue;
  }
  return raw === 'y' || raw === 'yes';
}

/** Text input prompt. Returns `defaultValue` when `--yes`. */
export async function promptInput(prompt: string, defaultValue = ''): Promise<string> {
  if (_YES) {
    return defaultValue;
  }
  let raw: string;
  try {
    raw = (await _inputWithEsc(`${prompt}: `)).trim();
  } catch (error) {
    if (error instanceof EOFError || error instanceof KeyboardInterrupt) {
      return defaultValue;
    }
    throw error;
  }
  return raw ? raw : defaultValue;
}

/** Single-choice select. Returns `defaultIndex` when `--yes` or non-interactive. */
export async function selectOne(
  prompt: string,
  options: string[],
  defaultIndex = 0,
): Promise<number> {
  if (_YES || !process.stdin.isTTY) {
    return defaultIndex;
  }
  console.print(prompt);
  options.forEach((option, i) => {
    const marker = i === defaultIndex ? '*' : ' ';
    console.print(`  ${i + 1}) ${option} ${marker}`);
  });
  let raw: string;
  try {
    raw = (await _inputWithEsc(`Choice (1-${options.length}) [${defaultIndex + 1}]: `)).trim();
  } catch (error) {
    if (error instanceof EOFError || error instanceof KeyboardInterrupt) {
      return defaultIndex;
    }
    throw error;
  }
  if (!raw) {
    return defaultIndex;
  }
  const index = Number.parseInt(raw, 10) - 1;
  if (Number.isInteger(index) && index >= 0 && index < options.length) {
    return index;
  }
  return defaultIndex;
}

// ---- Source asset location -------------------------------------------

/** The three `.mjs` hook scripts deployed for Claude Code / Codex. */
export const CODE_AGENT_SCRIPTS: string[] = [
  '_shared.mjs',
  'prompt-submit.mjs',
  'pre-compact.mjs',
];

/**
 * Absolute path of this installer package directory
 * (`<pkg>/dist/toolkit/plugins/memory/installer` or the `.ts` source dir).
 */
export function installerRoot(): string {
  return dirname(fileURLToPath(import.meta.url));
}

/**
 * Absolute path of the package root.
 *
 * Walks upward from this package looking for the `package.json` that declares
 * `agentarts-sdk` (Python counterpart: the `pyproject.toml` lookup); falls back
 * to the installer directory.
 */
export function repoRoot(): string {
  let current = installerRoot();
  for (;;) {
    const candidate = join(current, 'package.json');
    if (existsSync(candidate)) {
      try {
        const manifest = JSON.parse(readFileSync(candidate, 'utf8')) as Record<string, any>;
        if (typeof manifest['name'] === 'string') {
          return current;
        }
      } catch {
        // Keep walking.
      }
    }
    const parent = dirname(current);
    if (parent === current) {
      return installerRoot();
    }
    current = parent;
  }
}

/**
 * Absolute path of the memory plugins asset directory
 * (`assets/toolkit/plugins/memory`), which holds the `ai_agent` and `resources`
 * payloads as siblings of the `installer` package.
 */
export function pluginsRoot(): string {
  return memoryAssetsRoot();
}

/** The hermes plugin source directory. */
export function hermesSource(): string {
  return getMemoryAssetPath('ai_agent/hermes');
}

/** The code_agent plugin source directory. */
export function codeAgentSource(): string {
  return getMemoryAssetPath('resources');
}

/**
 * Absolute paths of the hermes files to deploy (provider, plugin.yaml, index).
 *
 * Python deploys `provider.py`, `plugin.yaml` and `__init__.py`; the Node.js
 * port deploys the provider module shipped next to the assets (compiled `.js`
 * in a built package, `.ts` in a source checkout), the manifest, and the
 * package entry module.
 */
export function hermesFiles(): string[] {
  return [
    resolveMemoryModuleFile('plugins/memory/ai_agent/hermes/provider'),
    getMemoryAssetPath('ai_agent/hermes/plugin.yaml'),
    resolveMemoryModuleFile('plugins/memory/ai_agent/hermes/index'),
  ];
}

/** Absolute paths of the hook scripts deployed for Claude Code / Codex. */
export function codeAgentScripts(): string[] {
  return CODE_AGENT_SCRIPTS.map((script) => getMemoryAssetPath(`resources/scripts/${script}`));
}

/** Path of the Claude hooks template (`ai_agent/claude_code/hooks.json`). */
export function claudeHooksTemplate(): string {
  return getMemoryAssetPath('ai_agent/claude_code/hooks.json');
}

/** Path of the Codex hooks template (`ai_agent/codex/hooks.codex.json`). */
export function codexHooksTemplate(): string {
  return getMemoryAssetPath('ai_agent/codex/hooks.codex.json');
}

/**
 * Mapping of target-relative path -> source absolute path for OpenCode.
 *
 * Keys are relative paths within the OpenCode config directory:
 * `plugins/agentarts-memory-capture.ts`, `commands/recall.md`,
 * `commands/remember.md`.
 */
export function opencodeFiles(): Record<string, string> {
  return {
    'plugins/agentarts-memory-capture.ts': getMemoryAssetPath(
      'ai_agent/opencode/agentarts-memory-capture.ts',
    ),
    'commands/recall.md': getMemoryAssetPath('ai_agent/opencode/commands/recall.md'),
    'commands/remember.md': getMemoryAssetPath('ai_agent/opencode/commands/remember.md'),
  };
}

// ---- Manifest (installed.json) ---------------------------------------

export const MANIFEST_DIR = '~/.agentarts';
export const MANIFEST_FILE = 'installed.json';

/** Absolute path of `installed.json`. */
export function manifestPath(): string {
  return expand(join(MANIFEST_DIR, MANIFEST_FILE));
}

/** Load the manifest; returns an empty skeleton when the file does not exist. */
export function load(): Record<string, any> {
  const data = readJson(manifestPath());
  if (!data || Object.keys(data).length === 0) {
    return { version: 1, installs: [] };
  }
  if (data['version'] === undefined) {
    data['version'] = 1;
  }
  if (data['installs'] === undefined) {
    data['installs'] = [];
  }
  return data;
}

/** Atomically write the manifest. */
export function save(data: Record<string, any>): void {
  writeJsonAtomic(manifestPath(), data);
}

/**
 * Append an installation record to the manifest.
 *
 * Removes any existing record with the same platform/scope/config_dir to avoid
 * duplicates (idempotent re-install).
 */
export function add(entry: Record<string, any>): void {
  const data = load();
  let installs: Record<string, any>[] = data['installs'] ?? [];

  // Remove an existing matching record (idempotent).
  installs = installs.filter(
    (install) =>
      !(
        install['platform'] === entry['platform'] &&
        install['scope'] === entry['scope'] &&
        install['config_dir'] === entry['config_dir']
      ),
  );

  if (entry['installed_at'] === undefined) {
    entry['installed_at'] = new Date().toISOString().replace('Z', '+00:00');
  }
  installs.push(entry);
  data['installs'] = installs;
  save(data);
}

/** Remove a matching record. Returns the removed entry or `null`. */
export function remove(
  platformName: string,
  scope: string,
  configDir: string,
): Record<string, any> | null {
  const data = load();
  const installs: Record<string, any>[] = data['installs'] ?? [];
  let removed: Record<string, any> | null = null;
  const remaining: Record<string, any>[] = [];

  for (const install of installs) {
    if (
      install['platform'] === platformName &&
      install['scope'] === scope &&
      install['config_dir'] === configDir
    ) {
      removed = install;
    } else {
      remaining.push(install);
    }
  }

  data['installs'] = remaining;
  save(data);

  // Clean up the manifest file if no installs are left.
  if (remaining.length === 0) {
    const path = manifestPath();
    if (existsSync(path)) {
      unlinkSync(path);
    }
    // Also remove the directory if empty.
    try {
      rmdirSync(dirname(path));
    } catch {
      // Not empty.
    }
  }

  return removed;
}

/**
 * Find a matching install record.
 *
 * Matches by platform (required) and optionally scope/config_dir.
 */
export function find(
  platformName: string,
  scope?: string | null,
  configDir?: string | null,
): Record<string, any> | null {
  const data = load();
  for (const install of data['installs'] ?? []) {
    if (install['platform'] !== platformName) {
      continue;
    }
    if (scope !== undefined && scope !== null && install['scope'] !== scope) {
      continue;
    }
    if (configDir !== undefined && configDir !== null && install['config_dir'] !== configDir) {
      continue;
    }
    return install;
  }
  return null;
}

/** Return all install records. */
export function listAll(): Record<string, any>[] {
  return load()['installs'] ?? [];
}

// ---- Credentials -----------------------------------------------------

export const ENV_SPACE_ID = 'AGENTARTS_MEMORY_SPACE_ID';
export const ENV_API_KEY = 'HUAWEICLOUD_SDK_MEMORY_API_KEY';
export const ENV_REGION = 'HUAWEICLOUD_SDK_REGION';

export const DEFAULT_REGION = 'cn-southwest-2';

export const REQUIRED_VARS: readonly string[] = [ENV_SPACE_ID, ENV_API_KEY];
export const OPTIONAL_VARS: readonly string[] = [ENV_REGION];

// ---- Validators ------------------------------------------------------

/** Validate a Space ID: non-empty, at least 8 characters. */
export function validateSpaceId(value: string): [boolean, string] {
  if (!value || !value.trim()) {
    return [false, 'Space ID cannot be empty'];
  }
  const cleaned = value.trim();
  if (cleaned.length < 8) {
    return [false, 'Space ID must be at least 8 characters'];
  }
  return [true, cleaned];
}

/** Validate an API Key: non-empty, at least 16 characters. */
export function validateApiKey(value: string): [boolean, string] {
  if (!value || !value.trim()) {
    return [false, 'API Key cannot be empty'];
  }
  const cleaned = value.trim();
  if (cleaned.length < 16) {
    return [false, 'API Key must be at least 16 characters'];
  }
  return [true, cleaned];
}

/** Validate a region: three-part format (e.g. `cn-southwest-2`). */
export function validateRegion(value: string): [boolean, string] {
  if (!value || !value.trim()) {
    return [true, DEFAULT_REGION];
  }
  const cleaned = value.trim();
  if (cleaned.split('-').length !== 3) {
    return [false, "Region format should be like 'cn-southwest-2'"];
  }
  return [true, cleaned];
}

export type Validator = (value: string) => [boolean, string];

/** Validators by environment variable name. */
export const VALIDATORS: Record<string, Validator> = {
  [ENV_SPACE_ID]: validateSpaceId,
  [ENV_API_KEY]: validateApiKey,
  [ENV_REGION]: validateRegion,
};

/** Human-readable descriptions by environment variable name. */
export const VAR_DESCRIPTIONS: Record<string, string> = {
  [ENV_SPACE_ID]: 'Huawei Cloud AgentArts Memory Space ID',
  [ENV_API_KEY]: 'Huawei Cloud AgentArts Memory API Key',
  [ENV_REGION]: 'Huawei Cloud AgentArts Memory Region',
};

// ---- Environment detection -------------------------------------------

/**
 * Check whether all required environment variables are set and valid.
 *
 * Returns `[true, config]` when every required variable is valid, `[false,
 * partialConfig]` otherwise. The partial config contains whatever was
 * successfully validated.
 */
export function checkEnv(): [boolean, Record<string, string>] {
  const config: Record<string, string> = {};
  let allOk = true;

  for (const variable of REQUIRED_VARS) {
    const value = process.env[variable] ?? '';
    const validator = VALIDATORS[variable]!;
    const [ok, result] = validator(value);
    if (ok) {
      config[variable] = result;
    } else {
      allOk = false;
    }
  }

  // Region is optional with a default.
  const [regionOk, regionResult] = validateRegion(process.env[ENV_REGION] ?? '');
  config[ENV_REGION] = regionOk ? regionResult : DEFAULT_REGION;

  return [allOk, config];
}

/** Mask sensitive values for display. */
function _mask(value: string, varName: string): string {
  if (!value) {
    return '';
  }
  if (varName.includes('API_KEY') || varName.includes('SECRET') || varName.includes('SK')) {
    return _maskApiKey(value);
  }
  // Non-sensitive values (Space ID, Region) are shown in full.
  return value;
}

/** Mask an API key for display: first 6 + `***` + last 4 characters. */
function _maskApiKey(value: string): string {
  if (!value) {
    return '';
  }
  if (value.length <= 10) {
    return '*'.repeat(value.length);
  }
  return `${value.slice(0, 6)}***${value.slice(-4)}`;
}

// ---- Interactive fill ------------------------------------------------

/**
 * Interactively prompt for each missing variable.
 *
 * In `--yes` mode, returns the defaults (empty strings) without prompting.
 * Pass `defaults` to override the built-in default for each variable (e.g.
 * when re-prompting with existing env values as defaults).
 */
export async function interactiveFill(
  missing: string[],
  yes: boolean,
  defaults: Record<string, string> = {},
): Promise<Record<string, string>> {
  const filled: Record<string, string> = {};

  for (const variable of missing) {
    const description = VAR_DESCRIPTIONS[variable] ?? variable;
    const isOptional = OPTIONAL_VARS.includes(variable);
    const defaultValue = defaults[variable] ?? (isOptional ? DEFAULT_REGION : '');
    const validator = VALIDATORS[variable];

    if (yes) {
      filled[variable] = defaultValue;
      continue;
    }

    for (;;) {
      let promptText = `\n${description}`;
      if (isOptional && defaultValue) {
        promptText += ` (default: ${defaultValue})`;
      }
      let raw = await promptInput(promptText, defaultValue);

      if (isOptional && !raw) {
        raw = defaultValue;
      }

      if (validator) {
        const [ok, result] = validator(raw);
        if (!ok) {
          console.print(`  [red]\u00d7[/red] ${result}`);
          continue;
        }
        raw = result;
      }

      if (!raw && !isOptional) {
        console.print('  [red]\u00d7[/red] Value cannot be empty');
        continue;
      }

      const display = _mask(raw, variable);
      console.print(`  [green]\u221a[/green] Configured: ${display}`);
      filled[variable] = raw;
      break;
    }
  }

  return filled;
}

/**
 * Ensure all required credentials are available.
 *
 * 1. Check environment variables.
 * 2. If all exist: display them and ask whether to use or override.
 * 3. If some are missing: prompt for the missing ones.
 * 4. Only prompt for shell rc persistence if values changed.
 */
export async function ensureCredentials(yes: boolean): Promise<Record<string, string>> {
  const [initialOk, config] = checkEnv();
  let allOk = initialOk;

  // Snapshot of original env values for change detection.
  const originalEnv: Record<string, string> = {};
  for (const variable of [ENV_SPACE_ID, ENV_API_KEY, ENV_REGION]) {
    originalEnv[variable] = process.env[variable] ?? '';
  }

  if (!allOk) {
    const missing = REQUIRED_VARS.filter((variable) => !(variable in config));
    Object.assign(config, await interactiveFill(missing, yes));
    allOk = REQUIRED_VARS.every((variable) => Boolean(config[variable]));
  }

  if (!allOk) {
    console.print('\n[yellow]\u26a0[/yellow]  Missing required credentials. Please set:');
    for (const variable of REQUIRED_VARS) {
      if (!config[variable]) {
        console.print(`  ${variable}`);
      }
    }
    return config;
  }

  // Region has a default; if not set in env, prompt for it.
  if (!yes && !process.env[ENV_REGION]) {
    Object.assign(config, await interactiveFill([ENV_REGION], yes));
  }

  // Determine whether any values changed from the original env.
  let changed = false;
  const allEnvPresent = [ENV_SPACE_ID, ENV_API_KEY, ENV_REGION].every(
    (variable) => originalEnv[variable],
  );

  if (!yes && allEnvPresent) {
    // All three vars exist in the environment - show and confirm.
    console.print('\nExisting configuration found:');
    for (const variable of [ENV_SPACE_ID, ENV_API_KEY, ENV_REGION]) {
      const value = originalEnv[variable]!;
      const description = VAR_DESCRIPTIONS[variable] ?? variable;
      const display = variable === ENV_API_KEY ? _maskApiKey(value) : value;
      console.print(`  ${description}: ${display}`);
    }

    if (await confirm('Use existing configuration?', true)) {
      // User accepts existing values - nothing changed.
    } else {
      // User wants to override - prompt for all three with existing values as
      // defaults so Enter keeps the current value.
      Object.assign(
        config,
        await interactiveFill([...REQUIRED_VARS, ENV_REGION], false, originalEnv),
      );
      for (const variable of [ENV_SPACE_ID, ENV_API_KEY, ENV_REGION]) {
        if ((config[variable] ?? '') !== originalEnv[variable]) {
          changed = true;
          break;
        }
      }
    }
  } else if (!allEnvPresent) {
    // Some vars were missing from env and were just filled.
    changed = true;
  }

  // Only prompt for shell rc if something changed.
  if (!yes && changed) {
    let rcLabel: string;
    let applyHint: string;
    if (platform() === 'win32') {
      rcLabel = 'user environment';
      applyHint = 'Restart terminal to apply.';
    } else {
      rcLabel = 'shell rc';
      applyHint = "Run 'source' or restart terminal to apply.";
    }
    if (await confirm(`Save configuration to ${rcLabel} for persistence?`, true)) {
      await writeShellRc(config);
      console.print(`  [green]\u221a[/green] Configuration saved to ${rcLabel}`);
      console.print(`  ${applyHint}`);
    }
  }

  return config;
}

// ---- Shell rc helpers ------------------------------------------------

/**
 * Detect the current shell's rc file path.
 *
 * On Windows there is no traditional shell rc; `writeShellRc` uses `setx` for
 * persistence instead, so an empty string is returned.
 */
export function getShellRc(): string {
  if (platform() === 'win32') {
    return '';
  }
  const shell = process.env['SHELL'] ?? '';
  const home = homedir();
  if (shell.includes('zsh')) {
    return join(home, '.zshrc');
  }
  if (shell.includes('bash')) {
    return join(home, '.bashrc');
  }
  // Fallback.
  return join(home, '.bashrc');
}

/**
 * Write export lines to the shell rc, deduplicating by key.
 *
 * On Windows the values are persisted through `setx` (user environment).
 */
export async function writeShellRc(entries: Record<string, string>): Promise<void> {
  if (platform() === 'win32') {
    // On Windows, persist via setx (user environment variables).
    for (const [key, value] of Object.entries(entries)) {
      await runCommand(['setx', key, value]).catch(() => undefined);
    }
    return;
  }

  const rcPath = expand(getShellRc());
  const existing: string[] = [];
  const otherLines: string[] = [];

  if (existsSync(rcPath)) {
    for (const line of splitLines(readFileSync(rcPath, 'utf8'))) {
      const stripped = line.trim();
      if (stripped.startsWith('export ') && stripped.includes('=')) {
        // export KEY=value
        existing.push(stripped.slice('export '.length).split('=', 1)[0]!);
        otherLines.push(line);
      } else {
        otherLines.push(line);
      }
    }
  }

  // Build new content.
  let newLines = [...otherLines];
  const existingKeys = new Set(existing);
  for (const [key, value] of Object.entries(entries)) {
    if (existingKeys.has(key)) {
      // Replace the existing line.
      newLines = newLines.map((line) =>
        line.trim().startsWith(`export ${key}=`) ? `export ${key}=${value}` : line,
      );
    } else {
      newLines.push(`export ${key}=${value}`);
    }
  }

  writeFileSync(rcPath, `${newLines.join('\n')}\n`, 'utf8');
}

/**
 * Run a command to completion without capturing its output.
 *
 * Python counterpart: `subprocess.run(cmd, check=False, capture_output=True)`.
 */
export function runCommand(command: string[]): Promise<number> {
  return new Promise<number>((resolvePromise, reject) => {
    const [program, ...args] = command;
    if (!program) {
      resolvePromise(1);
      return;
    }
    const child = spawn(program, args, { stdio: 'ignore' });
    child.on('error', reject);
    child.on('close', (code) => resolvePromise(code ?? 1));
  });
}

/** Copy a file, creating the destination directory (Python `shutil.copy2`). */
export function copyFile(src: string, dst: string): void {
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(src, dst);
}

/** Remove a directory tree (Python `shutil.rmtree`). */
export function removeTree(path: string): void {
  if (!existsSync(path)) {
    return;
  }
  const stats = statSync(path);
  if (stats.isDirectory()) {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      removeTree(join(path, entry.name));
    }
    rmdirSync(path);
  } else {
    unlinkSync(path);
  }
}

/** Remove a single file if it exists (Python `Path.unlink(missing_ok=True)`). */
export function unlinkIfExists(path: string): void {
  if (existsSync(path)) {
    unlinkSync(path);
  }
}

/** True when `path` is a regular file (Python `os.path.isfile`). */
export function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** True when `path` is a directory (Python `os.path.isdir`). */
export function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** `os.rmdir` counterpart that ignores a missing/non-empty directory. */
export function tryRmdir(path: string): void {
  try {
    rmdirSync(path);
  } catch {
    // Directory is not empty.
  }
}
