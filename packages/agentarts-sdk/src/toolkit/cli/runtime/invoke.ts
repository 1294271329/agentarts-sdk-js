/**
 * Invoke command definition.
 *
 * Ported from `agentarts/toolkit/cli/runtime/invoke.py`.
 */

import { Command } from 'commander';

import { InvokeMode, invokeAgent } from '../../operations/runtime/invoke.js';
import { commandAction, console } from '../common.js';

/** Options of the `invoke` command (camelCase of the typer options). */
export interface InvokeCommandOptions {
  /** `--agent/-a`: agent name. */
  agent?: string;
  /** `--mode/-m`: `local` or `cloud` (default). */
  mode: string;
  /** `--region/-r`: Huawei Cloud region (cloud mode). */
  region?: string;
  /** `--port/-p`: local port (local mode, default 8080). */
  port?: number;
  /** `--endpoint/-e`: endpoint name. */
  endpoint?: string;
  /** `--session/-s`: session ID for stateful agents. */
  session?: string;
  /** `--bearer-token/-bt`: bearer token for authentication. */
  bearerToken?: string;
  /** `--timeout`: request timeout in seconds (default 900). */
  timeout: number;
  /** `--skip-ssl-verification/-k`: skip SSL certificate verification. */
  skipSslVerification: boolean;
  /** `--user-id/-u`: user ID for OAuth2 outbound credentials. */
  userId?: string;
  /** `--custom-path`: custom path appended to `/invocations`. */
  customPath?: string;
}

/**
 * Invoke an agent with a JSON payload.
 *
 * @returns Process exit code (`0` on success, `1` on failure).
 */
export async function invoke(
  payload: string,
  options: InvokeCommandOptions,
): Promise<number> {
  let invokeMode: InvokeMode;
  if (options.mode.toLowerCase() === 'local') {
    invokeMode = InvokeMode.LOCAL;
  } else if (options.mode.toLowerCase() === 'cloud') {
    invokeMode = InvokeMode.CLOUD;
  } else {
    console.print(`[red]Error: Invalid mode '${options.mode}'. Use 'local' or 'cloud'.[/red]`);
    return 1;
  }

  const success = await invokeAgent(payload, {
    agentName: options.agent ?? null,
    mode: invokeMode,
    region: options.region ?? null,
    port: options.port ?? null,
    endpoint: options.endpoint ?? null,
    sessionId: options.session ?? null,
    bearerToken: options.bearerToken ?? null,
    timeout: options.timeout,
    skipSslVerification: options.skipSslVerification,
    userId: options.userId ?? null,
    customPath: options.customPath ?? null,
  });

  return success ? 0 : 1;
}

/** Build the `invoke` command. */
export function createInvokeCommand(): Command {
  const command = new Command('invoke');

  command
    .description('Invoke agent with JSON payload.')
    .argument('<payload>', "JSON payload to send to the agent (e.g., '{\"message\": \"hello\"}')")
    .option('-a, --agent <agent>', 'Agent name (uses default if not specified for cloud mode)')
    .option(
      '-m, --mode <mode>',
      "Invoke mode: 'local' for Docker container, 'cloud' for AgentArts runtime (default)",
      'cloud',
    )
    .option('-r, --region <region>', 'Huawei Cloud region (for cloud mode)')
    .option('-p, --port <port>', 'Local port (for local mode, default: 8080)', (value: string) => Number.parseInt(value, 10))
    .option('-e, --endpoint <endpoint>', 'Endpoint name')
    .option('-s, --session <session>', 'Session ID for stateful agents')
    .option('--bearer-token <token>', 'Bearer token for authentication')
    .option('--timeout <seconds>', 'Request timeout in seconds (default: 900)', (value: string) => Number.parseInt(value, 10), 900)
    .option('-k, --skip-ssl-verification', 'Skip SSL certificate verification', false)
    .option('-u, --user-id <userId>', 'User ID for OAuth2 outbound credentials')
    .option(
      '--custom-path <path>',
      "Custom path appended to /invocations (e.g., 'stream' -> /invocations/stream)",
    )
    .addHelpText(
      'after',
      `
Two invoke modes are supported:
  - cloud (default): Invoke AgentArts runtime on Huawei Cloud
  - local: Invoke local Docker container

The payload must be a valid JSON string.

Configuration requirement for --custom-path:
  Using --custom-path requires url_match_type=PREFIX_MATCH to be configured on
  the deployed agent, either in .agentarts_config.yaml (and redeployed) or on
  the Huawei Cloud AgentArts console.

Examples:
  agentarts invoke '{"message": "hello"}'
  agentarts invoke '{"message": "hello"}' --agent myagent
  agentarts invoke '{"message": "hello"}' --mode local --port 8080
  agentarts invoke '{"message": "test"}' --session my-session-123
  agentarts invoke '{"message": "test"}' --user-id my-user-id
  agentarts invoke '{"message": "test"}' --custom-path stream`,
    )
    .action(commandAction(invoke));

  return command;
}

/** Register the `invoke` command on an existing program. */
export function registerInvokeCommands(program: Command): void {
  program.addCommand(createInvokeCommand());
}
