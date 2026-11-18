/**
 * Runtime exec-command command.
 *
 * Ported from `agentarts/toolkit/cli/runtime/exec_command.py`.
 */

import { randomUUID } from 'node:crypto';

import { Command } from 'commander';

import {
  DEFAULT_TIMEOUT,
  MAX_TIMEOUT,
  execRuntimeCommand,
} from '../../operations/runtime/exec-command.js';
import { ValidationError } from '../../operations/runtime/errors.js';
import { isStreamingResponse } from '../../../sdk/service/runtime-client.js';
import { commandAction, console, echoError, echoInfo, echoSuccess, errorMessage } from '../common.js';

/** Options of the `exec-command` command (camelCase of the typer options). */
export interface ExecCommandOptions {
  /** `--agent/-a`: agent name (required). */
  agent?: string;
  /** `--session/-s`: session ID. */
  session?: string;
  /** `--chunked`: enable chunked streaming response (ndjson). */
  chunked: boolean;
  /** `--bearer-token/-bt`: bearer token for authentication. */
  bearerToken?: string;
  /** `--region/-r`: region name. */
  region?: string;
  /** `--endpoint/-e`: endpoint name. */
  endpoint?: string;
  /** `--skip-ssl-verification/-k`: skip SSL certificate verification. */
  skipSslVerification: boolean;
  /** `--user-id/-u`: user ID for OAuth2 outbound credentials. */
  userId?: string;
  /** `--timeout`: request timeout in seconds (default 60, max 3600). */
  timeout: number;
}

/** Validate the timeout parameter (Python `validate_timeout`). */
export function validateTimeout(timeout: number): number {
  if (timeout <= 0) {
    echoError(`Timeout must be a positive number: ${timeout}`);
    throw new ValidationError(`Timeout must be a positive number: ${timeout}`);
  }
  if (timeout > MAX_TIMEOUT) {
    echoError(`Timeout exceeds maximum allowed value (${MAX_TIMEOUT}): ${timeout}`);
    throw new ValidationError(`Timeout exceeds maximum allowed value (${MAX_TIMEOUT}): ${timeout}`);
  }
  return timeout;
}

/**
 * Execute a command in the runtime (cloud only).
 *
 * @returns Process exit code (`0` on success, `1` on failure).
 */
export async function execCommandCmd(
  command: string,
  options: ExecCommandOptions,
): Promise<number> {
  try {
    const validatedTimeout = validateTimeout(options.timeout);

    // Mirror `invoke`: auto-generate a session id when the user did not pass one.
    const sessionId = options.session || randomUUID();

    const modeStr = options.chunked ? 'chunked (ndjson)' : 'json';
    echoInfo(
      'Exec Command',
      `[cyan]Agent:[/cyan] [white]${options.agent}[/white]\n[cyan]Session:[/cyan] [dim]${sessionId}[/dim]\n[cyan]Mode:[/cyan] [yellow]${modeStr}[/yellow]\n[cyan]Command:[/cyan] [dim]${command}[/dim]`,
    );

    const result = await execRuntimeCommand(command, {
      agentName: options.agent ?? null,
      sessionId,
      chunked: options.chunked,
      bearerToken: options.bearerToken ?? null,
      region: options.region ?? null,
      endpoint: options.endpoint ?? null,
      skipSslVerification: options.skipSslVerification,
      userId: options.userId ?? null,
      timeout: validatedTimeout,
    });

    if (options.chunked && isStreamingResponse(result)) {
      echoSuccess('Streaming output (ndjson):');
      for await (const line of result) {
        try {
          const data = JSON.parse(line);
          console.printPlain(JSON.stringify(data, null, 2));
        } catch {
          console.print(line);
        }
      }
    } else {
      echoSuccess('Command executed');
      console.printPlain(JSON.stringify(result, null, 2));
    }

    return 0;
  } catch (error) {
    if (error instanceof ValidationError) {
      echoError(`Validation error: ${errorMessage(error)}`);
      return 1;
    }
    echoError(`Failed to execute command: ${errorMessage(error)}`);
    return 1;
  }
}

/** Build the `exec-command` command. */
export function createExecCommand(): Command {
  const command = new Command('exec-command');

  command
    .description('Execute command in runtime (cloud only).')
    .argument('<command>', "Command to execute (e.g., 'ls -la' or 'ls')")
    .option('-a, --agent <agent>', 'Agent name [required]')
    .option('-s, --session <session>', 'Session ID')
    .option('--chunked', 'Enable chunked streaming response (application/x-ndjson)', false)
    .option('--bearer-token <token>', 'Bearer token for authentication')
    .option('-r, --region <region>', 'Region name')
    .option('-e, --endpoint <endpoint>', 'Endpoint name')
    .option('-k, --skip-ssl-verification', 'Skip SSL certificate verification', false)
    .option('-u, --user-id <userId>', 'User ID for OAuth2 outbound credentials')
    .option(
      '--timeout <seconds>',
      `Request timeout in seconds (default: ${DEFAULT_TIMEOUT}, max: ${MAX_TIMEOUT})`,
      (value: string) => Number.parseInt(value, 10),
      DEFAULT_TIMEOUT,
    )
    .addHelpText(
      'after',
      `
The backend runs the command as a Docker exec-form JSON array (no shell), so
shell operators (>, |, ;, &&, $(), ...) are NOT interpreted by default. When
such operators are present (outside quotes), this command auto-wraps the
command as ["sh", "-c", "<command>"] so the shell interprets them. Quote
metacharacters (e.g. 'echo "a > b"') to pass them through literally. To force a
shell yourself, write 'sh -c "..."' explicitly.

Examples:
  agentarts runtime exec-command "ls -la" --agent myagent --session <session-id>
  agentarts runtime exec-command "echo 1214 > file.txt" --agent myagent --session <session-id>
  agentarts runtime exec-command "ls -la" --agent myagent --session <session-id> --chunked
  agentarts runtime exec-command "ls" --agent myagent --session <session-id> -bt <bearer-token>
  agentarts runtime exec-command "ls" --agent myagent --session <session-id> -e myendpoint
  agentarts runtime exec-command "ls" --agent myagent --session <session-id> --skip-ssl-verification`,
    )
    .action(commandAction(execCommandCmd));

  return command;
}

/** Register the `exec-command` command on an existing program. */
export function registerExecCommand(program: Command): void {
  program.addCommand(createExecCommand());
}
