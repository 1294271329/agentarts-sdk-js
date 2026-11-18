/**
 * Gateway HTTP Client Module.
 *
 * Provides HTTP client implementation for MCP (Model Context Protocol)
 * gateway operations.
 */

import { BaseHTTPClient, RequestConfig, RequestResult } from '../service/http-client.js';
import { IAMClient } from '../service/iam-client.js';
import { generateRandomString } from '../utils/common.js';
import { getControlPlaneEndpoint } from '../utils/constant.js';

export class GatewayClient extends BaseHTTPClient {
  private _verifySsl: boolean;

  constructor(verifySsl = true) {
    const config = new RequestConfig();
    config.baseUrl = `${getControlPlaneEndpoint()}/v1/core`;
    config.verifySsl = verifySsl;
    super(config, true);
    this._verifySsl = verifySsl;
  }

  /**
   * Create a new gateway.
   */
  async createGateway(options: {
    name?: string | null;
    description?: string | null;
    protocolType?: string | null;
    authorizerType?: string | null;
    agencyName?: string | null;
    authorizerConfiguration?: Record<string, any> | null;
    protocolConfiguration?: Record<string, any> | null;
    logDeliveryConfiguration?: Record<string, any> | null;
    outboundNetworkConfiguration?: Record<string, any> | null;
    tags?: Array<Record<string, string>> | null;
  } = {}): Promise<RequestResult> {
    let {
      name,
      description,
      protocolType = 'mcp',
      authorizerType = 'iam',
      agencyName,
      authorizerConfiguration,
      protocolConfiguration,
      logDeliveryConfiguration,
      outboundNetworkConfiguration,
      tags,
    } = options;

    if (name === undefined || name === null) {
      name = `gateway-${generateRandomString(8)}`;
    }

    if (agencyName === undefined || agencyName === null) {
      const iamClient = new IAMClient(this._verifySsl);

      const defaultAgencyName = 'AgentArtsCoreGateway';
      const servicePrincipal = 'service.WorkloadSandboxMetadata';
      const trustPolicy = {
        Version: '5.0',
        Statement: [
          {
            Action: ['sts:agencies:assume'],
            Effect: 'Allow',
            Principal: {
              Service: [servicePrincipal],
            },
          },
        ],
      };

      try {
        await iamClient.createAgencyWithPolicy(
          defaultAgencyName,
          JSON.stringify(trustPolicy),
          'AgentArtsCoreGatewayIdentityAgencyPolicy',
        );
      } catch (error) {
        // Check if the error is a 409 Conflict (agency already exists).
        if (!String(error).includes('409')) {
          throw new Error(
            `Failed to create agency with policy. Please provide a valid agency_name parameter. ` +
              `Error: ${error}`,
          );
        }
        // Agency already exists (409): assume it has the correct policy.
      }
      agencyName = defaultAgencyName;
    }

    if (logDeliveryConfiguration === undefined || logDeliveryConfiguration === null) {
      logDeliveryConfiguration = { enabled: false };
    }

    if (outboundNetworkConfiguration === undefined || outboundNetworkConfiguration === null) {
      outboundNetworkConfiguration = { network_mode: 'public' };
    }

    const payload: Record<string, any> = {
      name,
      description,
      protocol_type: protocolType,
      authorizer_type: authorizerType,
      agency_name: agencyName,
      authorizer_configuration: authorizerConfiguration,
      protocol_configuration: protocolConfiguration,
      log_delivery_configuration: logDeliveryConfiguration,
      outbound_network_configuration: outboundNetworkConfiguration,
      tags,
    };

    return this.post('/gateways', { json: removeNullValues(payload) });
  }

  /** Update an existing gateway. */
  async updateGateway(
    gatewayId: string,
    options: {
      description?: string | null;
      protocolConfiguration?: Record<string, any> | null;
      logDeliveryConfiguration?: Record<string, any> | null;
      tags?: Array<Record<string, string>> | null;
    } = {},
  ): Promise<RequestResult> {
    const { description, protocolConfiguration, logDeliveryConfiguration, tags } = options;

    if (
      description === undefined &&
      protocolConfiguration === undefined &&
      logDeliveryConfiguration === undefined &&
      tags === undefined
    ) {
      const updateableFields = [
        'description',
        'protocol_configuration',
        'log_delivery_configuration',
        'tags',
      ];
      throw new Error(
        `At least one parameter must be provided for update. Available fields: ${updateableFields.join(', ')}`,
      );
    }

    const payload: Record<string, any> = {
      description,
      protocol_configuration: protocolConfiguration,
      log_delivery_configuration: logDeliveryConfiguration,
      tags,
    };

    return this.put(`/gateways/${gatewayId}`, { json: removeNullValues(payload) });
  }

