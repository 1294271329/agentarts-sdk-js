/**
 * Config operation implementation.
 *
 * Ported from `agentarts/toolkit/operations/runtime/config.py`. The module reads
 * and writes `.agentarts_config.yaml` in the current working directory and
 * prints the corresponding tables/values through the toolkit console layer.
 *
 * Java agent support was dropped from the Node.js port, so the Python
 * `infer_language()` branches for `pom.xml` / fully-qualified class name
 * entrypoints and the `eclipse-temurin` base image are gone: only `python3`
 * projects are inferred.
 */

import { existsSync } from 'node:fs';
import * as os from 'node:os';
import { join } from 'node:path';

import { stringify as stringifyYaml } from 'yaml';

import { console } from '../../utils/console.js';
import { generateDockerfile as _generateDockerfile } from '../../utils/runtime/container.js';
import {
  AgentArtsConfig,
  AgentArtsConfigList,
  BaseConfig,
  SWRConfig,
  detectArch,
} from '../../utils/runtime/config.js';
import { generateSwrOrgName } from '../../utils/swr-org.js';

export { console };

/** Name of the toolkit configuration file (`.agentarts_config.yaml`). */
export const CONFIG_FILE_NAME = '.agentarts_config.yaml';

/** Loose dictionary matching `dict[str, Any]` (JSON/YAML object). */
type ConfigDict = Record<string, any>;

/** Convert an unknown error to a message string. */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ---------------------------------------------------------------------------
// Environment detection
// ---------------------------------------------------------------------------

/**
 * Detect the current platform architecture.
 *
 * Counterpart of Python's `platform.machine()` / `platform.system()` pair: the
 * machine comes from `os.machine()` and the system from `process.platform`.
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
  // Python uses `platform.system()`: 'Linux' / 'Darwin' / 'Windows'.
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

/**
 * Detect the dependency file in the current directory.
 *
 * Node.js projects always use `package.json`.
 *
 * @returns The detected file name (`package.json`).
 */
export function detectDependencyFile(): string {
  return 'package.json';
}

// ---------------------------------------------------------------------------
// Configuration load/save
// ---------------------------------------------------------------------------

/** Get the configuration file path in the current directory. */
export function getConfigFilePath(): string {
  return join(process.cwd(), CONFIG_FILE_NAME);
}

/**
 * Load configuration from `.agentarts_config.yaml`.
 *
 * @returns The parsed configuration (empty when the file does not exist).
 */
export function loadConfig(): AgentArtsConfigList {
  const configPath = getConfigFilePath();
  if (existsSync(configPath)) {
    try {
      return AgentArtsConfigList.fromYaml(configPath);
    } catch (error) {
      console.print(`[yellow]Warning: Failed to load config file: ${errorMessage(error)}[/yellow]`);
      return new AgentArtsConfigList();
    }
  }
  return new AgentArtsConfigList();
}

/**
 * Save configuration to `.agentarts_config.yaml`.
 *
 * @returns `true` when the file was written, `false` otherwise.
 */
export function saveConfig(config: AgentArtsConfigList): boolean {
  const configPath = getConfigFilePath();
  try {
    config.toYaml(configPath);
    return true;
  } catch (error) {
    console.print(`[red]Error: Failed to save config file: ${errorMessage(error)}[/red]`);
    return false;
  }
}

/**
 * Ensure the configuration file exists and return the configuration.
 *
 * @returns The (possibly newly created) configuration.
 */
export function ensureConfigExists(): AgentArtsConfigList {
  const config = loadConfig();
  if (!existsSync(getConfigFilePath())) {
    saveConfig(config);
  }
  return config;
}

// ---------------------------------------------------------------------------
// Agent accessors
// ---------------------------------------------------------------------------

/** List all configured agent names. */
export function listAgents(): string[] {
  const config = loadConfig();
  return config.listAgents();
}

/** Get the default agent name, or `null` when none is configured. */
export function getDefaultAgent(): string | null {
  const config = loadConfig();
  return config.defaultAgent;
}

/**
 * Set the default agent name.
 *
 * @returns `true` when the agent exists and was saved, `false` otherwise.
 */
