/**
 * Space operations - CRUD for Memory Space.
 *
 * Ported from `agentarts/toolkit/operations/memory/space.py`. Every function is
 * asynchronous (PORTING.md §4) and returns a result object instead of raising,
 * exactly like the Python implementation.
 */

import { MemoryClient, SpaceInfo } from '../../../sdk/memory/index.js';
import { getLogger } from '../../../sdk/utils/logging.js';

import { SpaceListResult, SpaceResult } from './models.js';

const logger = getLogger('toolkit.operations.memory.space');

/** Options shared by every space operation. */
export interface SpaceOperationOptions {
  /** Region name (optional, defaults to cn-north-4). */
  region?: string | null;
  /** Skip SSL certificate verification (default: false). */
  skipSslVerification?: boolean;
  /** Additional (ignored) parameters, kept for backward compatibility. */
  [key: string]: any;
}

/** Options of {@link createSpace}. */
export interface CreateSpaceOptions extends SpaceOperationOptions {
  /** Message TTL in hours (default: 168, range: 1-8760). */
  messageTtlHours?: number;
  /** Space description (optional). */
  description?: string | null;
  /** Memory extraction idle time in seconds (optional). */
  memoryExtractIdleSeconds?: number | null;
  /** Memory extraction max tokens (optional). */
  memoryExtractMaxTokens?: number | null;
  /** Memory extraction max messages (optional). */
  memoryExtractMaxMessages?: number | null;
  /** Built-in memory strategies (optional list). */
  memoryStrategiesBuiltin?: string[] | null;
  /** Custom memory strategies (optional list of dicts). */
  memoryStrategiesCustomized?: Record<string, any>[] | null;
  /** Tags for the space (optional list of key-value dicts). */
  tags?: Array<Record<string, string>> | null;
  /** Enable public access (default: true). */
  publicAccessEnable?: boolean;
  /** Private VPC ID (requires `privateSubnetId`). */
  privateVpcId?: string | null;
  /** Private subnet ID (requires `privateVpcId`). */
  privateSubnetId?: string | null;
}

/** Options of {@link updateSpace}. */
export interface UpdateSpaceOptions extends SpaceOperationOptions {
  /** New space name (optional). */
  name?: string | null;
  /** New space description (optional). */
  description?: string | null;
  /** New message TTL in hours (optional). */
  messageTtlHours?: number | null;
  /** Enable/disable memory extraction (optional). */
  enableMemoryExtract?: boolean | null;
  /** Memory extraction idle time in seconds (optional). */
  memoryExtractIdleSeconds?: number | null;
  /** Memory extraction max tokens (optional). */
  memoryExtractMaxTokens?: number | null;
  /** Memory extraction max messages (optional). */
  memoryExtractMaxMessages?: number | null;
  /** Built-in memory strategies (optional list). */
  memoryStrategiesBuiltin?: string[] | null;
  /** Tags for the space (optional list of key-value dicts). */
  tags?: Array<Record<string, string>> | null;
}

/** Options of {@link listSpaces}. */
export interface ListSpacesOptions extends SpaceOperationOptions {
  /** Maximum number of spaces to return (default: 20). */
  limit?: number;
  /** Offset for pagination (default: 0). */
  offset?: number;
}

/**
 * Get a `MemoryClient` instance.
 *
 * Uses the Huawei Cloud SDK Core credential provider chain (AK/SK).
 * Credentials can be provided via:
 * - Environment variables: `HUAWEICLOUD_SDK_AK`, `HUAWEICLOUD_SDK_SK`
 * - Configuration file
 * - Metadata service
 *
 * @param region Region name (optional, defaults to cn-north-4).
 * @param verifySsl SSL verification setting (default: true).
 */
export function _getClient(region?: string | null, verifySsl: boolean | string = true): MemoryClient {
  const options: { verifySsl: boolean | string; regionName?: string } = { verifySsl };
  if (region) {
    options.regionName = region;
  }
  return new MemoryClient(options);
}

/** Convert a `SpaceInfo` object to a dictionary for backward compatibility. */
export function _spaceInfoToDict(space: SpaceInfo): Record<string, any> {
  return {
    id: space.id,
    name: space.name,
    description: space.description,
    message_ttl_hours: space.messageTtlHours,
    status: space.status,
    created_at: space.createdAt,
    updated_at: space.updatedAt,
    memory_extract_enabled: space.memoryExtractEnabled,
    memory_extract_idle_seconds: space.memoryExtractIdleSeconds,
    memory_extract_max_tokens: space.memoryExtractMaxTokens,
    memory_extract_max_messages: space.memoryExtractMaxMessages,
    memory_strategies_builtin: space.memoryStrategiesBuiltin,
    memory_strategies_customized: space.memoryStrategiesCustomized,
    api_key: space.apiKey,
    api_key_id: space.apiKeyId,
    public_access: space.publicAccess,
    private_access: space.privateAccess,
  };
}

/**
 * Create a Memory Space.
 *
 * Uses AK/SK authentication via environment variables:
 * `HUAWEICLOUD_SDK_AK` (access key) and `HUAWEICLOUD_SDK_SK` (secret key).
 *
 * @param name Space name, required (1-128 characters).
 * @param options Space configuration.
 * @returns `SpaceResult` with `spaceId` and space details.
 */
