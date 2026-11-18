/**
 * Deploy command definition.
 *
 * Ported from `agentarts/toolkit/cli/runtime/deploy.py`. Python registers the
 * same command twice: visible as `launch` and hidden as `deploy`.
 */

import { Command } from 'commander';

import * as deployOp from '../../operations/runtime/deploy.js';
import { commandAction, console } from '../common.js';

/** Options of the `launch`/`deploy` command (camelCase of the typer options). */
export interface DeployCommandOptions {
  /** `--agent/-a`: agent name (uses the default if not specified). */
  agent?: string;
  /** `--mode/-m`: `local` or `cloud` (default). */
  mode: string;
  /** `--tag/-t`: Docker image tag. */
  tag: string;
  /** `--local-port/-l`: local port mapping (for local mode). */
  localPort?: number;
  /** `--swr-org`: SWR organization (overrides config). */
  swrOrg?: string;
  /** `--swr-repo`: SWR repository (overrides config). */
  swrRepo?: string;
  /** `--description/-d`: agent description (overrides config). */
  description?: string;
  /** `--skip-build`: skip build/push and use the config URL. */
  skipBuild: boolean;
  /** `--skip-ssl-verification/-k`: skip SSL certificate verification. */
  skipSslVerification: boolean;
}

/**
 * Deploy the agent to Huawei Cloud or run it locally.
 *
 * @returns Process exit code (`0` on success, `1` on failure).
 */
export async function deploy(options: DeployCommandOptions): Promise<number> {
  let deployMode: deployOp.DeployMode;
  if (options.mode.toLowerCase() === 'local') {
    deployMode = deployOp.DeployMode.LOCAL;
  } else if (options.mode.toLowerCase() === 'cloud') {
    deployMode = deployOp.DeployMode.CLOUD;
  } else {
    console.print(`[red]Error: Invalid mode '${options.mode}'. Use 'local' or 'cloud'.[/red]`);
    return 1;
  }

  const success = await deployOp.deployProject({
    agentName: options.agent ?? null,
    mode: deployMode,
    imageTag: options.tag,
    localPort: options.localPort ?? null,
    swrOrg: options.swrOrg ?? null,
    swrRepo: options.swrRepo ?? null,
    description: options.description ?? null,
    skipBuild: options.skipBuild,
    skipSslVerification: options.skipSslVerification,
  });

  return success ? 0 : 1;
}

/**
 * Build the `launch` command (Python alias: `deploy`).
 *
 * @param name Command name (`launch` by default).
 */
export function createDeployCommand(name = 'launch'): Command {
  const command = new Command(name);

  command
    .description('Deploy agent to Huawei Cloud or run locally.')
    .option('-a, --agent <agent>', 'Agent name (uses default if not specified)')
    .option(
      '-m, --mode <mode>',
      "Deploy mode: 'local' for local Docker, 'cloud' for Huawei Cloud SWR (default)",
      'cloud',
    )
    .option('-t, --tag <tag>', 'Docker image tag', 'latest')
    .option('-l, --local-port <port>', 'Local port mapping (for local mode)', (value: string) => Number.parseInt(value, 10))
    .option('--swr-org <organization>', 'SWR organization (overrides config)')
    .option('--swr-repo <repository>', 'SWR repository (overrides config)')
    .option('-d, --description <description>', 'Agent description (overrides config)')
    .option('--skip-build', 'Skip build/push, use config URL to create agent directly', false)
    .option('-k, --skip-ssl-verification', 'Skip SSL certificate verification', false)
    .addHelpText(
      'after',
      `
Two deployment modes are supported:
  - cloud (default): Build image, push to SWR, create AgentArts runtime
  - local: Build image and run in local Docker

SWR organization and repository:
  - If --swr-org and --swr-repo are not specified, values from config are used
  - If organization_auto_create is true in config, the organization is created if missing
  - If repository_auto_create is true in config, the repository is created if missing

Examples:
  agentarts deploy
  agentarts deploy --agent myagent
  agentarts deploy --mode local --local-port 8080
  agentarts deploy --mode cloud --tag v1.0.0
  agentarts deploy --swr-org my-org --swr-repo my-repo
  agentarts deploy --description "My custom agent"`,
    )
    .action(commandAction(deploy));

  return command;
}

/** Register the `launch` command plus its hidden `deploy` alias. */
export function registerDeployCommands(program: Command): void {
  program.addCommand(createDeployCommand('launch'));
  program.addCommand(createDeployCommand('deploy'), { hidden: true });
}
