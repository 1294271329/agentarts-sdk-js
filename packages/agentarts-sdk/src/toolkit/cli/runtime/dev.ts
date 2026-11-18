/**
 * Dev command definition.
 *
 * Ported from `agentarts/toolkit/cli/runtime/dev.py`.
 */

import { Command } from 'commander';

import * as devOp from '../../operations/runtime/dev.js';
import { commandAction } from '../common.js';

/** Options of the `dev` command (camelCase of the typer options). */
export interface DevCommandOptions {
  /** `--port/-p`: server port. */
  port: number;
  /** `--host/-h`: server host. */
  host: string;
  /** `--reload`: enable auto-reload (needs an external watcher). */
  reload: boolean;
  /** `--config/-c`: configuration file path. */
  config?: string;
  /** `--env/-e`: environment variables (`KEY=VALUE`, repeatable). */
  env?: string[];
}

/** Parse an environment variable string `KEY=VALUE` (Python `parse_env_var`). */
export function parseEnvVar(envStr: string): [string, string] {
  if (envStr.includes('=')) {
    const separator = envStr.indexOf('=');
    return [envStr.slice(0, separator).trim(), envStr.slice(separator + 1).trim()];
  }
  return [envStr.trim(), ''];
}

/**
 * Run the local development server.
 *
 * @returns Process exit code (`0` on success, `1` on failure).
 */
export async function dev(options: DevCommandOptions): Promise<number> {
  const envVars: Record<string, string> = {};
  if (options.env) {
    for (const envStr of options.env) {
      const [key, value] = parseEnvVar(envStr);
      if (key) {
        envVars[key] = value;
      }
    }
  }

  const success = await devOp.runDevServer({
    port: options.port,
    host: options.host,
    reload: options.reload,
    configPath: options.config ?? null,
    envVars: Object.keys(envVars).length > 0 ? envVars : null,
  });

  return success ? 0 : 1;
}

/** Build the `dev` command. */
export function createDevCommand(): Command {
  const command = new Command('dev');

  command
    // `-h` is the host here, so the help flag is `--help` only (like typer).
    .helpOption('--help', 'display help for command')
    .description('Run local development server.')
    .option('-p, --port <port>', 'Server port', (value: string) => Number.parseInt(value, 10), 8080)
    .option('-h, --host <host>', 'Server host', '0.0.0.0')
    .option('--reload', 'Enable auto-reload', false)
    .option('-c, --config <path>', 'Configuration file path')
    .option(
      '-e, --env <KEY=VALUE>',
      'Environment variables (KEY=VALUE). Can be used multiple times.',
      (value: string, previous: string[]) => [...previous, value],
      [] as string[],
    )
    .addHelpText(
      'after',
      `
Environment variables can be set via --env option or in .agentarts_config.yaml.
Command-line --env takes precedence over config file.

TypeScript projects must be started through a loader such as 'tsx' or
'vite-node'; in-process auto-reload is not available, so combine --reload with
an external watcher ('tsx watch', 'node --watch').

Examples:
  agentarts dev --port 8080 --reload
  agentarts dev --env OPENAI_API_KEY=sk-xxx --env OPENAI_MODEL_NAME=gpt-4o`,
    )
    .action(commandAction(dev));

  return command;
}

/** Register the `dev` command on an existing program. */
export function registerDevCommands(program: Command): void {
  program.addCommand(createDevCommand());
}
