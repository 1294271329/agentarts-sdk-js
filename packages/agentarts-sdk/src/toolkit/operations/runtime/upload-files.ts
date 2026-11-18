/**
 * Runtime upload-files operation.
 *
 * Ported from `agentarts/toolkit/operations/runtime/upload_files.py`.
 */

import { SignMode } from '../../../sdk/service/http-client.js';
import { RuntimeClient } from '../../../sdk/service/runtime-client.js';
import type { UploadFileSpec } from '../../../sdk/service/runtime-client.js';
import { echoError } from '../../utils/common.js';
import { ValidationError } from './errors.js';
import { _checkFileTransferEnabled, _getDataEndpoint, _resolveAgentInfo } from './invoke.js';

/** Loose dictionary matching `dict[str, Any]` (JSON object). */
type Dict = Record<string, any>;

/** Default file owner user ID. */
export const DEFAULT_FILE_USER_ID = 1000;

/** Default file owner group ID. */
export const DEFAULT_FILE_GROUP_ID = 1000;

/** Default file permissions (octal string). */
export const DEFAULT_FILE_MODE = '0644';

/** Options for {@link uploadRuntimeFiles} (Python keyword arguments). */
export interface UploadRuntimeFilesOptions {
  /** Agent name. */
  agentName?: string | null;
  /** Session ID. */
  sessionId?: string | null;
  /** Files to upload, each with a `localFile` (or inline `content`). */
  files?: UploadFileSpec[] | null;
  /** Remote directory path (must end with `/`; default `/tmp/`). */
  path?: string;
  /** File owner user ID (backend default when omitted). */
  fileUserId?: number | null;
  /** File owner group ID (backend default when omitted). */
  fileGroupId?: number | null;
  /** File permissions in octal (backend default when omitted). */
  fileMode?: string | null;
  /** Optional bearer token. */
  bearerToken?: string | null;
  /** Region name. */
  region?: string | null;
  /** Optional endpoint name. */
  endpoint?: string | null;
  /** Skip SSL certificate verification. */
  skipSslVerification?: boolean;
  /** User ID for OAuth2 outbound credentials. */
  userId?: string | null;
  /** Request timeout in seconds. */
  timeout?: number;
}

/**
 * Upload files to the runtime.
 *
 * @returns The upload result.
 * @throws {Error} When no files/session are given or file transfer is disabled.
 */
export async function uploadRuntimeFiles(
  options: UploadRuntimeFilesOptions = {},
): Promise<Dict> {
  const files = options.files ?? null;
  if (!files || files.length === 0) {
    throw new ValidationError('Files are required');
  }

  const [agentName, region, agentId, authType] = _resolveAgentInfo(
    options.agentName ?? null,
    options.region ?? null,
  );

  if (agentName === null) {
    echoError('No agent specified and no default agent configured');
    throw new ValidationError('Agent name is required');
  }

  const verifySsl = !(options.skipSslVerification ?? false);

  await _checkFileTransferEnabled(agentName, region || '', agentId, verifySsl);

  const sessionId = options.sessionId ?? null;
  if (sessionId === null) {
    throw new ValidationError('Session ID is required');
  }

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

  return client.uploadFiles(agentName, sessionId, files, {
    path: options.path ?? '/tmp/',
    fileUserId: options.fileUserId ?? null,
    fileGroupId: options.fileGroupId ?? null,
    fileMode: options.fileMode ?? null,
    bearerToken,
    endpoint: options.endpoint ?? null,
    userId: options.userId ?? null,
    timeout: options.timeout ?? 900,
  });
}
