/**
 * Init operation implementation.
 *
 * Ported from `agentarts/toolkit/operations/runtime/init.py`. Scaffolds a new
 * project directory with `.agentarts_config.yaml`, `agent.ts`, `tsconfig.json`,
 * `package.json` and `Dockerfile` rendered from the bundled templates.
 *
 * Java agent support was dropped from the Node.js port, so the `java-basic` /
 * `java-agentscope` templates, `create_pom_file()` and the Java Dockerfile
 * rendering are gone; `google-adk` is likewise not bundled with the TypeScript
 * package (see `toolkit/utils/templates/registry.ts`).
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import { join } from 'node:path';

import { console, echoInfo, echoKeyValue, echoStep, echoSuccess } from '../../utils/common.js';
import { detectArch } from '../../utils/runtime/config.js';
import { generateSwrOrgName } from '../../utils/swr-org.js';
import { TemplateNotFoundError, templateManager } from '../../utils/templates/manager.js';
import { NODE_TSCONFIG } from '../../utils/templates/node-templates.js';
import { renderDockerfile as renderPythonDockerfile } from '../../utils/templates/docker/index.js';

export { console };

/**
 * Template names accepted by `agentarts init`.
 *
 * `java-basic`, `java-agentscope` (Java) and `google-adk` (Google ADK) are not
 * bundled with the Node.js port.
 */
export const TEMPLATES: Readonly<Record<string, string>> = {
  basic: 'basic',
  langchain: 'langchain',
  langgraph: 'langgraph',
};

/**
 * Detect the current platform architecture.
 *
 * @returns Platform string (e.g. `'linux/amd64'`, `'linux/arm64'`).
 */
export function detectPlatform(): string {
  let machine = '';
  try {
    machine = String(os.machine() ?? '').toLowerCase();
  } catch {
    machine = '';
  }
  const system = process.platform === 'win32' ? 'windows' : process.platform;

  if (system === 'linux' || system === 'darwin') {
    if (machine === 'aarch64' || machine === 'arm64') {
      return 'linux/arm64';
    }
    if (machine === 'x86_64' || machine === 'amd64') {
      return 'linux/amd64';
    }
  } else if (system === 'windows') {
    if (machine === 'amd64' || machine === 'x86_64') {
      return 'linux/amd64';
    }
    if (machine === 'arm64' || machine === 'aarch64') {
      return 'linux/arm64';
    }
  }

  // Unknown architecture: default to linux/arm64 (the backend is
  // predominantly arm).
  return 'linux/arm64';
}

