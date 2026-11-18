/**
 * Shared helpers for the non-mock integration / e2e suite.
 *
 * Ported from `agentarts-sdk-python/tests/integration/_helpers.py`, plus the
 * reusable fixture semantics of `tests/integration/conftest.py` (gates, shared
 * clients, cleanup registry). Vitest has no `conftest.py`; the equivalent is a
 * plain module imported by every test file.
 *
 * Safety model (three tiers, see README.md):
 * - default ............ read-only list/get + local agents (no cloud writes)
 * - ALLOW_CREATE=1 ..... create→get→update→delete lifecycle, teardown-guaranteed
 * - RUN_BILLABLE=1 ..... code-interpreter sandbox + runtime invoke (real money)
 *
 * Every resource created by a test is registered with {@link resourceRegistry};
 * at the end of the file the registry calls each deleter in reverse order,
 * swallowing errors so a failing cleanup never masks a real failure.
 *
 * Credential auto-loading: `tests/integration/.env` is loaded into
 * `process.env` at module load; existing environment variables always win, so
 * real shell exports take precedence over the file.
 */

import { spawn, spawnSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { closeSync, existsSync, openSync, readFileSync, unlinkSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DeleteApiKeyCredentialProviderRequest,
  DeleteOauth2CredentialProviderRequest,
  DeleteStsCredentialProviderRequest,
  DeleteWorkloadIdentityRequest,
} from 'huaweicloud-sdk-agentidentity';
import type { AgentIdentityClient } from 'huaweicloud-sdk-agentidentity';
import { GatewayClient } from 'agentarts-sdk/sdk/gateway';
import { IdentityClient } from 'agentarts-sdk/sdk/identity';
import { MemoryClient } from 'agentarts-sdk/sdk/memory';
import type { SpaceInfo } from 'agentarts-sdk/sdk/memory';
import { RuntimeClient } from 'agentarts-sdk/sdk/service/runtime-client';
import { getRegion } from 'agentarts-sdk/sdk/utils/constant';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Prefix for every resource created by this suite (grep target). */
export const RESOURCE_PREFIX = 'aa-it';

/** Env vars that flip the three-tier safety model on/off. */
export const ENV_ALLOW_CREATE = 'AGENTARTS_TEST_ALLOW_CREATE';
export const ENV_RUN_BILLABLE = 'AGENTARTS_TEST_RUN_BILLABLE';
export const ENV_RUN_ID = 'AGENTARTS_TEST_RUN_ID';

/** Credential / scenario env vars. */
export const ENV_AK = 'HUAWEICLOUD_SDK_AK';
export const ENV_SK = 'HUAWEICLOUD_SDK_SK';
export const ENV_REGION = 'HUAWEICLOUD_SDK_REGION';
export const ENV_MEMORY_API_KEY = 'HUAWEICLOUD_SDK_MEMORY_API_KEY';
export const ENV_CODE_INTERPRETER_API_KEY = 'HUAWEICLOUD_SDK_CODE_INTERPRETER_API_KEY';
export const ENV_PRE_WORKLOAD_IDENTITY = 'AGENTARTS_TEST_WORKLOAD_IDENTITY_NAME';
export const ENV_RUNTIME_AGENT_NAME = 'AGENTARTS_TEST_RUNTIME_AGENT_NAME';
export const ENV_CODE_INTERPRETER_NAME = 'AGENTARTS_TEST_CODE_INTERPRETER_NAME';
export const ENV_STS_AGENCY_URN = 'AGENTARTS_TEST_STS_AGENCY_URN';
export const ENV_OAUTH2_CLIENT_ID = 'AGENTARTS_TEST_OAUTH2_CLIENT_ID';
export const ENV_OAUTH2_CLIENT_SECRET = 'AGENTARTS_TEST_OAUTH2_CLIENT_SECRET';
export const ENV_OAUTH2_VENDOR = 'AGENTARTS_TEST_OAUTH2_VENDOR';
export const ENV_MEMORY_WAIT = 'AGENTARTS_TEST_MEMORY_WAIT';
/**
 * Node-port-only: directory of an already deployed CLI project
 * (`agentarts init` + `deploy`), used by the CLI deployed-runtime e2e tests.
 * The Python suite builds it through the `deployed_runtime_agent` fixture; that
 * fixture (Docker build + SWR push) is not ported.
 */
export const ENV_DEPLOY_PROJECT_DIR = 'AGENTARTS_TEST_DEPLOY_PROJECT_DIR';

const TRUTHY_VALUES = new Set(['1', 'true', 'yes', 'on']);

/** Directory of this helper module (`tests/integration`). */
export const INTEGRATION_DIR = dirname(fileURLToPath(import.meta.url));

/** Repository root (`agentarts-sdk-js`). */
export const REPO_ROOT = resolve(INTEGRATION_DIR, '..', '..');

/** Built CLI entry (`packages/agentarts-sdk/dist/cli.js`). */
export const CLI_DIST_PATH = join(REPO_ROOT, 'packages', 'agentarts-sdk', 'dist', 'cli.js');

// ---------------------------------------------------------------------------
// .env loading (`python-dotenv` counterpart)
// ---------------------------------------------------------------------------

let dotEnvLoaded = false;

/**
 * Load `tests/integration/.env` into `process.env`.
 *
 * No-op when the file is absent; never overrides an already-set variable.
 * Parsing is deliberately minimal: `KEY=VALUE` lines, `#` comments, optional
 * surrounding quotes.
 */
export function loadDotEnv(filePath: string = join(INTEGRATION_DIR, '.env')): void {
  if (dotEnvLoaded) {
    return;
  }
  dotEnvLoaded = true;
  if (!existsSync(filePath)) {
    return;
  }
  let text: string;
  try {
    text = readFileSync(filePath, 'utf8');
  } catch {
    return;
  }
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const separator = line.indexOf('=');
    if (separator <= 0) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (value.length >= 2 && /^(['"]).*\1$/.test(value)) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function ensureDotEnv(): void {
  if (!dotEnvLoaded) {
    loadDotEnv();
  }
}

// ---------------------------------------------------------------------------
// Environment helpers
// ---------------------------------------------------------------------------

/** True if env var `name` is set to a truthy value (1/true/yes/on). */
export function envTruthy(name: string): boolean {
  ensureDotEnv();
  const value = process.env[name];
  return typeof value === 'string' && TRUTHY_VALUES.has(value.trim().toLowerCase());
}

/** Tiers. */
export function allowCreate(): boolean {
  return envTruthy(ENV_ALLOW_CREATE);
}

export function runBillable(): boolean {
  return envTruthy(ENV_RUN_BILLABLE);
}

/** Return env var `name` (after loading `.env`), or `undefined` when unset. */
export function envValue(name: string): string | undefined {
  ensureDotEnv();
  const value = process.env[name];
  return value !== undefined && value !== '' ? value : undefined;
}

/** True when env var `name` is set and non-empty. */
export function hasEnv(name: string): boolean {
  return envValue(name) !== undefined;
}

/** Return env var `name` or throw — used inside gated describes only. */
export function requireEnv(name: string): string {
  const value = envValue(name);
  if (!value) {
    throw new Error(`Required env var ${name} is not set`);
  }
  return value;
}

/** Gate: skip unless AK/SK are present. Region has a sane default. */
export function hasCloudCredentials(): boolean {
  ensureDotEnv();
  return Boolean(envValue(ENV_AK) && envValue(ENV_SK));
}

/** Region used by the cloud clients (falls back to the SDK default). */
export function cloudRegion(): string {
  ensureDotEnv();
  return getRegion();
}

/** Pre-provisioned workload identity for read-only get/token tests. */
export function preWorkloadIdentityName(): string | undefined {
  return envValue(ENV_PRE_WORKLOAD_IDENTITY);
}

/** API key of a pre-provisioned code interpreter (data plane). */
export function codeInterpreterApiKey(): string | undefined {
  return envValue(ENV_CODE_INTERPRETER_API_KEY);
}

/** Pre-deployed runtime agent used by the runtime data-plane tests. */
export function runtimeAgentName(): string | undefined {
  return envValue(ENV_RUNTIME_AGENT_NAME);
}

/** Pre-provisioned code interpreter used by the billable sandbox test. */
export function codeInterpreterName(): string | undefined {
  return envValue(ENV_CODE_INTERPRETER_NAME);
}

/** Directory of an already deployed CLI project (see {@link ENV_DEPLOY_PROJECT_DIR}). */
export function deployProjectDir(): string | undefined {
  return envValue(ENV_DEPLOY_PROJECT_DIR);
}

/** IAM agency URN (`iam::<agency_name>`) for the STS provider lifecycle. */
export function stsAgencyUrn(): string | undefined {
  return envValue(ENV_STS_AGENCY_URN);
}

/** OAuth2 vendor inputs (conditional lifecycle test). */
export interface OAuth2ProviderInputs {
  clientId: string;
  clientSecret: string;
  vendor: string;
}

export function oauth2ProviderInputs(): OAuth2ProviderInputs | undefined {
  const clientId = envValue(ENV_OAUTH2_CLIENT_ID);
  const clientSecret = envValue(ENV_OAUTH2_CLIENT_SECRET);
  if (!clientId || !clientSecret) {
    return undefined;
  }
  return {
    clientId,
    clientSecret,
    vendor: envValue(ENV_OAUTH2_VENDOR) ?? 'GITHUBOAUTH2',
  };
}

/** Seconds to wait for backend memory extraction (default 90). */
export function memoryExtractionWaitSeconds(): number {
  const raw = envValue(ENV_MEMORY_WAIT);
  const parsed = raw ? Number(raw) : 90;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 90;
}

/** True when a Docker CLI + daemon are usable (`docker info`). */
export function dockerAvailable(): boolean {
  try {
    const result = spawnSync('docker', ['info'], {
      encoding: 'utf8',
      timeout: 20_000,
      windowsHide: true,
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Run identity + naming
// ---------------------------------------------------------------------------

const RUN_ID_KEY = '__agentartsIntegrationRunId';

function integrationGlobals(): Record<string, unknown> {
  return globalThis as unknown as Record<string, unknown>;
}

/**
 * A short, run-scoped id baked into every resource name (grep target).
 *
 * Stored on `globalThis` so every test file in the same vitest process reuses
 * one id (the Python suite shares it through a session-scoped fixture).
 */
export function runId(): string {
  const globals = integrationGlobals();
  const existing = globals[RUN_ID_KEY];
  if (typeof existing === 'string') {
    return existing;
  }
  const id = (envValue(ENV_RUN_ID) ?? randomUUID().replace(/-/g, '')).slice(0, 8);
  globals[RUN_ID_KEY] = id;
  return id;
}

/**
 * Build a run-scoped resource name.
 *
 * `kind` should be short and lowercase (e.g. `"wi"`, `"space"`, `"ci"`). The
 * result is guaranteed to satisfy the strictest naming rule in the SDK
 * (code-interpreter: `[a-z][a-z0-9-]{0,38}[a-z0-9]`).
 */
export function uniqueName(kind: string, run = runId(), maxLen = 40): string {
  let raw = `${RESOURCE_PREFIX}-${run}-${kind}`;
  if (raw.length > maxLen) {
    raw = raw.slice(0, maxLen);
  }
  return raw.replace(/-+$/, '');
}

/** `uniqueName` bound to the current run id. */
export function resourceName(kind: string): string {
  return uniqueName(kind, runId());
}

// ---------------------------------------------------------------------------
// Async utilities
// ---------------------------------------------------------------------------

/** Sleep for `ms` milliseconds. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}

export interface WaitForOptions {
  /** Maximum time to wait (milliseconds, default 60000). */
  timeoutMs?: number;
  /** Poll interval (milliseconds, default 2000). */
  intervalMs?: number;
  /** Description used in the timeout message. */
  desc?: string;
}

/**
 * Poll `predicate` until it returns truthy or `timeoutMs` elapses.
 *
 * Returns the last truthy result; throws when it never becomes truthy.
 */
export async function waitFor<T>(
  predicate: () => T | Promise<T>,
  options: WaitForOptions = {},
): Promise<T> {
  const { timeoutMs = 60_000, intervalMs = 2_000, desc = 'condition' } = options;
  const deadline = Date.now() + timeoutMs;
  let last: T | undefined;
  while (Date.now() < deadline) {
    try {
      last = await predicate();
    } catch {
      last = undefined;
    }
    if (last) {
      // Python truthiness: an empty list is falsy, so wait for real values.
      if (!Array.isArray(last) || last.length > 0) {
        return last;
      }
    }
    await sleep(intervalMs);
  }
  throw new Error(`Timed out after ${(timeoutMs / 1000).toFixed(0)}s waiting for ${desc}`);
}

/**
 * Run a cleanup callable, swallowing + logging errors.
 *
 * Cleanup must never crash the suite — a leaked resource is preferable to a
 * masked test failure. Leaked resources are greppable via {@link RESOURCE_PREFIX}.
 */
export async function safeDelete(
  deleter: () => unknown | Promise<unknown>,
  desc: string,
): Promise<void> {
  try {
    await deleter();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(
      `cleanup FAILED for ${desc}: ${String(error)} — resource may leak (grep '${RESOURCE_PREFIX}')`,
    );
  }
}

// ---------------------------------------------------------------------------
// Resource cleanup registry (conftest.py `resource_registry` fixture)
// ---------------------------------------------------------------------------

export interface RegistryEntry {
  deleter: () => unknown | Promise<unknown>;
  desc: string;
}

/**
 * LIFO registry of cleanup callables, drained at the end of the test file.
 *
 * Python scopes this to the whole pytest session; vitest isolates module state
 * per test file, so each file owns one registry and drains it in `afterAll`.
 */
export class ResourceRegistry {
  private readonly items: RegistryEntry[] = [];

  /** Register a deleter that runs (in reverse order) at teardown. */
  register(deleter: () => unknown | Promise<unknown>, desc: string): void {
    this.items.push({ deleter, desc });
  }

  /** Number of registered deleters (useful for diagnostics). */
  get size(): number {
    return this.items.length;
  }

  /** Run every registered deleter in reverse order, swallowing errors. */
  async cleanupAll(): Promise<void> {
    for (const entry of [...this.items].reverse()) {
      await safeDelete(entry.deleter, entry.desc);
    }
    this.items.length = 0;
  }
}

/** The cleanup registry lazily created for the current test file. */
let resourceRegistryInstance: ResourceRegistry | null = null;

/** Get (creating on first use) the cleanup registry of the current test file. */
export function getResourceRegistry(): ResourceRegistry {
  resourceRegistryInstance ??= new ResourceRegistry();
  return resourceRegistryInstance;
}

/**
 * The cleanup registry for the current test file.
 *
 * Lazily instantiates the underlying {@link ResourceRegistry}; tests only need
 * `resourceRegistry.register(deleteFn, desc)` and `resourceRegistry.cleanupAll()`.
 */
export const resourceRegistry = {
  register(deleter: () => unknown | Promise<unknown>, desc: string): void {
    getResourceRegistry().register(deleter, desc);
  },
  cleanupAll(): Promise<void> {
    return getResourceRegistry().cleanupAll();
  },
  get size(): number {
    return getResourceRegistry().size;
  },
};

// ---------------------------------------------------------------------------
// Shared clients (conftest.py session-scoped client fixtures)
// ---------------------------------------------------------------------------

let identityClientInstance: IdentityClient | null = null;
let runtimeClientInstance: RuntimeClient | null = null;
let gatewayClientInstance: GatewayClient | null = null;
let memoryControlClientInstance: MemoryClient | null = null;

/** Shared `IdentityClient` (one instance per test file). */
export function getIdentityClient(): IdentityClient {
  identityClientInstance ??= new IdentityClient(cloudRegion());
  return identityClientInstance;
}

/** Shared `RuntimeClient` — control-plane endpoint + AK/SK from the env. */
export function getRuntimeClient(): RuntimeClient {
  runtimeClientInstance ??= new RuntimeClient();
  return runtimeClientInstance;
}

/** Shared `GatewayClient`. */
export function getGatewayClient(): GatewayClient {
  gatewayClientInstance ??= new GatewayClient();
  return gatewayClientInstance;
}

/** Shared `MemoryClient` for control-plane ops (create/delete space). */
export function getMemoryControlClient(): MemoryClient {
  memoryControlClientInstance ??= new MemoryClient();
  return memoryControlClientInstance;
}

// ---------------------------------------------------------------------------
// Identity cleanup (the high-level client has no delete wrappers)
// ---------------------------------------------------------------------------

export type CredentialProviderKind = 'api_key' | 'oauth2' | 'sts';

export interface IdentityCleanup {
  /** Delete a workload identity through the raw `AgentIdentityClient`. */
  workloadIdentity(name: string): Promise<void>;
  /** Delete a credential provider of `kind` through the raw client. */
  credentialProvider(kind: CredentialProviderKind, name: string): Promise<void>;
}

/**
 * Bound deleters for workload identities & credential providers.
 *
 * The high-level `IdentityClient` exposes no `delete_*` methods, so we reach
 * the generated `AgentIdentityClient` through its private accessor
 * (`_ensureClient`, lazy — same intent as Python's `identity_client.client`).
 */
export function identityCleanup(client: IdentityClient = getIdentityClient()): IdentityCleanup {
  const raw = async (): Promise<AgentIdentityClient> =>
    (await (client as unknown as { _ensureClient(): Promise<AgentIdentityClient> })._ensureClient());

  return {
    async workloadIdentity(name: string): Promise<void> {
      const agentIdentity = await raw();
      await agentIdentity.deleteWorkloadIdentity(
        new DeleteWorkloadIdentityRequest({ workloadIdentityName: name }),
      );
    },
    async credentialProvider(kind: CredentialProviderKind, name: string): Promise<void> {
      const agentIdentity = await raw();
      if (kind === 'api_key') {
        await agentIdentity.deleteApiKeyCredentialProvider(
          new DeleteApiKeyCredentialProviderRequest({ credentialProviderName: name }),
        );
        return;
      }
      if (kind === 'oauth2') {
        await agentIdentity.deleteOauth2CredentialProvider(
          new DeleteOauth2CredentialProviderRequest({ credentialProviderName: name }),
        );
        return;
      }
      await agentIdentity.deleteStsCredentialProvider(
        new DeleteStsCredentialProviderRequest({ credentialProviderName: name }),
      );
    },
  };
}

// ---------------------------------------------------------------------------
// Shared Memory Space (conftest.py `memory_space` fixture)
// ---------------------------------------------------------------------------

export interface CreateMemorySpaceOptions {
  /** Name suffix kind (default `"space"`). */
  kind?: string;
  /** Control-plane client used to create (and later delete) the Space. */
  client?: MemoryClient;
}

/**
 * Create a Memory Space that mints its own data-plane API key, and register its
 * deletion with the resource registry.
 *
 * `deleteSpace` cascades to all sessions/messages/memories, so downstream data
 * clients need no pre-existing memory API key.
 */
export async function createMemorySpace(
  options: CreateMemorySpaceOptions = {},
): Promise<SpaceInfo> {
  const client = options.client ?? getMemoryControlClient();
  const name = uniqueName(options.kind ?? 'space', runId());
  const space = await client.createSpace(name, {
    messageTtlHours: 168,
    // Configure extraction triggers: extract after 10s idle, cap at
    // 4096 tokens / 100 messages so memories appear within the test window.
    memoryStrategiesBuiltin: ['semantic'],
    memoryExtractIdleSeconds: 10,
    memoryExtractMaxTokens: 4096,
    memoryExtractMaxMessages: 100,
  });
  resourceRegistry.register(() => client.deleteSpace(space.id), `space:${name}`);
  return space;
}

// ---------------------------------------------------------------------------
// Ports / temp dirs / CLI
// ---------------------------------------------------------------------------

/** Find a free TCP port on 127.0.0.1. */
export function findFreePort(): Promise<number> {
  return new Promise((resolvePromise, rejectPromise) => {
    const server = createServer();
    server.unref();
    server.once('error', rejectPromise);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as AddressInfo | null;
      const port = address ? address.port : 0;
      server.close(() => {
        resolvePromise(port);
      });
    });
  });
}

/** Create a temporary directory (caller is responsible for {@link removeTempDir}). */
export async function makeTempDir(prefix = `${RESOURCE_PREFIX}-`): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

/** Create a temporary directory inside an existing directory. */
export async function makeTempDirIn(parent: string, prefix = `${RESOURCE_PREFIX}-`): Promise<string> {
  await mkdir(parent, { recursive: true });
  return mkdtemp(join(parent, prefix));
}

/** Remove a temporary directory (best effort). */
export async function removeTempDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

/** True when the built CLI (`dist/cli.js`) exists. */
export function isCliBuilt(): boolean {
  return existsSync(CLI_DIST_PATH);
}

const CLI_WARN_KEY = '__agentartsIntegrationCliWarned';

/**
 * True when the built CLI exists; warns once per process when it does not.
 *
 * CLI cases use this to skip with a hint instead of failing when `dist/` has
 * not been built (`pnpm build` writes `packages/agentarts-sdk/dist/cli.js`).
 */
export function isCliReady(): boolean {
  if (isCliBuilt()) {
    return true;
  }
  const globals = integrationGlobals();
  if (!globals[CLI_WARN_KEY]) {
    globals[CLI_WARN_KEY] = true;
    // eslint-disable-next-line no-console
    console.warn(
      `[integration] CLI entry not found: ${CLI_DIST_PATH} — CLI tests will skip. ` +
        'Run `pnpm build` first to exercise them.',
    );
  }
  return false;
}

export interface CliRunResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

export interface RunCliOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
}

/**
 * A spawned CLI process with its output going to files.
 *
 * Piped stdio is intentionally avoided: under the DSH Windows sandbox a child
 * process created with `stdio: 'pipe'` fails with `EPERM`, while file-backed
 * stdio works everywhere (and keeps the CLI's stdout parseable afterwards).
 */
export interface CliProcess {
  child: ChildProcess;
  stdoutPath: string;
  stderrPath: string;
  readStdout(): string;
  readStderr(): string;
  /** Remove the log files (best effort). */
  dispose(): Promise<void>;
}

function cliLogPaths(): { stdoutPath: string; stderrPath: string } {
  const base = join(tmpdir(), `aa-it-cli-${randomUUID()}`);
  return { stdoutPath: `${base}.out`, stderrPath: `${base}.err` };
}

function readIfExists(path: string): string {
  try {
    return existsSync(path) ? readFileSync(path, 'utf8') : '';
  } catch {
    return '';
  }
}

/** Run the built CLI synchronously and capture its output (file-backed stdio). */
export function runCli(args: string[], options: RunCliOptions = {}): CliRunResult {
  const { stdoutPath, stderrPath } = cliLogPaths();
  const stdoutFd = openSync(stdoutPath, 'w');
  const stderrFd = openSync(stderrPath, 'w');
  try {
    const result = spawnSync(process.execPath, [CLI_DIST_PATH, ...args], {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ['ignore', stdoutFd, stderrFd],
      timeout: options.timeoutMs ?? 120_000,
      windowsHide: true,
    });
    return {
      status: result.status,
      stdout: readIfExists(stdoutPath),
      stderr: readIfExists(stderrPath),
    };
  } finally {
    closeSync(stdoutFd);
    closeSync(stderrFd);
    unlinkSync(stdoutPath);
    unlinkSync(stderrPath);
  }
}

/** Spawn the built CLI (for blocking commands such as `dev`), logging to files. */
export function spawnCli(args: string[], options: RunCliOptions = {}): CliProcess {
  const { stdoutPath, stderrPath } = cliLogPaths();
  const stdoutFd = openSync(stdoutPath, 'w');
  const stderrFd = openSync(stderrPath, 'w');
  const child = spawn(process.execPath, [CLI_DIST_PATH, ...args], {
    cwd: options.cwd,
    env: options.env ?? process.env,
    stdio: ['ignore', stdoutFd, stderrFd],
    windowsHide: true,
  });
  // The child holds its own handles; the parent can close its copies now.
  closeSync(stdoutFd);
  closeSync(stderrFd);

  return {
    child,
    stdoutPath,
    stderrPath,
    readStdout: () => readIfExists(stdoutPath),
    readStderr: () => readIfExists(stderrPath),
    async dispose(): Promise<void> {
      await rm(stdoutPath, { force: true });
      await rm(stderrPath, { force: true });
    },
  };
}

/**
 * Build a subprocess environment whose HOME points at `home`.
 *
 * The CLI's completion bootstrap touches `~/.agentarts`; pointing HOME (and
 * USERPROFILE, which Node uses on Windows) at a temp dir keeps the real
 * profile untouched and stdout free of tip text.
 */
export function cliEnv(home: string, base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return { ...base, HOME: home, USERPROFILE: home };
}

export interface CliHome {
  /** Environment for CLI subprocesses (HOME redirected, completion pre-shown). */
  env: NodeJS.ProcessEnv;
  /** Absolute path of the fake home directory. */
  path: string;
  /** Remove the temp home (best effort). */
  dispose(): Promise<void>;
}

/**
 * Create a throwaway HOME for CLI subprocesses.
 *
 * Pre-creates `~/.agentarts/.completion_shown` so `_auto_install_completion` is a
 * no-op and no tip text pollutes stdout (important for `--output json` parsing).
 */
export async function createCliHome(): Promise<CliHome> {
  const root = await makeTempDir('aa-it-cli-home-');
  const home = join(root, 'home');
  await mkdir(join(home, '.agentarts'), { recursive: true });
  await writeFile(join(home, '.agentarts', '.completion_shown'), '');
  return {
    env: cliEnv(home),
    path: home,
    dispose: () => removeTempDir(root),
  };
}
