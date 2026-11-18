/**
 * Invoke operation implementation.
 *
 * Ported from `agentarts/toolkit/operations/runtime/invoke.py`. The module also
 * hosts the helpers shared by the other data-plane operations
 * (`start-session`, `stop-session`, `invoke`, `exec-command`, `upload-files`,
 * `download-files`), because they all need to resolve the agent, its auth type
 * and its data-plane endpoint from `.agentarts_config.yaml` first.
 */

import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';

import { SignMode } from '../../../sdk/service/http-client.js';
import { LocalRuntimeClient, RuntimeClient } from '../../../sdk/service/runtime-client.js';
import type { RuntimeResponse } from '../../../sdk/service/runtime-client.js';
import { isStreamingResponse } from '../../../sdk/service/runtime-client.js';
import {
  getControlPlaneEndpoint,
  getRegion,
  getRuntimeDataPlaneEndpoint,
} from '../../../sdk/utils/constant.js';
import { getLogger } from '../../../sdk/utils/logging.js';
import { console, echoError, echoInfo } from '../../utils/common.js';
import { getConfigFilePath, loadConfig } from './config.js';
import { ValidationError } from './errors.js';

export { console };

const logger = getLogger('toolkit.operations.runtime.invoke');

/**
 * Prefix an endpoint with `https://` when no scheme is present.
 *
 * Counterpart of the private `_ensure_https()` helper of
 * `agentarts/sdk/utils/constant.py` (the TypeScript constant module keeps its
 * own copy private).
 */
export function _ensureHttps(endpoint: string | null): string | null {
  if (!endpoint) {
    return endpoint;
  }
  if (!endpoint.startsWith('http://') && !endpoint.startsWith('https://')) {
    return `https://${endpoint}`;
  }
  return endpoint;
}

/**
 * Validate and normalize a custom URL path.
 *
 * Rules:
 * - must not be an empty string;
 * - leading/trailing slashes are stripped;
 * - only alphanumeric characters, hyphens, underscores, dots and slashes;
 * - `..` path traversal sequences are rejected.
 *
 * @throws {ValidationError} When the path contains invalid characters or `..`.
 */
export function _validateAndNormalizeCustomPath(customPath: string | null | undefined): string | null {
  if (!customPath) {
    return null;
  }

  let path = String(customPath).trim();

  if (!path) {
    return null;
  }

  if (path.startsWith('/')) {
    path = path.slice(1);
  }
  if (path.endsWith('/')) {
    path = path.slice(0, -1);
  }

  if (!path) {
    return null;
  }

  const validPattern = /^[a-zA-Z0-9_\-./]+$/;
  if (!validPattern.test(path)) {
    throw new ValidationError(
      `Invalid custom path '${path}'. Only alphanumeric characters, hyphens, underscores, dots, and slashes are allowed.`,
    );
  }

  if (path.includes('..')) {
    throw new ValidationError(
      `Invalid custom path '${path}'. Path traversal sequences ('..') are not allowed.`,
    );
  }

  return path;
}

/**
 * Resolve agent name, region, agent id and auth type from the configuration.
 *
 * `auth_type` defaults to `"IAM"` when it cannot be resolved from the config
 * (no config file, or the agent has no `identity_configuration`), so data-plane
 * commands sign with V11-HMAC-SHA256 instead of sending an unsigned request.
 *
 * @returns Tuple of `[agentName, region, agentId, authType]`.
 */
export function _resolveAgentInfo(
  agentName: string | null | undefined,
  region: string | null | undefined,
): [string | null, string | null, string | null, string | null] {
  let resolvedName: string | null = agentName ?? null;
  let resolvedRegion: string | null = region ?? null;
  let agentId: string | null = null;
  let authType: string | null = null;

  const configPath = getConfigFilePath();
  let config = null;
  if (existsSync(configPath)) {
    config = loadConfig();
  }

  if (resolvedName === null) {
    if (config) {
      const defaultAgent = config.defaultAgent;
      if (defaultAgent && Object.prototype.hasOwnProperty.call(config.agents, defaultAgent)) {
        resolvedName = defaultAgent;
        const agentConfig = config.agents[resolvedName];
        resolvedRegion = resolvedRegion || agentConfig.base.region;
        agentId = agentConfig.runtime.agentId;
        if (agentConfig.runtime.identityConfiguration) {
          authType = agentConfig.runtime.identityConfiguration.authorizerType ?? null;
        }
      } else {
        const firstAgentKey = config.listAgents()[0] ?? null;
        if (firstAgentKey) {
          resolvedName = firstAgentKey;
          const agentConfig = config.agents[firstAgentKey];
          resolvedRegion = resolvedRegion || agentConfig.base.region;
          agentId = agentConfig.runtime.agentId;
          if (agentConfig.runtime.identityConfiguration) {
            authType = agentConfig.runtime.identityConfiguration.authorizerType ?? null;
          }
        }
      }
    }
  } else if (config) {
    if (Object.prototype.hasOwnProperty.call(config.agents, resolvedName)) {
      const agentConfig = config.agents[resolvedName];
      resolvedRegion = resolvedRegion || agentConfig.base.region;
      agentId = agentConfig.runtime.agentId;
      if (agentConfig.runtime.identityConfiguration) {
        authType = agentConfig.runtime.identityConfiguration.authorizerType ?? null;
      }
    } else {
      logger.info(`Agent '${resolvedName}' not found in config, using default IAM authentication`);
      authType = 'IAM';
    }
  }

  // Data-plane commands (start/stop session, invoke, exec-command,
  // upload/download files) sign exclusively with V11-HMAC-SHA256; defaulting to
  // "IAM" keeps them signed when the config does not say otherwise.
  return [resolvedName, resolvedRegion, agentId, authType || 'IAM'];
}

