/**
 * Runtime exec-command operation.
 *
 * Ported from `agentarts/toolkit/operations/runtime/exec_command.py`. The
 * backend runs the command as a Docker exec-form JSON array (no shell), so
 * shell-only constructs are auto-wrapped as `["sh", "-c", command]`.
 */

import { randomUUID } from 'node:crypto';

import { SignMode } from '../../../sdk/service/http-client.js';
import { RuntimeClient } from '../../../sdk/service/runtime-client.js';
import type { RuntimeResponse } from '../../../sdk/service/runtime-client.js';
import { getLogger } from '../../../sdk/utils/logging.js';
import { echoError } from '../../utils/common.js';
import { ValidationError } from './errors.js';
import { _getDataEndpoint, _resolveAgentInfo } from './invoke.js';

const logger = getLogger('toolkit.operations.runtime.exec_command');

/** Default request timeout in seconds. */
export const DEFAULT_TIMEOUT = 60;

/** Maximum allowed request timeout in seconds. */
export const MAX_TIMEOUT = 3600;

/**
 * Shell-only operators the backend's exec-form (Docker JSON-array) cannot
 * interpret: when present *outside quotes*, the command is meant for a shell, so
 * it is wrapped as `["sh", "-c", "<original string>"]` and `sh` re-parses
 * quotes / redirection / pipes consistently. Glob characters (`*`, `?`, `[`)
 * are deliberately not listed: a bare `*` is ambiguous (literal pattern vs
 * glob), which is left to an explicit `sh -c`.
 */
const _SHELL_OPERATOR_CHARS = '><|;&`';

/**
 * Whether `command` uses shell-only constructs outside quotes.
 *
 * Scans with single/double-quote and backslash-escape awareness so that quoted
 * metacharacters (e.g. `echo "a > b"`) do not trigger a wrap.
 */
export function _needsShell(command: string): boolean {
  let index = 0;
  const length = command.length;

  while (index < length) {
    const char = command[index];

    if (char === "'") {
      // single-quoted: no escaping, ends at the next quote
      index += 1;
      while (index < length && command[index] !== "'") {
        index += 1;
      }
      index += 1; // skip the closing quote (or run to the end)
      continue;
    }

    if (char === '"') {
      index += 1;
      while (index < length) {
        if (command[index] === '\\' && index + 1 < length) {
          index += 2;
          continue;
        }
        if (command[index] === '"') {
          break;
        }
        index += 1;
      }
      index += 1;
      continue;
    }

    if (char === '\\') {
      // unquoted escape: skip the next character
      index += 2;
      continue;
    }

    if (_SHELL_OPERATOR_CHARS.includes(char)) {
      return true;
    }

    if (char === '$' && index + 1 < length && command[index + 1] === '(') {
      return true; // $(...) command substitution
    }

    index += 1;
  }

  return false;
}

/**
 * Split a command string into words the way Python's `shlex.split()` does for
 * the subset of POSIX shell quoting the toolkit accepts.
 *
 * @throws {ValidationError} When a quote is left unterminated.
 */
function shlexSplit(command: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let hasToken = false;
  let index = 0;
  const length = command.length;

  const push = (): void => {
    if (hasToken) {
      tokens.push(current);
      current = '';
      hasToken = false;
    }
  };

  while (index < length) {
    const char = command[index];

    if (char === ' ' || char === '\t' || char === '\n' || char === '\r') {
      push();
      index += 1;
      continue;
    }

    if (char === "'") {
      hasToken = true;
      index += 1;
      while (index < length && command[index] !== "'") {
        current += command[index];
        index += 1;
      }
      if (index >= length) {
        throw new ValidationError('No closing quotation');
      }
      index += 1;
      continue;
    }

    if (char === '"') {
      hasToken = true;
      index += 1;
      while (index < length && command[index] !== '"') {
        if (command[index] === '\\' && index + 1 < length) {
          const next = command[index + 1];
          // Inside double quotes, shlex only treats `\` as an escape before the
          // escape character and the quote character.
          if (next === '"' || next === '\\') {
            current += next;
            index += 2;
            continue;
          }
          current += command[index];
          index += 1;
          continue;
        }
        current += command[index];
        index += 1;
      }
      if (index >= length) {
        throw new ValidationError('No closing quotation');
      }
      index += 1;
      continue;
    }

    if (char === '\\') {
      hasToken = true;
      if (index + 1 < length) {
        current += command[index + 1];
        index += 2;
      } else {
        current += char;
        index += 1;
      }
      continue;
    }

    hasToken = true;
    current += char;
    index += 1;
  }

  push();
  return tokens;
}

