/**
 * Agent Memory SDK - Control Plane.
 *
 * Control plane: manages Space resource creation, query, update, deletion.
 *
 * Mirrors `agentarts/sdk/memory/inner/controlplane.py`.
 */

import { getLogger } from '../../utils/logging.js';
import { MemoryHttpService } from '../../service/memory-service.js';

import {
  ApiKeyInfo,
  SpaceCreateRequest,
  SpaceInfo,
  SpaceListResponse,
  SpaceUpdateRequest,
} from './config.js';
const logger = getLogger('sdk.memory.inner.controlplane');

/** Options accepted by {@link _ControlPlane}. */
export interface ControlPlaneOptions {
  /** Huawei Cloud region name, auto-detected from the environment if omitted. */
  regionName?: string | null;
  /**
   * SSL verification setting: `true` (default), `false` to skip verification,
   * or a path to a custom CA certificate file.
   */
  verifySsl?: boolean | string;
  /** Custom endpoint URL (development/testing). */
  endpoint?: string | null;
}

/**
 * Control Plane API - Space resource management.
 *
 * Generally used through `MemoryClient`; do not instantiate directly.
 */
export class _ControlPlane {
  client: MemoryHttpService;

  constructor(options: ControlPlaneOptions = {}) {
    this.client = new MemoryHttpService({
      regionName: options.regionName,
      endpointType: 'control',
      verifySsl: options.verifySsl ?? true,
      endpoint: options.endpoint,
    });
    logger.info('ControlPlane initialized');
  }

  /**
   * Create an API Key.
   *
   * @returns API Key information, containing `id` and `apiKey` fields.
   */
  async _createApiKey(): Promise<ApiKeyInfo> {
    logger.info('Creating API Key');
    const result = await this.client.createApiKey();
    logger.info(`API Key created successfully. ID: ${result?.['id']}`);
    return ApiKeyInfo.fromDict(result);
  }

  /**
   * Create a Space.
   *
   * @param request Space creation request (name, messageTtlHours, ...).
   * @returns Created Space information, including the generated API Key.
   */
  async createSpace(request: SpaceCreateRequest): Promise<SpaceInfo> {
    const apiKeyInfo = await this._createApiKey();
    const apiKeyId = apiKeyInfo.id;
    const apiKey = apiKeyInfo.apiKey;

    logger.info(`Creating space: ${request.name}`);

    const apiRequestDict = request.toDict();
    apiRequestDict['api_key_id'] = apiKeyId;

    const result = await this.client.createSpace(apiRequestDict);

    result['api_key'] = apiKey;
    result['api_key_id'] = apiKeyId;
    logger.info(`Space created: ${result?.['id']}`);
    return SpaceInfo.fromDict(result);
  }

  /** Get Space details. */
  async getSpace(spaceId: string): Promise<SpaceInfo> {
    logger.info(`Getting space: ${spaceId}`);
    const result = await this.client.getSpace(spaceId);
    return SpaceInfo.fromDict(result);
  }

  /** List Spaces. */
  async listSpaces(limit = 20, offset = 0): Promise<SpaceListResponse> {
    logger.info(`Listing spaces (limit=${limit}, offset=${offset})`);
    const result = await this.client.listSpaces(limit, offset);
    return SpaceListResponse.fromDict(result);
  }

  /** Update Space configuration. */
  async updateSpace(spaceId: string, request: SpaceUpdateRequest): Promise<SpaceInfo> {
    logger.info(`Updating space: ${spaceId}`);
    const result = await this.client.updateSpace(spaceId, request.toDict());
    logger.info(`Space updated: ${spaceId}`);
    return SpaceInfo.fromDict(result);
  }

  /** Delete Space. */
  async deleteSpace(spaceId: string): Promise<void> {
    logger.info(`Deleting space: ${spaceId}`);
    await this.client.deleteSpace(spaceId);
    logger.info(`Space deleted: ${spaceId}`);
  }

  /** Close the control plane and release resources. */
  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      logger.info('ControlPlane closed');
    }
  }
}
