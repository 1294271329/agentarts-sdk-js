/**
 * Runtime stop-session operation.
 *
 * Ported from `agentarts/toolkit/operations/runtime/stop_session.py`.
 */

import { SignMode } from '../../../sdk/service/http-client.js';
import { RuntimeClient } from '../../../sdk/service/runtime-client.js';
import { echoError } from '../../utils/common.js';
import { ValidationError } from './errors.js';
import { _getDataEndpoint, _resolveAgentInfo } from './invoke.js';

/** Loose dictionary matching `dict[str, Any]` (JSON object). */
type Dict = Record<string, any>;

/** Options for {@link stopRuntimeSession} (Python keyword arguments). */
export interface StopRuntimeSessionOptions {
  /** Agent name. */
  agentName?: string | null;
  /** Session ID. */
  sessionId?: string | null;
  /** Optional bearer token for authentication. */
  bearerToken?: string | null;
  /** Region name. */
  region?: string | null;
  /** Optional endpoint name. */
  endpoint?: string | null;
  /** Skip SSL certificate verification. */
  skipSslVerification?: boolean;
  /** User ID for OAuth2 outbound credentials. */
  userId?: string | null;
}

/**
 * Stop a runtime session.
 *
 * @returns The stop result.
 * @throws {Error} When the session ID or agent cannot be resolved.
 */
export async function stopRuntimeSession(
  options: StopRuntimeSessionOptions = {},
): Promise<Dict> {
  const [agentName, region, agentId, authType] = _resolveAgentInfo(
    options.agentName ?? null,
    options.region ?? null,
  );

  if (agentName === null) {
    echoError('No agent specified and no default agent configured');
    throw new ValidationError('Agent name is required');
  }

  const sessionId = options.sessionId ?? null;
  if (sessionId === null) {
    throw new ValidationError('Session ID is required');
  }

  const verifySsl = !(options.skipSslVerification ?? false);
  const dataEndpoint = await _getDataEndpoint(agentName, region || '', agentId, verifySsl);

  if (!dataEndpoint) {
    throw new ValidationError(`No data endpoint for agent ${agentName}`);
  }

  let signMode = SignMode.SDK_HMAC_SHA256;
  if (authType && authType.toUpperCase() === 'IAM') {
    signMode = SignMode.V11_HMAC_SHA256;
  }

  const client = new RuntimeClient({
    dataEndpoint,
    regionId: region || '',
    verifySsl,
    signMode,
  });
  const bearerToken = options.bearerToken ?? null;
  if (bearerToken) {
    client.setAuthToken(bearerToken);
  }

  return client.stopSession(agentName, sessionId, {
    bearerToken,
    endpoint: options.endpoint ?? null,
    userId: options.userId ?? null,
  });
}
