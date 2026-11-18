/**
 * Runtime start-session command.
 *
 * Ported from `agentarts/toolkit/cli/runtime/start_session.py`.
 */

import { Command } from 'commander';

import { ValidationError } from '../../operations/runtime/errors.js';
import { startRuntimeSession } from '../../operations/runtime/start-session.js';
import { commandAction, console, echoError, echoInfo, echoSuccess, errorMessage } from '../common.js';

/** Options of the `start-session` command (camelCase of the typer options). */
export interface StartSessionCommandOptions {
  /** `--agent/-a`: agent name (required). */
  agent?: string;
  /** `--region/-r`: region name. */
  region?: string;
  /** `--bearer-token/-bt`: bearer token for authentication. */
  bearerToken?: string;
  /** `--endpoint/-e`: endpoint name. */
  endpoint?: string;
  /** `--skip-ssl-verification/-k`: skip SSL certificate verification. */
  skipSslVerification: boolean;
  /** `--user-id/-u`: user ID for OAuth2 outbound credentials. */
  userId?: string;
}

/**
 * Start a runtime session (cloud only).
 *
 * @returns Process exit code (`0` on success, `1` on failure).
 */
export async function startSessionCmd(
  options: StartSessionCommandOptions,
): Promise<number> {
  try {
    echoInfo('Start Session', `[cyan]Agent:[/cyan] [white]${options.agent}[/white]`);

    const result = await startRuntimeSession({
      agentName: options.agent ?? null,
      region: options.region ?? null,
      bearerToken: options.bearerToken ?? null,
      endpoint: options.endpoint ?? null,
      skipSslVerification: options.skipSslVerification,
      userId: options.userId ?? null,
    });

    echoSuccess('Session started successfully');
    console.print(`  Agent: [bold]${options.agent}[/bold]`);
    console.print(`  Response: [dim]${JSON.stringify(result)}[/dim]`);

    return 0;
  } catch (error) {
    if (error instanceof ValidationError) {
      echoError(`Validation error: ${errorMessage(error)}`);
      return 1;
    }
    echoError(`Failed to start session: ${errorMessage(error)}`);
    return 1;
  }
}

/** Build the `start-session` command. */
export function createStartSessionCommand(): Command {
  const command = new Command('start-session');

  command
    .description('Start runtime session (cloud only).')
    .option('-a, --agent <agent>', 'Agent name [required]')
    .option('-r, --region <region>', 'Region name')
    .option('--bearer-token <token>', 'Bearer token for authentication')
    .option('-e, --endpoint <endpoint>', 'Endpoint name')
    .option('-k, --skip-ssl-verification', 'Skip SSL certificate verification', false)
    .option('-u, --user-id <userId>', 'User ID for OAuth2 outbound credentials')
    .addHelpText(
      'after',
      `
Returns a session ID that can be used for subsequent operations.

Examples:
  agentarts runtime start-session --agent myagent
  agentarts runtime start-session -a myagent -r cn-southwest-2
  agentarts runtime start-session -a myagent -bt <bearer-token>
  agentarts runtime start-session -a myagent -e myendpoint
  agentarts runtime start-session -a myagent --skip-ssl-verification`,
    )
    .action(commandAction(startSessionCmd));

  return command;
}

/** Register the `start-session` command on an existing program. */
export function registerStartSessionCommand(program: Command): void {
  program.addCommand(createStartSessionCommand());
}
