/**
 * Runtime stop-session command.
 *
 * Ported from `agentarts/toolkit/cli/runtime/stop_session.py`.
 */

import { Command } from 'commander';

import { ValidationError } from '../../operations/runtime/errors.js';
import { stopRuntimeSession } from '../../operations/runtime/stop-session.js';
import { commandAction, console, echoError, echoInfo, echoSuccess, errorMessage } from '../common.js';

/** Options of the `stop-session` command (camelCase of the typer options). */
export interface StopSessionCommandOptions {
  /** `--agent/-a`: agent name (required). */
  agent?: string;
  /** `--session/-s`: session ID (required). */
  session?: string;
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
}

/**
 * Stop a runtime session (cloud only).
 *
 * @returns Process exit code (`0` on success, `1` on failure).
 */
export async function stopSessionCmd(options: StopSessionCommandOptions): Promise<number> {
  try {
    echoInfo(
      'Stop Session',
      `[cyan]Agent:[/cyan] [white]${options.agent}[/white]\n[cyan]Session:[/cyan] [dim]${options.session}[/dim]`,
    );

    const result = await stopRuntimeSession({
      agentName: options.agent ?? null,
      sessionId: options.session ?? null,
      bearerToken: options.bearerToken ?? null,
      region: options.region ?? null,
      endpoint: options.endpoint ?? null,
      skipSslVerification: options.skipSslVerification,
      userId: options.userId ?? null,
    });

    echoSuccess('Session stopped successfully');
    console.print(`  Agent: [bold]${options.agent}[/bold]`);
    console.print(`  Session ID: [dim]${options.session}[/dim]`);
    console.print(`  Response: [dim]${JSON.stringify(result)}[/dim]`);

    return 0;
  } catch (error) {
    if (error instanceof ValidationError) {
      echoError(`Validation error: ${errorMessage(error)}`);
      return 1;
    }
    echoError(`Failed to stop session: ${errorMessage(error)}`);
    return 1;
  }
}

/** Build the `stop-session` command. */
export function createStopSessionCommand(): Command {
  const command = new Command('stop-session');

  command
    .description('Stop runtime session (cloud only).')
    .option('-a, --agent <agent>', 'Agent name [required]')
    .option('-s, --session <session>', 'Session ID [required]')
    .option('--bearer-token <token>', 'Bearer token for authentication')
    .option('-r, --region <region>', 'Region name')
    .option('-e, --endpoint <endpoint>', 'Endpoint name')
    .option('-k, --skip-ssl-verification', 'Skip SSL certificate verification', false)
    .option('-u, --user-id <userId>', 'User ID for OAuth2 outbound credentials')
    .addHelpText(
      'after',
      `
Examples:
  agentarts runtime stop-session --agent myagent --session <session-id>
  agentarts runtime stop-session -a myagent -s <session-id> -bt <bearer-token>
  agentarts runtime stop-session -a myagent -s <session-id> -e myendpoint
  agentarts runtime stop-session -a myagent -s <session-id> --skip-ssl-verification`,
    )
    .action(commandAction(stopSessionCmd));

  return command;
}

/** Register the `stop-session` command on an existing program. */
export function registerStopSessionCommand(program: Command): void {
  program.addCommand(createStopSessionCommand());
}
