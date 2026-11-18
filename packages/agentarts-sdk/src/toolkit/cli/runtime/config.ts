/**
 * Config command definitions.
 *
 * Ported from `agentarts/toolkit/cli/runtime/config.py`. Python registers the
 * same typer app twice (`config`, plus the hidden alias `configure`), so
 * {@link createConfigCommand} accepts the command name.
 */

import { Command } from 'commander';

import * as configOp from '../../operations/runtime/config.js';
import { echoError, echoSuccess, validateAgentName } from '../../utils/common.js';
import { generateSwrOrgName } from '../../utils/swr-org.js';
import { commandAction, console, promptAsk } from '../common.js';

/** Options of the `config` callback (camelCase of the typer options). */
export interface ConfigCommandOptions {
  /** `--name/-n`: agent name. */
  name?: string;
  /** `--entrypoint/-e`: agent entrypoint. */
  entrypoint?: string;
  /** `--region/-r`: Huawei Cloud region. */
  region?: string;
  /** `--dependency-file/-d`: path to the dependency file. */
  dependencyFile?: string;
  /** `--language/-l`: agent language. */
  language?: string;
  /** `--swr-org`: SWR organization name. */
  swrOrg?: string;
  /** `--swr-repo`: SWR repository name. */
  swrRepo?: string;
}

/**
 * Configure agent settings (interactive when options are missing).
 *
 * @returns Process exit code (`0` on success, `1` on failure).
 */
