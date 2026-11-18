/**
 * Dev operation implementation.
 *
 * Ported from `agentarts/toolkit/operations/runtime/dev.py`.
 *
 * The Python toolkit loads `"module:attribute"` entrypoints through uvicorn and
 * relies on uvicorn's `--reload` watcher. Node has no in-process equivalent
 * without adding a dependency (`tsx`, `ts-node`, ...), so this port:
 *
 * - dynamically `import()`s `<module>.ts` / `<module>.js` and resolves the named
 *   export;
 * - runs an {@link AgentArtsRuntimeApp} instance (or the value returned by a
 *   factory function) with `app.run(host, port)`;
 * - reports the same "Failed to start server - …" error and returns `false`
 *   when the module/export cannot be loaded;
 * - treats `--reload` as advisory: TypeScript projects must be started through
 *   an external watcher such as `tsx watch` or `vite-node` (documented in the
 *   command help and printed at startup).
 *
 * Java agent support was dropped from the Node.js port, so the Python
 * `run_java_dev_server()` branch is gone.
 */

import { existsSync, readFileSync } from 'node:fs';
import type { Server } from 'node:http';
import { basename, extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { parse as parseYaml } from 'yaml';

import { console, echoError, echoInfo } from '../../utils/common.js';

export { console };

/** Convert an unknown error to a message string. */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Whether an import error means "module not found". */
function isModuleNotFound(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  if (code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND') {
    return true;
  }
  const message = errorMessage(error);
  return message.includes('Cannot find module') || message.includes('Cannot find package');
}

// ---------------------------------------------------------------------------
// Configuration helpers
// ---------------------------------------------------------------------------

/**
 * Load the configuration file as a plain dictionary.
 *
 * @param configPath Configuration file path (default `.agentarts_config.yaml`).
 * @returns The parsed YAML mapping, or `{}` when the file is missing.
 */
export function loadConfig(configPath?: string | null): Record<string, any> {
  const path = configPath ? resolve(configPath) : resolve('.agentarts_config.yaml');

  if (existsSync(path)) {
    const content = readFileSync(path, 'utf8');
    return (parseYaml(content) ?? {}) as Record<string, any>;
  }

  return {};
}

/** First configured agent name (the default agent is preferred). */
function firstAgentName(config: Record<string, any>): string | null {
  const defaultAgent = config['default_agent'];
  if (defaultAgent) {
    return String(defaultAgent);
  }
  const agents = config['agents'];
  if (agents && typeof agents === 'object') {
    const keys = Object.keys(agents as Record<string, any>);
    if (keys.length > 0) {
      return keys[0];
    }
  }
  return null;
}

/** Read a `base` field of the default agent (Python `_get_base_field`). */
function _getBaseField(config: Record<string, any>, field: string): string | null {
  const agentName = firstAgentName(config);
  if (!agentName) {
    return null;
  }

  const agents = (config['agents'] ?? {}) as Record<string, any>;
  const agentConfig = (agents[agentName] ?? {}) as Record<string, any>;
  const baseConfig = (agentConfig['base'] ?? {}) as Record<string, any>;
  const value = baseConfig[field];
  return value === undefined || value === null ? null : String(value);
}

/**
 * Get the entrypoint from the configuration (`agent:create_app` style).
 */
export function getEntrypoint(config: Record<string, any>): string | null {
  return _getBaseField(config, 'entrypoint');
}

/**
 * Get the agent language from the configuration.
 *
 * Java agent support was dropped, so only Python/Node projects exist; the field
 * is kept for configuration parity.
 */
export function getLanguage(config: Record<string, any>): string | null {
  return _getBaseField(config, 'language');
}

// ---------------------------------------------------------------------------
// Environment variables
// ---------------------------------------------------------------------------

/** Get the environment variables declared in the configuration. */
export function getConfigEnvVars(config: Record<string, any>): Record<string, string> {
  const envVars: Record<string, string> = {};

  const agentName = firstAgentName(config);
  if (!agentName) {
    return envVars;
  }

  const agents = (config['agents'] ?? {}) as Record<string, any>;
  const agentConfig = (agents[agentName] ?? {}) as Record<string, any>;
  const runtimeConfig = (agentConfig['runtime'] ?? {}) as Record<string, any>;
  const envVarsList = Array.isArray(runtimeConfig['environment_variables'])
    ? (runtimeConfig['environment_variables'] as any[])
    : [];

  for (const envVar of envVarsList) {
    if (envVar && typeof envVar === 'object') {
      const key = (envVar as Record<string, any>)['key'];
      const value = (envVar as Record<string, any>)['value'];
      if (key) {
        envVars[String(key)] = value === null || value === undefined ? '' : String(value);
      }
    }
  }

  return envVars;
}

/**
 * Inject environment variables from the configuration and the CLI.
 *
 * CLI environment variables take precedence over the configuration file.
 */
export function injectEnvironmentVariables(
  config: Record<string, any>,
  cliEnvVars?: Record<string, string> | null,
): void {
  const configEnvVars = getConfigEnvVars(config);

  for (const [key, value] of Object.entries(configEnvVars)) {
    if (value !== null && value !== undefined) {
      process.env[key] = String(value);
    }
  }

  if (cliEnvVars) {
    for (const [key, value] of Object.entries(cliEnvVars)) {
      process.env[key] = value;
    }
  }
}

/**
 * Mask sensitive values for display.
 *
 * @returns The masked value when the key looks sensitive, the value otherwise.
 */
export function maskSensitiveValue(key: string, value: string): string {
  const sensitiveKeywords = ['key', 'secret', 'token', 'password', 'credential'];
  const keyLower = key.toLowerCase();

  if (sensitiveKeywords.some((keyword) => keyLower.includes(keyword))) {
    if (value.length > 8) {
      return `${value.slice(0, 4)}****${value.slice(-4)}`;
    }
    return '****';
  }

  return value;
}

/** Format environment variables for the startup panel. */
export function formatEnvDisplay(
  cliEnvVars: Record<string, string> | null | undefined,
  config: Record<string, any>,
): string {
  const configEnvVars = getConfigEnvVars(config);

  const allEnvVars: Record<string, string> = { ...configEnvVars };
  if (cliEnvVars) {
    Object.assign(allEnvVars, cliEnvVars);
  }

  if (Object.keys(allEnvVars).length === 0) {
    return '';
  }

  let lines = '\n[cyan]Environment Variables:[/cyan]';
  for (const [key, value] of Object.entries(allEnvVars)) {
    const isFromCli = Boolean(cliEnvVars && key in cliEnvVars);
    const source = isFromCli ? '[green](CLI)[/green]' : '[dim](config)[/dim]';

    if (value) {
      const displayValue = String(value).length < 30 ? String(value) : `${String(value).slice(0, 27)}...`;
      const maskedValue = maskSensitiveValue(key, displayValue);
      lines += `\n  [yellow]${key}[/yellow]=[white]${maskedValue}[/white] ${source}`;
    } else {
      lines += `\n  [yellow]${key}[/yellow]=[dim]<not set>[/dim] ${source}`;
    }
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Entrypoint loading
// ---------------------------------------------------------------------------

/** Candidate module files for an entrypoint module name. */
const MODULE_EXTENSIONS = ['.ts', '.js', '.mjs', '.cjs'] as const;

/**
 * Find the module file backing `moduleName`.
 *
 * @returns The absolute file path, or `null` when nothing exists.
 */
function findModuleFile(moduleName: string): string | null {
  const cwd = process.cwd();
  const extension = extname(moduleName);

  if (['.ts', '.js', '.mjs', '.cjs', '.tsx', '.jsx'].includes(extension)) {
    const explicit = join(cwd, moduleName);
    return existsSync(explicit) ? explicit : null;
  }

  for (const candidateExtension of MODULE_EXTENSIONS) {
    const candidate = join(cwd, `${moduleName}${candidateExtension}`);
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

/** A value that can start a runtime server (Python ASGI app counterpart). */
interface RunnableApp {
  run: (host?: string | null, port?: number) => Server;
}

function isRunnableApp(value: unknown): value is RunnableApp {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>)['run'] === 'function'
  );
}

/** Wait until the server starts listening (or fails to). */
function waitForListening(server: Server): Promise<void> {
  return new Promise<void>((resolvePromise, rejectPromise) => {
    const onListening = (): void => {
      server.off('error', onError);
      resolvePromise();
    };
    const onError = (error: Error): void => {
      server.off('listening', onListening);
      rejectPromise(error);
    };
    server.once('listening', onListening);
    server.once('error', onError);
  });
}

/**
 * Start a runtime app from the imported entrypoint export.
 *
 * - an {@link AgentArtsRuntimeApp} instance (or anything exposing `run`) is run
 *   directly;
 * - an entrypoint handler decorated with `app.entrypoint(...)` also exposes
 *   `run`, so it is run directly;
 * - any other function is treated as a factory and awaited.
 */
async function runEntrypointTarget(target: unknown, host: string, port: number): Promise<void> {
  if (isRunnableApp(target)) {
    const server = target.run(host, port);
    if (server && !server.listening) {
      await waitForListening(server);
    }
    return;
  }

  if (typeof target === 'function') {
    if (typeof (target as unknown as RunnableApp).run === 'function') {
      const server = (target as unknown as RunnableApp).run(host, port);
      if (server && !server.listening) {
        await waitForListening(server);
      }
      return;
    }

    const created = await (target as () => unknown)();
    if (isRunnableApp(created)) {
      const server = created.run(host, port);
      if (server && !server.listening) {
        await waitForListening(server);
      }
      return;
    }
    throw new Error('the entrypoint factory did not return an AgentArtsRuntimeApp');
  }

  throw new Error('the entrypoint export is neither an AgentArtsRuntimeApp nor a factory function');
}

// ---------------------------------------------------------------------------
// Dev server
// ---------------------------------------------------------------------------

/** Options for {@link runDevServer}. */
export interface RunDevServerOptions {
  /** Server port. */
  port: number;
  /** Server host. */
  host: string;
  /** Enable auto-reload (needs an external watcher, see the module docs). */
  reload: boolean;
  /** Configuration file path (default `.agentarts_config.yaml`). */
  configPath?: string | null;
  /** Environment variables from the command line. */
  envVars?: Record<string, string> | null;
}

/**
 * Run the local development server.
 *
 * Accepts `runDevServer(options)` or the positional Python form
 * `runDevServer(port, host, reload, configPath, envVars)`.
 *
 * @returns `true` when the server started.
 */
export function runDevServer(options: RunDevServerOptions): Promise<boolean>;
export function runDevServer(
  port: number,
  host: string,
  reload: boolean,
  configPath?: string | null,
  envVars?: Record<string, string> | null,
): Promise<boolean>;
export async function runDevServer(
  optionsOrPort: RunDevServerOptions | number,
  host?: string,
  reload?: boolean,
  configPath?: string | null,
  envVars?: Record<string, string> | null,
): Promise<boolean> {
  const options: RunDevServerOptions =
    typeof optionsOrPort === 'number'
      ? {
          port: optionsOrPort,
          host: host ?? '0.0.0.0',
          reload: reload ?? false,
          configPath: configPath ?? null,
          envVars: envVars ?? null,
        }
      : optionsOrPort;

  const config = loadConfig(options.configPath ?? null);

  const entrypoint = getEntrypoint(config);
  if (!entrypoint) {
    echoError('No entrypoint found in configuration');
    console.print("[dim]Please set 'entrypoint' in .agentarts_config.yaml[/dim]");
    return false;
  }

  const moduleName = entrypoint.includes(':') ? entrypoint.split(':')[0] : entrypoint;
  const moduleFile = findModuleFile(moduleName);
  if (moduleFile === null) {
    echoError(`Module file '${moduleName}.ts' not found`);
    console.print(
      `[dim]Please ensure '${moduleName}.ts' (or '${moduleName}.js') exists in current directory[/dim]`,
    );
    return false;
  }

  process.env['AGENTARTS_ENV'] = 'development';
  process.env['AGENTARTS_CONFIG'] = options.configPath || '.agentarts_config.yaml';

  injectEnvironmentVariables(config, options.envVars ?? null);

  const envDisplay = formatEnvDisplay(options.envVars ?? null, config);

  console.print();
  echoInfo(
    'Development Server',
    `[cyan]Host:[/cyan] [white]${options.host}[/white]\n[cyan]Port:[/cyan] [white]${options.port}[/white]\n[cyan]Config:[/cyan] [yellow]${options.configPath || '.agentarts_config.yaml'}[/yellow]\n[cyan]Entrypoint:[/cyan] [yellow]${entrypoint}[/yellow]\n[cyan]Auto-reload:[/cyan] [green]${options.reload ? 'enabled' : 'disabled'}[/green]${envDisplay}`,
  );
  console.print();
  console.print(
    `[cyan]Invocation Endpoint:[/cyan] [white]POST[/white] [link]http://${options.host}:${options.port}/invocations[/link]`,
  );
  console.print(
    `[cyan]Health Check:[/cyan] [white]GET[/white] [link]http://${options.host}:${options.port}/ping[/link]`,
  );
  console.print();

  if (extname(moduleFile) === '.ts') {
    console.print(
      "[dim]TypeScript entrypoint detected: run the dev server through a loader such as 'tsx' " +
        "or 'vite-node' (e.g. 'tsx ./dist/cli.js dev'), which compile on the fly.[/dim]",
    );
  }
  if (options.reload) {
    console.print(
      "[dim]In-process auto-reload is not available in Node.js: run the CLI under an external " +
        "watcher such as 'tsx watch' or 'node --watch' to restart on changes.[/dim]",
    );
  }

  const targetName = entrypoint.includes(':') ? entrypoint.split(':').slice(1).join(':') : null;
  if (!targetName) {
    echoError(
      `Failed to start server - entrypoint '${entrypoint}' must be in 'module:export' form`,
    );
    return false;
  }

  let moduleNamespace: Record<string, any>;
  try {
    moduleNamespace = (await import(pathToFileURL(moduleFile).href)) as Record<string, any>;
  } catch (error) {
    echoError(`Failed to start server - ${errorMessage(error)}`);
    if (isModuleNotFound(error)) {
      console.print('[dim]Make sure all dependencies are installed: npm install[/dim]');
    }
    return false;
  }

  const target = moduleNamespace[targetName];
  if (target === undefined) {
    echoError(
      `Failed to start server - Attribute '${targetName}' not found in module '${basename(moduleFile)}'`,
    );
    return false;
  }

  try {
    await runEntrypointTarget(target, options.host, options.port);
    return true;
  } catch (error) {
    echoError(`Failed to start server - ${errorMessage(error)}`);
    if (isModuleNotFound(error)) {
      console.print('[dim]Make sure all dependencies are installed: npm install[/dim]');
    }
    return false;
  }
}