/**
 * Check whether file transfer is enabled for the agent.
 *
 * @throws {ValidationError} When the agent is missing or file transfer is
 *   disabled.
 */
export async function _checkFileTransferEnabled(
  agentName: string,
  region: string,
  agentId?: string | null,
  verifySsl: boolean | string = true,
): Promise<void> {
  const controlEndpoint = getControlPlaneEndpoint(region);
  const controlClient = new RuntimeClient({ controlEndpoint, verifySsl });

  let agentDetail: Record<string, any> | null = null;
  let agentIdResolved = agentId ?? null;
  if (agentIdResolved) {
    agentDetail = await controlClient.findAgentById(agentIdResolved);
  } else {
    const agentInfo = await controlClient.findAgentByName(agentName);
    if (agentInfo) {
      agentIdResolved = agentInfo['id'] ?? null;
      if (agentIdResolved) {
        agentDetail = await controlClient.findAgentById(agentIdResolved);
      }
    }
  }

  if (!agentDetail) {
    throw new ValidationError(`Agent '${agentName}' not found`);
  }

  const versionDetail = agentDetail['version_detail'] || {};
  const invokeConfigResponse = versionDetail['invoke_config'] || {};
  const fileTransferConfig = invokeConfigResponse['file_transfer_config'] || {};

  if (!fileTransferConfig['enabled']) {
    throw new ValidationError(
      `File transfer is not enabled for agent '${agentName}'. ` +
        'To enable file transfer, please:\n' +
        '  1. Set file_transfer_config.enabled=true in .agentarts_config.yaml\n' +
        "  2. Create a new agent with 'agentarts deploy'",
    );
  }
}

/**
 * Get the data-plane endpoint for the agent.
 *
 * First checks `AGENTARTS_RUNTIME_DATA_ENDPOINT`; when unset, reads the
 * `access_endpoint` from the agent's `invoke_config` on the control plane.
 *
 * @returns The data-plane endpoint URL, or `null` when unavailable.
 */
export async function _getDataEndpoint(
  agentName: string,
  region: string,
  agentId?: string | null,
  verifySsl: boolean | string = true,
): Promise<string | null> {
  let dataEndpoint: string | null = getRuntimeDataPlaneEndpoint() || null;

  if (!dataEndpoint) {
    const controlEndpoint = getControlPlaneEndpoint(region);
    const controlClient = new RuntimeClient({ controlEndpoint, verifySsl });

    if (agentId) {
      const agentDetail = await controlClient.findAgentById(agentId);
      if (agentDetail) {
        const versionDetail = agentDetail['version_detail'] || {};
        const invokeConfigResponse = versionDetail['invoke_config'] || {};
        const accessEndpoint = invokeConfigResponse['access_endpoint'];
        if (accessEndpoint) {
          dataEndpoint = accessEndpoint;
        }
      }
    } else {
      const agentInfo = await controlClient.findAgentByName(agentName);
      if (agentInfo) {
        const resolvedId = agentInfo['id'];
        if (resolvedId) {
          const agentDetail = await controlClient.findAgentById(resolvedId);
          if (agentDetail) {
            const versionDetail = agentDetail['version_detail'] || {};
            const invokeConfigResponse = versionDetail['invoke_config'] || {};
            const accessEndpoint = invokeConfigResponse['access_endpoint'];
            if (accessEndpoint) {
              dataEndpoint = accessEndpoint;
            }
          }
        }
      }
    }
  }

  if (dataEndpoint) {
    dataEndpoint = _ensureHttps(dataEndpoint);
  }

  return dataEndpoint;
}