export async function main(options: ConfigCommandOptions): Promise<number> {
  console.print();
  console.print('[bold cyan]═══════════════════════════════════════════[/bold cyan]');
  console.print('[bold cyan]       AgentArts Configuration[/bold cyan]');
  console.print('[bold cyan]═══════════════════════════════════════════[/bold cyan]');
  console.print();

  const existingAgents = configOp.listAgents();
  if (existingAgents.length > 0) {
    console.print(`[dim]Existing agents: [cyan]${existingAgents.join(', ')}[/cyan][/dim]`);
    console.print();
  }

  let agentName = options.name;
  if (agentName === undefined) {
    const defaultName = configOp.getDefaultAgent();
    const promptHint = defaultName ? ` [cyan](${defaultName})[/cyan]` : '';
    console.print(`[bold]Agent name${promptHint}:[/bold]`);
    agentName = await promptAsk('  Name', defaultName || '');
  }

  const originalName = agentName;
  agentName = agentName.toLowerCase();
  if (agentName !== originalName) {
    console.print(
      `[yellow]Agent name converted to lowercase: [cyan]${agentName}[/cyan] (only lowercase letters, digits and hyphens are allowed)[/yellow]`,
    );
  }

  if (!agentName) {
    echoError('Agent name is required');
    return 1;
  }

  const [isValidName, nameError] = validateAgentName(agentName);
  if (!isValidName) {
    echoError(nameError);
    return 1;
  }

  let agentEntrypoint = options.entrypoint;
  if (agentEntrypoint === undefined) {
    const existingConfig = configOp.getAgent(agentName);
    const defaultEntrypoint = existingConfig ? existingConfig.base.entrypoint : null;
    const promptHint = defaultEntrypoint ? ` [cyan](${defaultEntrypoint})[/cyan]` : '';
    console.print(`\n[bold]Entrypoint${promptHint}:[/bold]`);
    console.print('[dim]  Format: module:function (e.g., app:main, agent:create_agent)[/dim]');
    agentEntrypoint = await promptAsk('  Entrypoint', defaultEntrypoint || '');
  }

  if (!agentEntrypoint) {
    echoError('Entrypoint is required');
    return 1;
  }

  let agentRegion = options.region;
  if (agentRegion === undefined) {
    const existingConfig = configOp.getAgent(agentName);
    const defaultRegion = existingConfig ? existingConfig.base.region : 'cn-southwest-2';
    console.print(`\n[bold]Region [cyan](${defaultRegion ?? 'None'})[/cyan]:[/bold]`);
    console.print('[dim]  Available region: cn-southwest-2[/dim]');
    agentRegion = await promptAsk('  Region', defaultRegion || '');
  }

  let agentDependencyFile = options.dependencyFile;
  if (agentDependencyFile === undefined) {
    const existingConfig = configOp.getAgent(agentName);
    let defaultDep = existingConfig ? existingConfig.base.dependencyFile : null;

    if (defaultDep === null || defaultDep === undefined) {
      defaultDep = configOp.detectDependencyFile();
    }

    console.print(`\n[bold]Dependency file [cyan](${defaultDep})[/cyan]:[/bold]`);
    console.print(
      '[dim]  Auto-detected package.json. Press Enter to use default[/dim]',
    );
    agentDependencyFile = await promptAsk('  File', defaultDep);
  }

  let org = options.swrOrg;
  let autoCreateOrg = false;
  if (org === undefined) {
    const existingConfig = configOp.getAgent(agentName);
    const defaultOrg = existingConfig ? existingConfig.swrConfig.organization : null;
    const autoOrg = generateSwrOrgName(agentRegion);

    console.print('\n[bold]SWR Organization:[/bold]');
    if (defaultOrg) {
      console.print(
        `[dim]  Current: [cyan]${defaultOrg}[/cyan]. Press Enter to keep current, or input new name[/dim]`,
      );
    } else {
      console.print(
        `[dim]  Press Enter for auto-create [cyan]${autoOrg}[/cyan]. Or input existing organization name[/dim]`,
      );
    }

    const orgInput = await promptAsk('  Organization', '');

    if (orgInput) {
      org = orgInput;
      autoCreateOrg = false;
    } else if (defaultOrg) {
      org = defaultOrg;
      autoCreateOrg = existingConfig ? existingConfig.swrConfig.organizationAutoCreate : false;
    } else {
      org = autoOrg;
      autoCreateOrg = true;
    }
  }

  let repo = options.swrRepo;
  let autoCreateRepo = false;
  if (repo === undefined) {
    const existingConfig = configOp.getAgent(agentName);
    const defaultRepo = existingConfig ? existingConfig.swrConfig.repository : null;
    const autoRepo = agentName;

    console.print('\n[bold]SWR Repository:[/bold]');
    if (defaultRepo) {
      console.print(
        `[dim]  Current: [cyan]${defaultRepo}[/cyan]. Press Enter to keep current, or input new name[/dim]`,
      );
    } else {
      console.print(
        `[dim]  Press Enter for auto-create [cyan]${autoRepo}[/cyan]. Or input existing repository name[/dim]`,
      );
    }

    const repoInput = await promptAsk('  Repository', '');

    if (repoInput) {
      repo = repoInput;
      autoCreateRepo = false;
    } else if (defaultRepo) {
      repo = defaultRepo;
      autoCreateRepo = existingConfig ? existingConfig.swrConfig.repositoryAutoCreate : false;
    } else {
      repo = autoRepo;
      autoCreateRepo = true;
    }
  }

  const summary =
    `[cyan]Agent Name:[/cyan] [white]${agentName}[/white]\n` +
    `[cyan]Entrypoint:[/cyan] [white]${agentEntrypoint}[/white]\n` +
    `[cyan]Region:[/cyan] [white]${agentRegion}[/white]\n` +
    `[cyan]Dependency File:[/cyan] [white]${agentDependencyFile || 'None'}[/white]\n` +
    '\n' +
    '[bold]SWR Settings:[/bold]\n' +
    `[cyan]Organization:[/cyan] [white]${org}[/white] [dim](auto-create: ${String(autoCreateOrg).toLowerCase()})[/dim]\n` +
    `[cyan]Repository:[/cyan] [white]${repo}[/white] [dim](auto-create: ${String(autoCreateRepo).toLowerCase()})[/dim]`;
  console.printPanel('[bold blue]Configuration Summary[/bold blue]', summary, {
    borderStyle: 'blue',
  });

  const success = await configOp.addAgent(agentName, agentEntrypoint, {
    region: agentRegion,
    dependencyFile: agentDependencyFile ? agentDependencyFile : null,
    language: options.language ?? null,
    swrOrganization: org ?? null,
    swrRepository: repo ?? null,
    setAsDefault: true,
    organizationAutoCreate: autoCreateOrg,
    repositoryAutoCreate: autoCreateRepo,
  });

  if (!success) {
    return 1;
  }

  echoSuccess(`Agent '${agentName}' configured successfully!`);
  configOp.generateDockerfile(agentName);
  return 0;
}