export function setDefaultAgent(name: string): boolean {
  const config = loadConfig();

  if (!config.listAgents().includes(name)) {
    console.print(`[red]Error: Agent '${name}' not found in configuration[/red]`);
    console.print(`[dim]Available agents: ${config.listAgents().join(', ') || 'none'}[/dim]`);
    return false;
  }

  config.defaultAgent = name;
  if (saveConfig(config)) {
    console.print(`[green]Done:[/green] Default agent set to [cyan]${name}[/cyan]`);
    return true;
  }
  return false;
}

/**
 * Get agent configuration by name.
 *
 * @param name Agent name (uses the default agent when omitted).
 * @returns The agent configuration, or `null` when it cannot be resolved.
 */
export function getAgent(name?: string | null): AgentArtsConfig | null {
  const config = loadConfig();
  return config.getAgent(name);
}

/**
 * Infer the agent language from the dependency file / entrypoint.
 *
 * Java projects (`pom.xml`, fully-qualified class name entrypoints) used to
 * yield `java17` in the Python toolkit; Java agent support was dropped from the
 * Node.js port, so only `python3` can be inferred here.
 */
export function inferLanguage(_dependencyFile: string | null, _entrypoint: string | null): string {
  return 'nodejs';
}

/**
 * Default base image for a language.
 *
 * The `eclipse-temurin:17-jre` branch the Python toolkit used for Java projects
 * is gone with Java agent support.
 */
export function defaultBaseImage(_language: string | null): string {
  return 'node:22-slim';
}

// ---------------------------------------------------------------------------
// YAML dictionary helpers (Python `dict.setdefault` semantics)
// ---------------------------------------------------------------------------

/** Python `dict.setdefault(key, {})` for nested objects. */
function setDefaultObject(dict: ConfigDict, key: string): ConfigDict {
  const current = dict[key];
  if (current === undefined || current === null || typeof current !== 'object') {
    dict[key] = {};
  }
  return dict[key] as ConfigDict;
}

/** Python `dict.get(key, {}).get(inner, fallback)`. */
function nestedGet(dict: ConfigDict, key: string, inner: string, fallback: any): any {
  const nested = dict[key];
  if (nested === null || nested === undefined || typeof nested !== 'object') {
    return fallback;
  }
  const value = (nested as ConfigDict)[inner];
  return value === undefined ? fallback : value;
}

