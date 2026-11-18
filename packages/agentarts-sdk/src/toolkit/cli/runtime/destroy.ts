/**
 * Destroy command definition.
 *
 * Ported from `agentarts/toolkit/cli/runtime/destroy.py`.
 */

import { Command } from 'commander';

import * as destroyOp from '../../operations/runtime/destroy.js';
import { commandAction, console, promptConfirm } from '../common.js';

/** Options of the `destroy` command (camelCase of the typer options). */
export interface DestroyCommandOptions {
  /** `--agent/-a`: agent name to destroy. */
  agent?: string;
  /** `--region/-r`: Huawei Cloud region. */
  region?: string;
  /** `--yes/-y`: skip the confirmation prompt. */
  yes: boolean;
  /** `--skip-ssl-verification/-k`: skip SSL certificate verification. */
  skipSslVerification: boolean;
}

/**
 * Destroy an agent from Huawei Cloud.
 *
 * @returns Process exit code (`0` on success or cancellation, `1` on failure).
 */
export async function destroy(options: DestroyCommandOptions): Promise<number> {
  if (!options.yes) {
    const agentDisplay = options.agent || 'default agent';
    console.print(`\n[yellow]Warning: This will permanently delete agent '${agentDisplay}'[/yellow]`);
    if (!(await promptConfirm('Are you sure you want to continue?', false))) {
      console.print('[yellow]Operation cancelled[/yellow]');
      return 0;
    }
  }

  const success = await destroyOp.destroyAgent({
    agentName: options.agent ?? null,
    region: options.region ?? null,
    skipSslVerification: options.skipSslVerification,
  });

  return success ? 0 : 1;
}

/** Build the `destroy` command. */
export function createDestroyCommand(): Command {
  const command = new Command('destroy');

  command
    .description('Destroy agent from Huawei Cloud.')
    .option('-a, --agent <agent>', 'Agent name to destroy (uses default if not specified)')
    .option('-r, --region <region>', 'Huawei Cloud region')
    .option('-y, --yes', 'Skip confirmation prompt', false)
    .option('-k, --skip-ssl-verification', 'Skip SSL certificate verification', false)
    .addHelpText(
      'after',
      `
This command will permanently delete the agent and all its resources.

Examples:
  agentarts destroy
  agentarts destroy --agent myagent
  agentarts destroy --agent myagent --region cn-southwest-2
  agentarts destroy --yes  # Skip confirmation`,
    )
    .action(commandAction(destroy));

  return command;
}

/** Register the `destroy` command on an existing program. */
export function registerDestroyCommands(program: Command): void {
  program.addCommand(createDestroyCommand());
}