/** List all configured agents. */
export async function list(): Promise<number> {
  configOp.printConfigList();
  return 0;
}

/** Set the default agent name. */
export async function setDefault(name: string): Promise<number> {
  const nameLower = name.toLowerCase();
  if (nameLower !== name) {
    console.print(`[yellow]Agent name converted to lowercase: [cyan]${nameLower}[/cyan][/yellow]`);
  }

  const [isValid, errorMessage] = validateAgentName(nameLower);
  if (!isValid) {
    echoError(errorMessage);
    return 1;
  }

  const success = configOp.setDefaultAgent(nameLower);
  return success ? 0 : 1;
}

/** Get a configuration value, or the full agent configuration without a key. */
export async function get(
  key: string | undefined,
  options: { agent?: string },
): Promise<number> {
  const success =
    key === undefined
      ? configOp.printAgentDetail(options.agent ?? null)
      : configOp.getConfigValue(key, options.agent ?? null);
  return success ? 0 : 1;
}

/** Set a configuration value. */
export async function set(
  key: string,
  value: string,
  options: { agent?: string },
): Promise<number> {
  let validatedValue = value;

  if (key === 'base.name') {
    const valueLower = value.toLowerCase();
    if (valueLower !== value) {
      console.print(
        `[yellow]Agent name converted to lowercase: [cyan]${valueLower}[/cyan][/yellow]`,
      );
    }

    const [isValid, errorMessage] = validateAgentName(valueLower);
    if (!isValid) {
      echoError(errorMessage);
      return 1;
    }
    validatedValue = valueLower;
  }

  const success = configOp.setConfigValue(key, validatedValue, options.agent ?? null);
  return success ? 0 : 1;
}

/** Remove an agent configuration. */
export async function remove(name: string): Promise<number> {
  const success = configOp.removeAgent(name);
  return success ? 0 : 1;
}

/** Set an environment variable for an agent. */
export async function setEnv(
  key: string,
  value: string,
  options: { agent?: string },
): Promise<number> {
  const success = configOp.setEnv(key, value, options.agent ?? null);
  return success ? 0 : 1;
}

/** Remove an environment variable from an agent. */
export async function removeEnv(key: string, options: { agent?: string }): Promise<number> {
  const success = configOp.removeEnv(key, options.agent ?? null);
  return success ? 0 : 1;
}

/** List the environment variables of an agent. */
export async function listEnv(options: { agent?: string }): Promise<number> {
  const success = configOp.listEnv(options.agent ?? null);
  return success ? 0 : 1;
}

/**
 * Build the `config` command tree (Python `config_app`).
 *
 * @param name Command name (`config` by default; `configure` for the hidden
 *   alias registered by the entry point).
 */