export async function createSpace(
  name: string,
  options: CreateSpaceOptions = {},
): Promise<SpaceResult> {
  try {
    const verifySsl = !options.skipSslVerification;
    const client = _getClient(options.region, verifySsl);

    const space = await client.createSpace(name, {
      messageTtlHours: options.messageTtlHours ?? 168,
      description: options.description,
      memoryExtractIdleSeconds: options.memoryExtractIdleSeconds,
      memoryExtractMaxTokens: options.memoryExtractMaxTokens,
      memoryExtractMaxMessages: options.memoryExtractMaxMessages,
      memoryStrategiesBuiltin: options.memoryStrategiesBuiltin,
      memoryStrategiesCustomized: options.memoryStrategiesCustomized,
      tags: options.tags,
      publicAccessEnable: options.publicAccessEnable,
      privateVpcId: options.privateVpcId,
      privateSubnetId: options.privateSubnetId,
    });

    const spaceId = space.id;
    const spaceDict = _spaceInfoToDict(space);

    logger.info(`Space created successfully: ${spaceId}`);
    return new SpaceResult({ success: true, spaceId, space: spaceDict });
  } catch (error) {
    logger.exception(`Failed to create space: ${_errorMessage(error)}`);
    return new SpaceResult({ success: false, error: _errorMessage(error) });
  }
}

/**
 * Get Space details.
 *
 * @param spaceId Space ID.
 * @param options Operation options.
 * @returns `SpaceResult` with space details.
 */
export async function getSpace(spaceId: string, options: SpaceOperationOptions = {}): Promise<SpaceResult> {
  try {
    const verifySsl = !options.skipSslVerification;
    const client = _getClient(options.region, verifySsl);
    const space = await client.getSpace(spaceId);
    const spaceDict = _spaceInfoToDict(space);

    logger.info(`Retrieved space: ${spaceId}`);
    return new SpaceResult({ success: true, spaceId, space: spaceDict });
  } catch (error) {
    logger.exception(`Failed to get space ${spaceId}: ${_errorMessage(error)}`);
    return new SpaceResult({ success: false, spaceId, error: _errorMessage(error) });
  }
}

/**
 * List Spaces.
 *
 * @param options Pagination and operation options.
 * @returns `SpaceListResult` with the list of spaces.
 */
export async function listSpaces(options: ListSpacesOptions = {}): Promise<SpaceListResult> {
  try {
    const limit = options.limit ?? 20;
    const offset = options.offset ?? 0;
    const verifySsl = !options.skipSslVerification;
    const client = _getClient(options.region, verifySsl);
    const result = await client.listSpaces(limit, offset);

    // Convert to a list of dicts to stay backwards compatible.
    const spaces = (result.items ?? []).map((space: SpaceInfo) => _spaceInfoToDict(space));
    const total = result.total;

    logger.info(`Listed ${spaces.length} spaces`);
    return new SpaceListResult({ success: true, spaces, total });
  } catch (error) {
    logger.exception(`Failed to list spaces: ${_errorMessage(error)}`);
    return new SpaceListResult({ success: false, error: _errorMessage(error) });
  }
}

/**
 * Update a Space.
 *
 * @param spaceId Space ID.
 * @param options Fields to update.
 * @returns `SpaceResult` with the updated space details.
 */
export async function updateSpace(
  spaceId: string,
  options: UpdateSpaceOptions = {},
): Promise<SpaceResult> {
  try {
    const verifySsl = !options.skipSslVerification;
    const client = _getClient(options.region, verifySsl);

    const space = await client.updateSpace(spaceId, {
      name: options.name,
      description: options.description,
      messageTtlHours: options.messageTtlHours,
      memoryExtractEnabled: options.enableMemoryExtract,
      memoryExtractIdleSeconds: options.memoryExtractIdleSeconds,
      memoryExtractMaxTokens: options.memoryExtractMaxTokens,
      memoryExtractMaxMessages: options.memoryExtractMaxMessages,
      memoryStrategiesBuiltin: options.memoryStrategiesBuiltin,
      tags: options.tags,
    });

    const spaceDict = _spaceInfoToDict(space);

    logger.info(`Space updated successfully: ${spaceId}`);
    return new SpaceResult({ success: true, spaceId, space: spaceDict });
  } catch (error) {
    logger.exception(`Failed to update space ${spaceId}: ${_errorMessage(error)}`);
    return new SpaceResult({ success: false, spaceId, error: _errorMessage(error) });
  }
}

/**
 * Delete a Space.
 *
 * @param spaceId Space ID.
 * @param options Operation options.
 * @returns `SpaceResult` indicating success or failure.
 */
export async function deleteSpace(
  spaceId: string,
  options: SpaceOperationOptions = {},
): Promise<SpaceResult> {
  try {
    const verifySsl = !options.skipSslVerification;
    const client = _getClient(options.region, verifySsl);
    await client.deleteSpace(spaceId);

    logger.info(`Space deleted successfully: ${spaceId}`);
    return new SpaceResult({ success: true, spaceId });
  } catch (error) {
    logger.exception(`Failed to delete space ${spaceId}: ${_errorMessage(error)}`);
    return new SpaceResult({ success: false, spaceId, error: _errorMessage(error) });
  }
}

/** `str(exc)` counterpart: never throw while formatting an error. */
function _errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