/**
 * Turn a command string into the argv the backend exec-form expects.
 *
 * - Plain command: `shlex.split()` gives the exec-form array (Docker
 *   exec-form).
 * - Shell constructs (redirection/pipe/`&&`/`;`/`$()`/backtick, outside quotes):
 *   the command becomes `["sh", "-c", command]` using the *original* string, so
 *   `sh` re-parses quotes and operators consistently.
 *
 * @throws {ValidationError} When the command is empty after splitting.
 */
export function buildCommandArray(command: string): string[] {
  if (_needsShell(command)) {
    logger.info(`exec-command: command contains shell operators; wrapping as sh -c ${command}`);
    return ['sh', '-c', command];
  }

  const parts = shlexSplit(command);
  if (parts.length === 0) {
    throw new ValidationError('Command cannot be empty');
  }
  return parts;
}

/** Options for {@link execRuntimeCommand} (Python keyword arguments). */
export interface ExecRuntimeCommandOptions {
  /** Agent name. */
  agentName?: string | null;
  /** Session ID (auto-generated when omitted). */
  sessionId?: string | null;
  /** Use chunked streaming mode (ndjson). */
  chunked?: boolean;
  /** Optional bearer token for authentication. */
  bearerToken?: string | null;
  /** Region name. */
  region?: string | null;
  /** Optional endpoint name. */
  endpoint?: string | null;
  /** Skip SSL certificate verification. */
  skipSslVerification?: boolean;
  /** User ID for OAuth2 outbound credentials. */
  userId?: string | null;
  /** Request timeout in seconds (default 60, max 3600). */
  timeout?: number;
}

/**
 * Execute a command in the runtime.
 *
 * Accepts either `execRuntimeCommand(command, options)` or a single
 * `execRuntimeCommand({ command, ...options })` object.
 *
 * @returns The command result object, or an async generator of ndjson lines in
 *   chunked mode.
 */
export function execRuntimeCommand(
  command: string,
  options?: ExecRuntimeCommandOptions,
): Promise<RuntimeResponse>;
export function execRuntimeCommand(
  options: ExecRuntimeCommandOptions & { command: string },
): Promise<RuntimeResponse>;
export async function execRuntimeCommand(
  commandOrOptions: string | (ExecRuntimeCommandOptions & { command: string }),
  options: ExecRuntimeCommandOptions = {},
): Promise<RuntimeResponse> {
  const opts: ExecRuntimeCommandOptions =
    typeof commandOrOptions === 'string' ? options : commandOrOptions;
  const command =
    typeof commandOrOptions === 'string' ? commandOrOptions : commandOrOptions.command;

  if (!command) {
    throw new ValidationError('Command is required');
  }

  const commandArray = buildCommandArray(command);

  // Auto-generate a session id when none was provided, mirroring `invoke`.
  let sessionId = opts.sessionId ?? null;
  if (!sessionId) {
    sessionId = randomUUID();
  }

  const timeout = opts.timeout ?? DEFAULT_TIMEOUT;
  if (timeout <= 0) {
    throw new ValidationError(`Timeout must be a positive number: ${timeout}`);
  }
  if (timeout > MAX_TIMEOUT) {
    throw new ValidationError(`Timeout exceeds maximum allowed value (${MAX_TIMEOUT}): ${timeout}`);
  }

  const [agentName, region, agentId, authType] = _resolveAgentInfo(
    opts.agentName ?? null,
    opts.region ?? null,
  );

  if (agentName === null) {
    echoError('No agent specified and no default agent configured');
    throw new ValidationError('Agent name is required');
  }

  const verifySsl = !(opts.skipSslVerification ?? false);
  const dataEndpoint = await _getDataEndpoint(agentName, region || '', agentId, verifySsl);

  if (!dataEndpoint) {
    throw new ValidationError(`No data endpoint for agent ${agentName}`);
  }

  let signMode = SignMode.SDK_HMAC_SHA256;
  if (authType && authType.toUpperCase() === 'IAM') {
    signMode = SignMode.V11_HMAC_SHA256;
  }

  const client = new RuntimeClient({
    dataEndpoint,
    regionId: region || '',
    verifySsl,
    signMode,
  });
  const bearerToken = opts.bearerToken ?? null;
  if (bearerToken) {
    client.setAuthToken(bearerToken);
  }

  return client.execCommand(agentName, sessionId, commandArray, {
    chunked: opts.chunked ?? false,
    bearerToken,
    endpoint: opts.endpoint ?? null,
    userId: opts.userId ?? null,
    timeout,
  });
}