/** Render a configuration value the way Python's `str()` would for output. */
function formatValue(value: any): string {
  if (value === null || value === undefined) {
    return 'None';
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

// ---------------------------------------------------------------------------
// Agent mutation
// ---------------------------------------------------------------------------

/** Options for {@link addAgent} (Python keyword arguments). */
export interface AddAgentOptions {
  /** Huawei Cloud region. */
  region?: string | null;
  /** SWR organization. */
  swrOrganization?: string | null;
  /** SWR repository. */
  swrRepository?: string | null;
  /** Path to the dependency file (e.g. `requirements.txt`). */
  dependencyFile?: string | null;
  /** Agent language (e.g. `python3`); inferred when omitted. */
  language?: string | null;
  /** Whether to make this agent the default (default `true`). */
  setAsDefault?: boolean;
  /** Whether to auto-create the SWR organization (default `false`). */
  organizationAutoCreate?: boolean;
  /** Whether to auto-create the SWR repository (default `false`). */
  repositoryAutoCreate?: boolean;
}

/**
 * Add or update an agent configuration.
 *
 * Accepts either `addAgent(name, entrypoint, options)` or a single
 * `addAgent({ name, entrypoint, ...options })` object.
 *
 * @returns `true` when the configuration was saved.
 */
export function addAgent(
  name: string,
  entrypoint: string,
  options?: AddAgentOptions,
): Promise<boolean>;
export function addAgent(
  options: AddAgentOptions & { name: string; entrypoint: string },
): Promise<boolean>;
export async function addAgent(
  nameOrOptions: string | (AddAgentOptions & { name: string; entrypoint: string }),
  entrypoint?: string,
  options: AddAgentOptions = {},
): Promise<boolean> {
  const opts: AddAgentOptions & { name?: string; entrypoint?: string } =
    typeof nameOrOptions === 'string'
      ? { ...options, name: nameOrOptions, entrypoint: entrypoint ?? '' }
      : nameOrOptions;
  const name = String(opts.name ?? '');
  const agentEntrypoint = opts.entrypoint ?? null;
  const region = opts.region ?? null;
  const swrOrganization = opts.swrOrganization ?? null;
  const swrRepository = opts.swrRepository ?? null;
  const dependencyFile = opts.dependencyFile ?? null;
  const language = opts.language ?? null;
  const setAsDefault = opts.setAsDefault ?? true;
  const organizationAutoCreate = opts.organizationAutoCreate ?? false;
  const repositoryAutoCreate = opts.repositoryAutoCreate ?? false;

  const config = loadConfig();
  const existingAgent = config.getAgent(name);

  let agentConfig: AgentArtsConfig;

  if (existingAgent) {
    const existingDict: ConfigDict = existingAgent.toDict();
    const base = setDefaultObject(existingDict, 'base');
    const swrConfig = setDefaultObject(existingDict, 'swr_config');

    if (agentEntrypoint !== null) {
      base['entrypoint'] = agentEntrypoint;
    }
    if (region !== null) {
      base['region'] = region;
    }
    if (dependencyFile !== null) {
      base['dependency_file'] = dependencyFile;
    }
    base['name'] = name;

    // Language: explicit override wins; otherwise keep the existing value;
    // otherwise infer from the (possibly updated) dependency file/entrypoint.
    const effectiveDep = nestedGet(existingDict, 'base', 'dependency_file', dependencyFile);
    const effectiveEp = nestedGet(existingDict, 'base', 'entrypoint', agentEntrypoint);
    if (language !== null) {
      base['language'] = language;
      base['base_image'] = defaultBaseImage(language);
    } else if (!base['language']) {
      const inferred = inferLanguage(effectiveDep, effectiveEp);
      base['language'] = inferred;
      base['base_image'] = defaultBaseImage(inferred);
    }

    if (swrOrganization !== null) {
      swrConfig['organization'] = swrOrganization;
    }
    if (swrRepository !== null) {
      swrConfig['repository'] = swrRepository;
    }
    swrConfig['organization_auto_create'] = organizationAutoCreate;
    swrConfig['repository_auto_create'] = repositoryAutoCreate;

    agentConfig = AgentArtsConfig.fromDict(existingDict);
  } else {
    const detectedPlatform = detectPlatform();
    const detectedArch = detectArch();
    const effectiveLanguage = language || inferLanguage(dependencyFile, agentEntrypoint);
    agentConfig = new AgentArtsConfig({
      base: new BaseConfig({
        name,
        entrypoint: agentEntrypoint,
        region,
        dependencyFile,
        platform: detectedPlatform,
        language: effectiveLanguage,
        baseImage: defaultBaseImage(effectiveLanguage),
        // Pydantic's `extra="allow"` keeps `arch` on the base config.
        arch: detectedArch,
      }),
      // The Python implementation also computes a default region/SWR org/repo
      // here but never assigns them, so the values stay `null` unless given
      // explicitly (see tests/unit/toolkit/operations/runtime/test_config.py).
      swrConfig: new SWRConfig({
        organization: swrOrganization,
        repository: swrRepository,
        organizationAutoCreate,
        repositoryAutoCreate,
      }),
    });
  }

  config.addAgent(name, agentConfig);

  if (setAsDefault || config.defaultAgent === null) {
    config.defaultAgent = name;
  }

  if (saveConfig(config)) {
    console.print(`[green]Done:[/green] Agent [cyan]${name}[/cyan] configured successfully`);
    console.print(`[dim]Config file: ${getConfigFilePath()}[/dim]`);
    return true;
  }
  return false;
}

/**
 * Remove an agent configuration.
 *
 * @returns `true` when the agent existed and the configuration was saved.
 */
export function removeAgent(name: string): boolean {
  const config = loadConfig();

  if (!config.listAgents().includes(name)) {
    console.print(`[red]Error: Agent '${name}' not found in configuration[/red]`);
    return false;
  }

  config.removeAgent(name);
  if (saveConfig(config)) {
    console.print(`[green]Done:[/green] Agent [cyan]${name}[/cyan] removed`);
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Printing
// ---------------------------------------------------------------------------

/** Print all configured agents in a table format. */
export function printConfigList(): void {
  const config = loadConfig();
  const agents = config.agents ?? {};

  if (config.listAgents().length === 0) {
    console.print('[dim]No agents configured[/dim]');
    console.print("\n[dim]Run 'agentarts config' to configure an agent[/dim]");
    return;
  }

  const rows: string[][] = [];
  for (const [name, agentConfig] of Object.entries(agents)) {
    rows.push([
      name === config.defaultAgent ? '*' : '',
      name,
      agentConfig.base.region || '-',
      agentConfig.base.entrypoint || '-',
      agentConfig.base.dependencyFile || '-',
      agentConfig.swrConfig.organization || '-',
      agentConfig.swrConfig.repository || '-',
    ]);
  }

  console.print(`[bold]Agent Configurations (${getConfigFilePath()})[/bold]`);
  console.printTable(rows, [
    'Default',
    'Agent Name',
    'Region',
    'Entrypoint',
    'Dependency File',
    'SWR Org',
    'SWR Repo',
  ]);

  if (config.defaultAgent) {
    console.print(`\n[dim]Default agent: [cyan]${config.defaultAgent}[/cyan][/dim]`);
  }
}

/**
 * Print detailed configuration for an agent.
 *
 * @param name Agent name (uses the default agent when omitted).
 * @returns `true` when the agent exists.
 */
export function printAgentDetail(name?: string | null): boolean {
  const config = loadConfig();

  let agentName = name ?? null;
  if (agentName === null) {
    agentName = config.defaultAgent;
  }

  if (agentName === null) {
    console.print('[red]Error: No agent specified and no default agent set[/red]');
    return false;
  }

  const agentConfig = config.getAgent(agentName);
  if (agentConfig === null) {
    console.print(`[red]Error: Agent '${agentName}' not found in configuration[/red]`);
    return false;
  }

  console.print(`\n[bold cyan]Agent: ${agentName}[/bold cyan]`);
  if (agentName === config.defaultAgent) {
    console.print('[dim](default)[/dim]');
  }
  console.print();

  const configDict = agentConfig.toDict();
  console.print(stringifyYaml(configDict));

  return true;
}

// ---------------------------------------------------------------------------
// Dot-notation configuration values
// ---------------------------------------------------------------------------

/**
 * Set a configuration value for an agent (dot notation, e.g. `base.region`).
 *
 * @returns `true` when the value was stored and saved.
 */
export function setConfigValue(key: string, value: string, agentName?: string | null): boolean {
  const config = loadConfig();

  let agent = agentName ?? null;
  if (agent === null) {
    agent = config.defaultAgent;
  }

  if (agent === null) {
    console.print('[red]Error: No agent specified and no default agent set[/red]');
    return false;
  }

  const agentConfig = config.getAgent(agent);
  if (agentConfig === null) {
    console.print(`[red]Error: Agent '${agent}' not found[/red]`);
    return false;
  }

  const keys = key.split('.');
  const configDict = agentConfig.toDict();

  let current: ConfigDict = configDict;
  for (const part of keys.slice(0, -1)) {
    if (!(part in current) || current[part] === null || typeof current[part] !== 'object') {
      current[part] = {};
    }
    current = current[part] as ConfigDict;
  }

  current[keys[keys.length - 1]] = value;

  try {
    const updatedConfig = AgentArtsConfig.fromDict(configDict);

    if (key === 'base.name' && value !== agent) {
      config.agents[value] = updatedConfig;
      delete config.agents[agent];

      if (config.defaultAgent === agent) {
        config.defaultAgent = value;
      }

      console.print(`[green]Done:[/green] Renamed agent [cyan]${agent}[/cyan] to [cyan]${value}[/cyan]`);
      agent = value;
    } else {
      config.agents[agent] = updatedConfig;
    }

    if (saveConfig(config)) {
      if (key !== 'base.name') {
        console.print(
          `[green]Done:[/green] Set [cyan]${key}[/cyan] = [yellow]${value}[/yellow] for agent [cyan]${agent}[/cyan]`,
        );
      }
      return true;
    }
  } catch (error) {
    console.print(`[red]Error: Failed to set configuration: ${errorMessage(error)}[/red]`);
    return false;
  }

  return false;
}

/**
 * Get a configuration value for an agent (dot notation).
 *
 * @returns `true` when the key exists.
 */
export function getConfigValue(key: string, agentName?: string | null): boolean {
  const config = loadConfig();

  let agent = agentName ?? null;
  if (agent === null) {
    agent = config.defaultAgent;
  }

  if (agent === null) {
    console.print('[red]Error: No agent specified and no default agent set[/red]');
    return false;
  }

  const agentConfig = config.getAgent(agent);
  if (agentConfig === null) {
    console.print(`[red]Error: Agent '${agent}' not found[/red]`);
    return false;
  }

  const keys = key.split('.');
  const configDict = agentConfig.toDict();

  try {
    let current: any = configDict;
    for (const part of keys) {
      // Python raises KeyError/TypeError while walking the dict; the final
      // value itself may legitimately be `None`.
      if (current === null || current === undefined || typeof current !== 'object') {
        throw new Error(`Key '${key}' not found`);
      }
      if (!(part in current) || current[part] === undefined) {
        throw new Error(`Key '${key}' not found`);
      }
      current = current[part];
    }
    console.print(`[cyan]${key}[/cyan] = [yellow]${formatValue(current)}[/yellow] (agent: ${agent})`);
    return true;
  } catch {
    console.print(`[red]Error: Key '${key}' not found in agent '${agent}'[/red]`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Environment variables of an agent
// ---------------------------------------------------------------------------

/**
 * Set an environment variable for an agent.
 *
 * If the variable already exists, its value is updated.
 *
 * @returns `true` when the configuration was saved.
 */
export function setEnv(key: string, value: string, agentName?: string | null): boolean {
  const config = loadConfig();

  let agent = agentName ?? null;
  if (agent === null) {
    agent = config.defaultAgent;
  }

  if (agent === null) {
    console.print('[red]Error: No agent specified and no default agent set[/red]');
    return false;
  }

  const agentConfig = config.getAgent(agent);
  if (agentConfig === null) {
    console.print(`[red]Error: Agent '${agent}' not found[/red]`);
    return false;
  }

  const configDict = agentConfig.toDict();
  const runtime = setDefaultObject(configDict, 'runtime');
  const envVars = Array.isArray(runtime['environment_variables'])
    ? (runtime['environment_variables'] as ConfigDict[])
    : [];

  for (const envVar of envVars) {
    if (envVar['key'] === key) {
      envVar['value'] = value;
      config.agents[agent] = AgentArtsConfig.fromDict(configDict);
      if (saveConfig(config)) {
        console.print(
          `[green]Done:[/green] Updated env [cyan]${key}[/cyan] for agent [cyan]${agent}[/cyan]`,
        );
        return true;
      }
      return false;
    }
  }

  envVars.push({ key, value });
  runtime['environment_variables'] = envVars;
  config.agents[agent] = AgentArtsConfig.fromDict(configDict);
  if (saveConfig(config)) {
    console.print(`[green]Done:[/green] Added env [cyan]${key}[/cyan] for agent [cyan]${agent}[/cyan]`);
    return true;
  }
  return false;
}

/**
 * Remove an environment variable from an agent.
 *
 * @returns `true` when the variable existed and the configuration was saved.
 */
export function removeEnv(key: string, agentName?: string | null): boolean {
  const config = loadConfig();

  let agent = agentName ?? null;
  if (agent === null) {
    agent = config.defaultAgent;
  }

  if (agent === null) {
    console.print('[red]Error: No agent specified and no default agent set[/red]');
    return false;
  }

  const agentConfig = config.getAgent(agent);
  if (agentConfig === null) {
    console.print(`[red]Error: Agent '${agent}' not found[/red]`);
    return false;
  }

  const configDict = agentConfig.toDict();
  const runtime = setDefaultObject(configDict, 'runtime');
  const existing = Array.isArray(runtime['environment_variables'])
    ? (runtime['environment_variables'] as ConfigDict[])
    : [];

  const filtered = existing.filter((envVar) => envVar['key'] !== key);

  if (filtered.length === existing.length) {
    console.print(`[red]Error: Environment variable '${key}' not found for agent '${agent}'[/red]`);
    return false;
  }

  runtime['environment_variables'] = filtered;
  config.agents[agent] = AgentArtsConfig.fromDict(configDict);
  if (saveConfig(config)) {
    console.print(
      `[green]Done:[/green] Removed env [cyan]${key}[/cyan] from agent [cyan]${agent}[/cyan]`,
    );
    return true;
  }
  return false;
}

/**
 * List environment variables for an agent.
 *
 * @returns `true` when the agent exists (even when no variables are set).
 */
export function listEnv(agentName?: string | null): boolean {
  const config = loadConfig();

  let agent = agentName ?? null;
  if (agent === null) {
    agent = config.defaultAgent;
  }

  if (agent === null) {
    console.print('[red]Error: No agent specified and no default agent set[/red]');
    return false;
  }

  const agentConfig = config.getAgent(agent);
  if (agentConfig === null) {
    console.print(`[red]Error: Agent '${agent}' not found[/red]`);
    return false;
  }

  const envVars = agentConfig.runtime.environmentVariables ?? [];

  if (envVars.length === 0) {
    console.print(`[dim]No environment variables configured for agent '${agent}'[/dim]`);
    return true;
  }

  const rows = envVars.map((envVar) => [
    envVar.key,
    envVar.value !== null && envVar.value !== undefined ? String(envVar.value) : '[dim]<not set>[/dim]',
  ]);

  console.print(`[bold]Environment Variables (${agent})[/bold]`);
  console.printTable(rows, ['Key', 'Value']);
  return true;
}

// ---------------------------------------------------------------------------
// Dockerfile generation
// ---------------------------------------------------------------------------

/** Options for {@link generateDockerfile}. */
export interface GenerateDockerfileOptions {
  /** Agent name (uses the default agent when omitted). */
  agentName?: string | null;
  /** Output path for the Dockerfile (default `./Dockerfile`). */
  outputPath?: string | null;
}

/**
 * Generate a Dockerfile for an agent.
 *
 * Accepts `generateDockerfile(options)`, `generateDockerfile(agentName)` or
 * `generateDockerfile(agentName, outputPath)`.
 *
 * @returns `true` when the Dockerfile was written.
 */
export function generateDockerfile(options?: GenerateDockerfileOptions): boolean;
export function generateDockerfile(
  agentName?: string | null,
  outputPath?: string | null,
): boolean;
export function generateDockerfile(
  agentNameOrOptions?: string | GenerateDockerfileOptions | null,
  outputPath?: string | null,
): boolean {
  const options: GenerateDockerfileOptions =
    typeof agentNameOrOptions === 'string' || agentNameOrOptions === null || agentNameOrOptions === undefined
      ? { agentName: agentNameOrOptions ?? null, outputPath }
      : agentNameOrOptions;

  const config = loadConfig();

  let agent = options.agentName ?? null;
  if (agent === null) {
    agent = config.defaultAgent;
  }

  if (agent === null) {
    console.print('[red]Error: No agent specified and no default agent set[/red]');
    return false;
  }

  const agentConfig = config.getAgent(agent);
  if (agentConfig === null) {
    console.print(`[red]Error: Agent '${agent}' not found[/red]`);
    return false;
  }

  const baseImage = agentConfig.base.baseImage;
  const dependencyFile = agentConfig.base.dependencyFile;
  const entrypoint = agentConfig.base.entrypoint;
  const region = agentConfig.base.region;
  const port = agentConfig.runtime.invokeConfig ? agentConfig.runtime.invokeConfig.port : 8080;

  return _generateDockerfile(
    baseImage,
    dependencyFile,
    entrypoint,
    port,
    options.outputPath || 'Dockerfile',
    region,
  );
}

/**
 * Generate the default SWR organization name for a region.
 *
 * Re-exported for the CLI, mirroring `agentarts.toolkit.utils.swr_org`.
 */
export { generateSwrOrgName };