/** Invoke mode. */
export enum InvokeMode {
  LOCAL = 'local',
  CLOUD = 'cloud',
}

/**
 * Normalize a JSON payload to handle Windows PowerShell quote stripping.
 *
 * On Windows PowerShell, double quotes inside single-quoted strings may be
 * stripped when passed to a subprocess, turning `{"message":"hello"}` into
 * `{message:hello}`. This restores proper JSON when possible.
 */
export function _normalizeJsonPayload(payload: string): string {
  if (!payload) {
    return payload;
  }

  let value = payload.trim();

  try {
    JSON.parse(value);
    return value;
  } catch {
    // fall through
  }

  if (value.startsWith("'") && value.endsWith("'")) {
    value = value.slice(1, -1);
  }

  if (value.includes('\\"')) {
    value = value.split('\\"').join('"');
    try {
      JSON.parse(value);
      return value;
    } catch {
      // fall through
    }
  }

  if (value.startsWith('{') && value.endsWith('}')) {
    const inner = value.slice(1, -1).trim();
    if (!inner) {
      return '{}';
    }

    const resultParts: string[] = [];
    for (const rawPart of inner.split(',')) {
      const part = rawPart.trim();
      if (part.includes(':')) {
        const separator = part.indexOf(':');
        let key = part.slice(0, separator).trim();
        let val = part.slice(separator + 1).trim();

        if (!key.startsWith('"') && !key.startsWith("'")) {
          key = `"${key}"`;
        }

        if (val) {
          const isPlainLiteral =
            !val.startsWith('"') &&
            !val.startsWith("'") &&
            !val.startsWith('[') &&
            !val.startsWith('{') &&
            !/^\d+$/.test(val) &&
            !['true', 'false', 'null'].includes(val.toLowerCase());
          if (isPlainLiteral) {
            val = `"${val}"`;
          }
        }

        resultParts.push(`${key}:${val}`);
      } else {
        resultParts.push(part);
      }
    }

    const reconstructed = `{${resultParts.join(',')}}`;
    try {
      JSON.parse(reconstructed);
      return reconstructed;
    } catch {
      // fall through
    }
  }

  return value;
}

/** Options for {@link invokeAgent} (Python keyword arguments). */
export interface InvokeAgentOptions {
  /** Agent name (cloud mode; uses the default agent when omitted). */
  agentName?: string | null;
  /** Invoke mode. */
  mode?: InvokeMode;
  /** Huawei Cloud region (cloud mode). */
  region?: string | null;
  /** Local port (local mode). */
  port?: number | null;
  /** Optional endpoint name. */
  endpoint?: string | null;
  /** Session ID for stateful agents. */
  sessionId?: string | null;
  /** Optional bearer token. */
  bearerToken?: string | null;
  /** Request timeout in seconds. */
  timeout?: number;
  /** Skip SSL certificate verification. */
  skipSslVerification?: boolean;
  /** User ID for OAuth2 outbound credentials. */
  userId?: string | null;
  /** Custom path appended to `/invocations`. */
  customPath?: string | null;
}

/**
 * Invoke an agent locally or on the cloud.
 *
 * Accepts either `invokeAgent(payload, options)` or a single
 * `invokeAgent({ payload, ...options })` object.
 *
 * @returns `true` when the invocation succeeded.
 */