export function createConfigCommand(name = 'config'): Command {
  const command = new Command(name);

  command
    .description('Configuration management')
    .option('-n, --name <name>', 'Agent name')
    .option('-e, --entrypoint <entrypoint>', 'Agent entrypoint (e.g., app:main)')
    .option('-r, --region <region>', 'Huawei Cloud region (e.g., cn-southwest-2)')
    .option('-d, --dependency-file <file>', 'Path to dependency file (e.g., package.json)')
    .option('-l, --language <language>', 'Agent language (e.g., nodejs). Inferred if omitted.')
    .option('--swr-org <organization>', 'SWR organization name')
    .option('--swr-repo <repository>', 'SWR repository name')
    .addHelpText(
      'after',
      `
Configure agent settings.

If run without arguments, starts interactive configuration.
If arguments are provided, creates/updates configuration directly.
Use this (not 'init') when you already have your own project code and only need
the '.agentarts_config.yaml' + Dockerfile generated.

Required parameters (will prompt if not provided):
  - Agent name
  - Entrypoint

Examples:
  agentarts config
  agentarts config --name myagent --entrypoint app:main
  agentarts config -n myagent -e agent:app --dependency-file package.json --swr-org my-org --swr-repo my-repo`,
    )
    .action(commandAction(main));

  command
    .command('list')
    .description('List all configured agents.')
    .addHelpText('after', '\nExamples:\n  agentarts config list')
    .action(commandAction(list));

  command
    .command('set-default')
    .description('Set the default agent name.')
    .argument('<name>', 'Agent name to set as default')
    .addHelpText('after', '\nExamples:\n  agentarts config set-default my-agent')
    .action(commandAction(setDefault));

  command
    .command('get')
    .description('Get configuration value or agent details.')
    .argument('[key]', 'Configuration key (dot notation, e.g., base.region)')
    .option('-a, --agent <agent>', 'Agent name')
    .addHelpText(
      'after',
      `
If no key is provided, prints the full agent configuration.

Examples:
  agentarts config get
  agentarts config get base.region
  agentarts config get base.region --agent myagent`,
    )
    .action(commandAction(get));

  command
    .command('set')
    .description('Set configuration value.')
    .argument('<key>', 'Configuration key (dot notation, e.g., base.region)')
    .argument('<value>', 'Configuration value')
    .option('-a, --agent <agent>', 'Agent name')
    .addHelpText(
      'after',
      `
Examples:
  agentarts config set base.region cn-southwest-2
  agentarts config set base.name new-name --agent old-name`,
    )
    .action(commandAction(set));

  command
    .command('remove')
    .description('Remove an agent configuration.')
    .argument('<name>', 'Agent name to remove')
    .addHelpText('after', '\nExamples:\n  agentarts config remove myagent')
    .action(commandAction(remove));

  command
    .command('set-env')
    .description('Set an environment variable for an agent.')
    .argument('<key>', 'Environment variable name')
    .argument('<value>', 'Environment variable value')
    .option('-a, --agent <agent>', 'Agent name')
    .addHelpText(
      'after',
      `
If the variable already exists, its value is updated.

Examples:
  agentarts config set-env HUAWEICLOUD_SDK_AK your-ak
  agentarts config set-env MY_VAR my-value --agent myagent`,
    )
    .action(commandAction(setEnv));

  command
    .command('remove-env')
    .description('Remove an environment variable from an agent.')
    .argument('<key>', 'Environment variable name to remove')
    .option('-a, --agent <agent>', 'Agent name')
    .addHelpText(
      'after',
      `
Examples:
  agentarts config remove-env HUAWEICLOUD_SDK_AK
  agentarts config remove-env MY_VAR --agent myagent`,
    )
    .action(commandAction(removeEnv));

  command
    .command('list-env')
    .description('List environment variables for an agent.')
    .option('-a, --agent <agent>', 'Agent name')
    .addHelpText(
      'after',
      `
Examples:
  agentarts config list-env
  agentarts config list-env --agent myagent`,
    )
    .action(commandAction(listEnv));

  return command;
}

/** Register the `config` command plus its hidden `configure` alias. */
export function registerConfigCommands(program: Command): void {
  program.addCommand(createConfigCommand('config'));
  program.addCommand(createConfigCommand('configure'), { hidden: true });
}