/** Whether an error means "template not found" (Python `FileNotFoundError`). */
function isTemplateNotFound(error: unknown): boolean {
  return (
    error instanceof TemplateNotFoundError ||
    (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT'
  );
}

/** Options for {@link initProject} and {@link createConfigFile}. */
export interface InitProjectOptions {
  /** Huawei Cloud region. */
  region?: string | null;
  /** SWR organization (auto-generated when omitted). */
  swrOrg?: string | null;
  /** SWR repository (defaults to `agent_<name>`). */
  swrRepo?: string | null;
}

/**
 * Initialize a new project.
 *
 * Accepts `initProject(template, name, path, options)` or a single
 * `initProject({ template, name, path, ...options })` object.
 *
 * @returns `true` when the project was scaffolded.
 */
export function initProject(
  template: string,
  name: string,
  path: string,
  options?: InitProjectOptions,
): Promise<boolean>;
export function initProject(
  options: InitProjectOptions & { template: string; name: string; path: string },
): Promise<boolean>;
export async function initProject(
  templateOrOptions: string | (InitProjectOptions & { template: string; name: string; path: string }),
  name?: string,
  path?: string,
  options: InitProjectOptions = {},
): Promise<boolean> {
  const opts: InitProjectOptions & { template?: string; name?: string; path?: string } =
    typeof templateOrOptions === 'string'
      ? { ...options, template: templateOrOptions, name: name ?? '', path: path ?? '.' }
      : templateOrOptions;

  const template = String(opts.template ?? '');
  const projectName = String(opts.name ?? '');
  const basePath = opts.path ?? '.';

  const projectPath = join(basePath, projectName);

  if (existsSync(projectPath)) {
    console.print(`[red]Error: Directory '${projectName}' already exists[/red]`);
    return false;
  }

  try {
    mkdirSync(projectPath, { recursive: true });
  } catch (error) {
    console.print(
      `[red]Error creating directory: ${error instanceof Error ? error.message : String(error)}[/red]`,
    );
    return false;
  }

  createAgentFile(projectPath, template, projectName);
  createPackageJsonFile(projectPath, template, projectName);
  createTsconfigFile(projectPath);
  createConfigFile(projectPath, projectName, template, {
    region: opts.region ?? null,
    swrOrg: opts.swrOrg ?? null,
    swrRepo: opts.swrRepo ?? null,
  });
  createDockerfile(projectPath, template, projectName, opts.region ?? null);

  echoSuccess(`Project '${projectName}' created successfully!`);

  echoInfo(
    'Project structure',
    `[cyan]${projectName}/[/cyan]\n` +
      '  |-- [green].agentarts_config.yaml[/green] # Configuration\n' +
      '  |-- [green]agent.ts[/green]              # Agent implementation\n' +
      '  |-- [green]Dockerfile[/green]            # Docker build file\n' +
      '  |-- [green]package.json[/green]          # Dependencies\n' +
      '  \\-- [green]tsconfig.json[/green]         # TypeScript config',
  );

  console.print();
  console.print('[bold green]Next Steps - How to Deploy Agent[/bold green]');
  console.print();

  echoStep(1, 'Navigate to project directory');
  console.print(`    [cyan]cd ${projectName}[/cyan]`);

  echoStep(2, 'Install dependencies');
  console.print('    [cyan]pnpm install[/cyan]  [dim](or npm install)[/dim]');

  echoStep(3, 'Edit agent.ts to implement your agent logic');

  echoStep(4, 'Edit .agentarts_config.yaml and run config command (optional)');
  console.print('    [dim]Modify configuration as needed, then:[/dim]');
  console.print('    [cyan]agentarts config[/cyan]');

  echoStep(5, 'Deploy to Huawei Cloud');
  console.print('    [cyan]agentarts deploy[/cyan]');

  return true;
}

/**
 * Create the TypeScript agent file based on the template.
 *
 * Falls back to the `basic` template when the requested template is missing.
 */
export function createAgentFile(projectPath: string, template: string, name: string): void {
  let agentContent: string;
  try {
    agentContent = templateManager.renderNodeAgentTemplate(template, name);
  } catch (error) {
    if (!isTemplateNotFound(error)) {
      throw error;
    }
    console.print(
      `[yellow]Warning: Template '${template}' not found, using basic template[/yellow]`,
    );
    agentContent = templateManager.renderNodeAgentTemplate('basic', name);
  }

  const agentPath = join(projectPath, 'agent.ts');
  writeFileSync(agentPath, agentContent, 'utf8');
  echoKeyValue('Created', 'agent.ts');
}

/**
 * Create the `package.json` file based on the template (falls back to `basic`).
 */
export function createPackageJsonFile(
  projectPath: string,
  template: string,
  name: string,
): void {
  let packageJson: string;
  try {
    packageJson = templateManager.renderPackageJsonTemplate(template, name);
  } catch (error) {
    if (!isTemplateNotFound(error)) {
      throw error;
    }
    console.print(
      `[yellow]Warning: Template '${template}' not found, using basic template[/yellow]`,
    );
    packageJson = templateManager.renderPackageJsonTemplate('basic', name);
  }

  const packageJsonPath = join(projectPath, 'package.json');
  writeFileSync(packageJsonPath, packageJson, 'utf8');
  echoKeyValue('Created', 'package.json');
}

/**
 * Create the `tsconfig.json` for the scaffolded project.
 */
export function createTsconfigFile(projectPath: string): void {
  writeFileSync(join(projectPath, 'tsconfig.json'), NODE_TSCONFIG, 'utf8');
  echoKeyValue('Created', 'tsconfig.json');
}

/**
 * Backwards-compatible alias of {@link createPackageJsonFile}.
 *
 * Python scaffolded `requirements.txt`; the Node.js port scaffolds
 * `package.json`, which serves the same role.
 */
export function createRequirementsFile(
  projectPath: string,
  template: string,
  name = 'agent',
): void {
  createPackageJsonFile(projectPath, template, name);
}

/**
 * Create the `.agentarts_config.yaml` configuration file.
 *
 * Accepts `createConfigFile(projectPath, name, template, options)` or
 * `createConfigFile({ projectPath, name, template, ...options })`.
 */
export function createConfigFile(
  projectPath: string,
  name: string,
  template: string,
  options?: InitProjectOptions,
): void;
export function createConfigFile(
  options: InitProjectOptions & { projectPath: string; name: string; template: string },
): void;
export function createConfigFile(
  projectPathOrOptions:
    | string
    | (InitProjectOptions & { projectPath: string; name: string; template: string }),
  name?: string,
  template?: string,
  options: InitProjectOptions = {},
): void {
  const opts: InitProjectOptions & { projectPath?: string; name?: string; template?: string } =
    typeof projectPathOrOptions === 'string'
      ? { ...options, projectPath: projectPathOrOptions, name: name ?? '', template: template ?? '' }
      : projectPathOrOptions;

  const projectPath = String(opts.projectPath ?? '.');
  const projectName = String(opts.name ?? '');
  const templateName = String(opts.template ?? '');

  const actualRegion = opts.region || 'cn-southwest-2';
  const actualSwrOrg = opts.swrOrg || generateSwrOrgName(actualRegion);
  const actualSwrRepo = opts.swrRepo || `agent_${projectName}`;
  const detectedPlatform = detectPlatform();
  const detectedArch = detectArch();

  const envVars = getTemplateEnvVars(templateName);

  let envVarsYaml = '';
  for (const envVar of envVars) {
    envVarsYaml += `\n        - key: ${envVar.key}\n          value: null  # ${envVar.description}`;
  }

  const entrypoint = 'agent:app';
  const dependencyFile = 'package.json';
  const language = 'nodejs';
  const baseImage = 'node:22-slim';

  const configContent = `# AgentArts Configuration
# Generated by 'agentarts init' command

default_agent: ${projectName}

agents:
  ${projectName}:
    base:
      name: ${projectName}
      entrypoint: ${entrypoint}
      dependency_file: ${dependencyFile}
      platform: ${detectedPlatform}
      language: ${language}
      base_image: ${baseImage}
      region: ${actualRegion}

    swr_config:
      organization: ${actualSwrOrg}
      repository: ${actualSwrRepo}
      organization_auto_create: true
      repository_auto_create: true

    runtime:
      arch: ${detectedArch}
      agent_gateway_id: null
      invoke_config:
        protocol: HTTP
        port: 8080
        file_transfer_config:
          enabled: false
        url_match_type: ACCURATE_MATCH

      network_config:
        network_mode: PUBLIC
        vpc_config:
          vpc_id: null
          subnet_id: null
          security_group_id: []

      identity_configuration:
        authorizer_type: IAM
        authorizer_configuration:
          custom_jwt:
            discovery_url: null
            allowed_audience: []
            allowed_clients: []
            allowed_scopes: []
          key_auth:
            api_keys: []

      observability:
        tracing:
          enabled: false
        metrics:
          enabled: false
        logs:
          enabled: false

      artifact_source:
        url: null  # Auto-generated during deploy from swr_config
        swr_instance_id: null  # UUID format, optional
        commands: []

      storage_config:
        sfs_turbo:
          sfs_turbo_id: null  # UUID format, required when using SFS Turbo
          sfs_path: null
          mount_path: null    # required when using SFS Turbo
          read_only: false
        session_storage:
          mount_path: null  # Session storage mount path in the container

      lifecycle_config:
        idle_session_timeout_sec: null  # 60-604800; service default: 900
        max_alive_time_sec: null  # 60-604800; service default: 86400

      environment_variables:${envVarsYaml}

      tags: []
`;

  const configPath = join(projectPath, '.agentarts_config.yaml');
  writeFileSync(configPath, configContent, 'utf8');
  echoKeyValue('Created', '.agentarts_config.yaml');
}

/** One environment variable required by a template. */
export interface TemplateEnvVar {
  /** Variable name. */
  key: string;
  /** Human readable description, written as a YAML comment. */
  description: string;
}

/**
 * Get the environment variables required by a template.
 *
 * `google-adk` was not ported (its template is not bundled), so it returns an
 * empty list like `basic`.
 */
export function getTemplateEnvVars(template: string): TemplateEnvVar[] {
  const templateEnvVars: Record<string, TemplateEnvVar[]> = {
    basic: [],
    langgraph: [
      { key: 'OPENAI_API_KEY', description: 'OpenAI API key for LLM access' },
      {
        key: 'OPENAI_MODEL_NAME',
        description: 'Model name (default: gpt-4o-mini, e.g. gpt-4o, gpt-4-turbo)',
      },
      {
        key: 'OPENAI_BASE_URL',
        description: 'Custom API endpoint URL (optional, for OpenAI-compatible APIs)',
      },
    ],
    langchain: [
      { key: 'OPENAI_API_KEY', description: 'OpenAI API key for LLM access' },
      {
        key: 'OPENAI_MODEL_NAME',
        description: 'Model name (default: gpt-4o-mini, e.g. gpt-4o, gpt-4-turbo)',
      },
      {
        key: 'OPENAI_BASE_URL',
        description: 'Custom API endpoint URL (optional, for OpenAI-compatible APIs)',
      },
    ],
  };
  return templateEnvVars[template] ?? [];
}

/**
 * Create the Dockerfile for the project.
 *
 * @param projectPath Project directory.
 * @param template Template name (kept for Python signature parity).
 * @param name Project name (kept for Python signature parity).
 * @param region Huawei Cloud region.
 */
export function createDockerfile(
  projectPath: string,
  template: string,
  name: string,
  region?: string | null,
): void {
  const actualRegion = region || 'cn-southwest-2';

  // Java templates render a Temurin image that copies the fat jar by name; that
  // renderer was not ported, so every scaffolded project uses the Node.js image.
  void template;
  void name;
  const dockerfileContent = renderPythonDockerfile(
    'node:22-slim',
    'package.json',
    'agent:app',
    8080,
    'appuser',
    1000,
    1000,
    actualRegion,
  );

  const dockerfilePath = join(projectPath, 'Dockerfile');
  writeFileSync(dockerfilePath, dockerfileContent, 'utf8');
  echoKeyValue('Created', 'Dockerfile');
}