export function invokeAgent(payload: string, options?: InvokeAgentOptions): Promise<boolean>;
export function invokeAgent(options: InvokeAgentOptions & { payload: string }): Promise<boolean>;
export async function invokeAgent(
  payloadOrOptions: string | (InvokeAgentOptions & { payload: string }),
  options: InvokeAgentOptions = {},
): Promise<boolean> {
  const opts: InvokeAgentOptions =
    typeof payloadOrOptions === 'string' ? options : payloadOrOptions;
  const payload = typeof payloadOrOptions === 'string' ? payloadOrOptions : payloadOrOptions.payload;

  const mode = opts.mode ?? InvokeMode.CLOUD;
  const port = opts.port ?? null;
  const endpoint = opts.endpoint ?? null;
  const sessionId = opts.sessionId ?? null;
  const bearerToken = opts.bearerToken ?? null;
  const timeout = opts.timeout ?? 900;
  const skipSslVerification = opts.skipSslVerification ?? false;
  const userId = opts.userId ?? null;
  const customPath = opts.customPath ?? null;
  let agentName = opts.agentName ?? null;
  let region = opts.region ?? null;

  const normalizedCustomPath = _validateAndNormalizeCustomPath(customPath);
  const normalizedPayload = _normalizeJsonPayload(payload);
  try {
    JSON.parse(normalizedPayload);
  } catch {
    echoError('Payload must be valid JSON');
    console.print();
    console.print('[yellow]Usage Tips:[/yellow]');
    console.print('  1. Use [cyan]single quotes[/cyan] to wrap JSON payload');
    console.print('  2. Use [cyan]compact JSON format[/cyan] (no spaces after colon/comma)');
    console.print();
    console.print('[green]✓ Correct Examples:[/green]');
    console.print('  [white]agentarts invoke \'{"message":"hello world"}\'[white]');
    console.print('  [white]agentarts invoke \'{"name":"test","message":"hello world"}\'[white]');
    console.print();
    console.print('[red]✗ Common Mistakes:[/red]');
    console.print('  [dim]Spaces after colon/comma will cause parsing issues in PowerShell:[/dim]');
    console.print('  [dim]agentarts invoke \'{"message": "hello world"}\'[/dim]');
    console.print();
    console.print('[yellow]Alternative for complex JSON:[/yellow]');
    console.print('  Use [cyan]--%[/cyan] stop-parsing symbol in PowerShell:');
    console.print('  [white]agentarts --% invoke \'{"message": "hello world"}\'[white]');
    return false;
  }

  const actualBearerToken = bearerToken || process.env['BEARER_TOKEN'] || null;

  try {
    let result: RuntimeResponse;

    if (mode === InvokeMode.LOCAL) {
      const localPort = port || 8080;
      const client = new LocalRuntimeClient(localPort);

      console.print();
      echoInfo(
        'Invoke Request',
        `[cyan]Mode:[/cyan] [yellow]Local[/yellow]\n[cyan]Endpoint:[/cyan] [white]localhost:${localPort}[/white]`,
      );

      result = await client.invokeAgent(normalizedPayload, {
        sessionId,
        bearerToken: actualBearerToken,
        endpoint,
        timeout,
        userId,
        customPath: normalizedCustomPath,
      });
    } else {
      const [resolvedName, resolvedRegion, agentId, authType] = _resolveAgentInfo(agentName, region);
      agentName = resolvedName;
      region = resolvedRegion;

      if (agentName === null) {
        echoError('No agent specified and no default agent configured');
        console.print('[dim]Specify --agent or set a default agent in config[/dim]');
        return false;
      }

      const actualRegion = region || getRegion();
      const actualSessionId = sessionId || randomUUID();
      const verifySsl = !skipSslVerification;

      const dataEndpoint = await _getDataEndpoint(agentName, actualRegion, agentId, verifySsl);

      if (!dataEndpoint) {
        echoError(
          `No data plane endpoint configured and could not get access_endpoint from agent [yellow]${agentName} ${actualRegion}[/yellow]`,
        );
        console.print(
          '[dim]Set AGENTARTS_RUNTIME_DATA_ENDPOINT environment variable or ensure agent is deployed[/dim]',
        );
        return false;
      }

      let signMode = SignMode.SDK_HMAC_SHA256;
      if (authType && authType.toUpperCase() === 'IAM') {
        signMode = SignMode.V11_HMAC_SHA256;
      } else if (!actualBearerToken) {
        echoError('Bearer token is required for non-IAM authentication');
        console.print(
          '[dim]Specify --bearer-token or set BEARER_TOKEN environment variable[/dim]',
        );
        return false;
      }

      echoInfo(
        'Invoke Request',
        `[cyan]Mode:[/cyan] [yellow]Cloud[/yellow]\n[cyan]Agent:[/cyan] [white]${agentName}[/white]\n[cyan]Session:[/cyan] [dim]${actualSessionId}[/dim]\n[cyan]Endpoint:[/cyan] [dim]${dataEndpoint}[/dim]\n[cyan]Auth Type:[/cyan] [dim]${authType || 'None'}[/dim]`,
      );

      const client = new RuntimeClient({
        dataEndpoint,
        verifySsl,
        signMode,
        regionId: actualRegion,
      });

      result = await client.invokeAgent(agentName, actualSessionId, normalizedPayload, {
        bearerToken: actualBearerToken,
        endpoint,
        timeout,
        userId,
        customPath: normalizedCustomPath,
      });
    }

    if (!isStreamingResponse(result)) {
      const responseDict = result as Record<string, any>;
      if ('error' in responseDict) {
        echoError(String(responseDict['error']));
        return false;
      }

      console.print();
      console.print('[bold green]Response:[/bold green]');
      // rich's `print_json` does not interpret markup, so neither do we.
      console.printPlain(JSON.stringify(responseDict, null, 2));
      return true;
    }

    console.print();
    console.print('[bold green]Streaming Response:[/bold green]');
    for await (const event of result) {
      console.print(`[dim]${event}[/dim]`);
    }
    return true;
  } catch (error) {
    echoError(error instanceof Error ? error.message : String(error));
    return false;
  }
}
