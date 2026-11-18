/**
 * Runtime start-session operation.
 *
 * Ported from `agentarts/toolkit/operations/runtime/start_session.py`.
 */

import { SignMode } from '../../../sdk/service/http-client.js';
import { RuntimeClient } from '../../../sdk/service/runtime-client.js';
import { echoError } from '../../utils/common.js';
import { ValidationError } from './errors.js';
import { _getDataEndpoint, _resolveAgentInfo } from './invoke.js';

/** Loose dictionary matching `dict[str, Any]` (JSON object). */
type Dict = Record<string, any>;

/** Options for {@link startRuntimeSession} (Python keyword arguments). */
export interface StartRuntimeSessionOptions {
  /** Agent name. */
  agentName?: string | null;
  /** Region name. */
  region?: string | null;
  /** Optional bearer token for authentication. */
  bearerToken?: string | null;
  /** Optional endpoint name. */
  endpoint?: string | null;
  /** Skip SSL certificate verification. */
  skipSslVerification?: boolean;
  /** User ID for OAuth2 outbound credentials. */
  userId?: string | null;
}

/**
 * Start a runtime session.
 *
 * @returns The start result, containing the session ID.
 * @throws {Error} When no agent can be resolved or no data endpoint is known.
 */
export async function startRuntimeSession(
  options: StartRuntimeSessionOptions = {},
): Promise<Dict> {
  const [agentName, region, agentId, authType] = _resolveAgentInfo(
    options.agentName ?? null,
    options.region ?? null,
  );

  if (agentName === null) {
    echoError('No agent specified and no default agent configured');
    throw new ValidationError('Agent name is required');
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

  return client.startSession(agentName, {
    bearerToken,
    endpoint: options.endpoint ?? null,
    userId: options.userId ?? null,
  });
}
