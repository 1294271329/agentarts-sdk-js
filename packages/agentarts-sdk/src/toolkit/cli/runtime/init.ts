/**
 * Init command definition.
 *
 * Ported from `agentarts/toolkit/cli/runtime/init.py`.
 *
 * `google-adk`, `java-basic` and `java-agentscope` templates are not bundled
 * with the Node.js port (Java agent support was dropped, the Google ADK
 * template was not ported), so only `basic`, `langgraph` and `langchain` are
 * offered.
 */

import { Command } from 'commander';

import * as initOp from '../../operations/runtime/init.js';
import { generateDefaultAgentName } from '../../utils/swr-org.js';
import { echoError, validateAgentName } from '../../utils/common.js';
import { commandAction, console, promptAsk, promptChoice } from '../common.js';

/** Available project templates. */
export enum TemplateType {
  basic = 'basic',
  langgraph = 'langgraph',
  langchain = 'langchain',
}

/** Human readable description of each template. */
export const TEMPLATE_DESCRIPTIONS: Readonly<Record<TemplateType, string>> = {
  [TemplateType.basic]: 'Basic agent template with minimal setup',
  [TemplateType.langgraph]: 'LangGraph-based agent with state management',
  [TemplateType.langchain]: 'LangChain-based agent with tool integration',
};

/** Prompt the user to select a template interactively. */
export async function promptForTemplate(): Promise<TemplateType> {
  console.print('\n[bold cyan]Available Templates:[/bold cyan]\n');

  const templates = Object.values(TemplateType);
  templates.forEach((template, index) => {
    const description = TEMPLATE_DESCRIPTIONS[template];
    console.print(
      `  [yellow]${index + 1}[/yellow]. [green]${template.padEnd(12)}[/green] - ${description}`,
    );
  });

  console.print();

  const choices = templates.map((_template, index) => String(index + 1));
  const choice = await promptChoice('[bold]Select a template[/bold]', choices, '2');
  const selected = templates[Number.parseInt(choice, 10) - 1];
  return selected ?? TemplateType.basic;
}

/** Prompt the user to enter a project name. */
export async function promptForName(): Promise<string> {
  const defaultName = generateDefaultAgentName();
  return promptAsk('\n[bold]Enter project name[/bold]', defaultName);
}

/** Prompt the user to enter a region. */
export async function promptForRegion(): Promise<string> {
  console.print('\n[bold]Region:[/bold]');
  console.print('[dim]  Default: cn-southwest-2[/dim]');
  return promptAsk('  Region', 'cn-southwest-2');
}

/** Options of the `init` command (camelCase of the typer options). */
export interface InitCommandOptions {
  /** `--name/-n`: project name. */
  name?: string;
  /** `--template/-t`: project template. */
  template?: string;
  /** `--path/-p`: project path (default `.`). */
  path: string;
  /** `--region/-r`: Huawei Cloud region. */
  region?: string;
  /** `--swr-org`: SWR organization. */
  swrOrg?: string;
  /** `--swr-repo`: SWR repository. */
  swrRepo?: string;
}

/**
 * Initialize a new AgentArts project.
 *
 * @returns Process exit code (`0` on success, `1` on failure).
 */
export async function init(options: InitCommandOptions): Promise<number> {
  let name = options.name;
  if (name === undefined) {
    name = await promptForName();
  }

  const originalName = name;
  name = name.toLowerCase();
  if (name !== originalName) {
    console.print(
      `[yellow]Agent name converted to lowercase: [cyan]${name}[/cyan] (only lowercase letters, digits and hyphens are allowed)[/yellow]`,
    );
  }

  const [isValid, errorMessage] = validateAgentName(name);
  if (!isValid) {
    echoError(errorMessage);
    return 1;
  }

  let template = options.template;
  if (template === undefined) {
    template = await promptForTemplate();
  }

  const allowedTemplates = Object.values(TemplateType).map(String);
  if (!allowedTemplates.includes(template)) {
    echoError(
      `Invalid template '${template}'. Available templates: ${allowedTemplates.join(', ')}`,
    );
    return 1;
  }

  let region = options.region;
  if (region === undefined) {
    region = await promptForRegion();
  }

  console.print(`\n[bold]Creating project:[/bold] [cyan]${name}[/cyan]`);
  console.print(`[bold]Template:[/bold] [green]${template}[/green]`);
  console.print(`[bold]Region:[/bold] [yellow]${region}[/yellow]`);
  console.print(`[bold]Path:[/bold] ${options.path}\n`);

  const success = await initOp.initProject({
    template,
    name,
    path: options.path,
    region,
    swrOrg: options.swrOrg ?? null,
    swrRepo: options.swrRepo ?? null,
  });

  return success ? 0 : 1;
}

/** Build the `init` command. */
export function createInitCommand(): Command {
  const command = new Command('init');

  command
    .description('Initialize a new AgentArts project.')
    .option('-n, --name <name>', 'Project name')
    .option(
      '-t, --template <template>',
      'Project template (basic, langgraph, langchain)',
    )
    .option('-p, --path <path>', 'Project path', '.')
    .option('-r, --region <region>', 'Huawei Cloud region')
    .option('--swr-org <organization>', 'SWR organization (auto-generated if not specified)')
    .option('--swr-repo <repository>', 'SWR repository (default: {name})')
    .addHelpText(
      'after',
      `
Creates a complete project structure with:
  - .agentarts_config.yaml: Configuration file for deployment
  - agent.ts: Agent implementation based on selected template
  - Dockerfile: Docker build file for containerization
  - package.json: Dependencies including SDK and framework packages
  - tsconfig.json: TypeScript compiler configuration

After initialization, you can directly deploy using 'agentarts deploy'.

Examples:
  agentarts init
  agentarts init -n myagent
  agentarts init -n myagent -t langgraph
  agentarts init -n myagent -t langchain -r cn-southwest-2
  agentarts init -n myagent --swr-org my-org --swr-repo my-repo`,
    )
    .action(commandAction(init));

  return command;
}

/** Register the `init` command on an existing program. */
export function registerInitCommands(program: Command): void {
  program.addCommand(createInitCommand());
}