  /** Delete a gateway. */
  async deleteGateway(gatewayId: string): Promise<RequestResult> {
    return this.delete(`/gateways/${gatewayId}`);
  }

  /** Get details of a gateway. */
  async getGateway(gatewayId: string): Promise<RequestResult> {
    return this.get(`/gateways/${gatewayId}`);
  }

  /** List gateways with optional filters. */
  async listGateways(options: {
    name?: string | null;
    status?: string | null;
    gatewayId?: string | null;
    tagKeyExists?: string[] | null;
    tagKeyMatches?: string[] | null;
    tagValueMatches?: string[] | null;
    tagMatchPolicy?: string | null;
    limit?: number | null;
    offset?: number | null;
  } = {}): Promise<RequestResult> {
    const params: Record<string, any> = {
      name: options.name,
      status: options.status,
      gateway_id: options.gatewayId,
      tag_key_exists: options.tagKeyExists,
      tag_key_matches: options.tagKeyMatches,
      tag_value_matches: options.tagValueMatches,
      tag_match_policy: options.tagMatchPolicy,
      limit: options.limit,
      offset: options.offset,
    };

    return this.get('/gateways', removeNullValues(params));
  }

  /** Create a new gateway target. */
  async createGatewayTarget(
    gatewayId: string,
    options: {
      name?: string | null;
      description?: string | null;
      targetConfiguration?: Record<string, any> | null;
      credentialProviderConfiguration?: Record<string, any> | null;
    } = {},
  ): Promise<RequestResult> {
    let { name, description, targetConfiguration, credentialProviderConfiguration } = options;

    if (name === undefined || name === null) {
      name = `target-${generateRandomString(8)}`;
    }
    if (credentialProviderConfiguration === undefined || credentialProviderConfiguration === null) {
      credentialProviderConfiguration = { credential_provider_type: 'none' };
    }

    const payload: Record<string, any> = {
      name,
      description,
      target_configuration: targetConfiguration,
      credential_provider_configuration: credentialProviderConfiguration,
    };

    return this.post(`/gateways/${gatewayId}/targets`, { json: removeNullValues(payload) });
  }

  /** Update an existing gateway target. */
  async updateGatewayTarget(
    gatewayId: string,
    targetId: string,
    options: {
      name?: string | null;
      description?: string | null;
      targetConfiguration?: Record<string, any> | null;
      credentialProviderConfiguration?: Record<string, any> | null;
    } = {},
  ): Promise<RequestResult> {
    const { name, description, targetConfiguration, credentialProviderConfiguration } = options;

    if (
      name === undefined &&
      description === undefined &&
      targetConfiguration === undefined &&
      credentialProviderConfiguration === undefined
    ) {
      const updateableFields = [
        'name',
        'description',
        'target_configuration',
        'credential_provider_configuration',
      ];
      throw new Error(
        `At least one parameter must be provided for update. Available fields: ${updateableFields.join(', ')}`,
      );
    }

    const payload: Record<string, any> = {
      name,
      description,
      target_configuration: targetConfiguration,
      credential_provider_configuration: credentialProviderConfiguration,
    };

    return this.put(`/gateways/${gatewayId}/targets/${targetId}`, {
      json: removeNullValues(payload),
    });
  }

  /** Delete a gateway target. */
  async deleteGatewayTarget(gatewayId: string, targetId: string): Promise<RequestResult> {
    return this.delete(`/gateways/${gatewayId}/targets/${targetId}`);
  }

  /** Get details of a gateway target. */
  async getGatewayTarget(gatewayId: string, targetId: string): Promise<RequestResult> {
    return this.get(`/gateways/${gatewayId}/targets/${targetId}`);
  }

  /** List gateway targets with pagination. */
  async listGatewayTargets(
    gatewayId: string,
    options: { limit?: number | null; offset?: number | null } = {},
  ): Promise<RequestResult> {
    const params: Record<string, any> = {
      limit: options.limit,
      offset: options.offset,
    };
    return this.get(`/gateways/${gatewayId}/targets`, removeNullValues(params));
  }
}

function removeNullValues(payload: Record<string, any>): Record<string, any> {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== null && value !== undefined),
  );
}
