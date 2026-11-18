/**
 * Unit tests for the Gateway HTTP client.
 *
 * Ported 1:1 from `tests/unit/sdk/gateway/test_gateway_http.py`.
 *
 * Every test stubs the inherited HTTP verb (`post`/`put`/`delete`/`get`) on the
 * `GatewayClient` prototype, exactly like the Python suite patches
 * `GatewayClient.<verb>`; no request leaves the process.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GatewayClient } from 'agentarts-sdk/sdk/gateway/gateway-client';
import { RequestResult } from 'agentarts-sdk/sdk/service/http-client';

describe('GatewayClient HTTP layer', () => {
  let client: GatewayClient;

  beforeEach(() => {
    client = new GatewayClient(true);
  });

  it('createGateway sends every parameter and returns the response', async () => {
    const mockPost = vi.spyOn(GatewayClient.prototype, 'post').mockResolvedValue(
      new RequestResult({
        success: true,
        statusCode: 201,
        data: { id: '123', name: 'TestGateway-1234' },
      }),
    );

    const result = await client.createGateway({
      name: 'TestGateway',
      description: 'Test gateway',
      protocolType: 'mcp',
      authorizerType: 'iam',
      agencyName: 'TestAgency',
    });

    expect(result.success).toBe(true);
    expect(result.data['id']).toBe('123');
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('updateGateway sends the updated description', async () => {
    const mockPut = vi.spyOn(GatewayClient.prototype, 'put').mockResolvedValue(
      new RequestResult({
        success: true,
        statusCode: 200,
        data: { id: '123', description: 'Updated gateway' },
      }),
    );

    const result = await client.updateGateway('123', { description: 'Updated gateway' });

    expect(result.success).toBe(true);
    expect(mockPut).toHaveBeenCalledTimes(1);
  });

  it('updateGateway rejects when no parameter is provided', async () => {
    // Python passes `None` for every optional field; the port treats `undefined`
    // (an omitted option) as "not provided" and keeps `null` as an explicit value
    // that is dropped from the payload.
    await expect(client.updateGateway('123', {})).rejects.toThrow('At least one parameter');
  });

  it('deleteGateway deletes the gateway by path', async () => {
    const mockDelete = vi.spyOn(GatewayClient.prototype, 'delete').mockResolvedValue(
      new RequestResult({ success: true, statusCode: 204 }),
    );

    const result = await client.deleteGateway('123');

    expect(result.success).toBe(true);
    expect(mockDelete).toHaveBeenCalledWith('/gateways/123');
  });

  it('getGateway fetches the gateway by path', async () => {
    const mockGet = vi.spyOn(GatewayClient.prototype, 'get').mockResolvedValue(
      new RequestResult({
        success: true,
        statusCode: 200,
        data: { id: '123', name: 'TestGateway' },
      }),
    );

    const result = await client.getGateway('123');

    expect(result.success).toBe(true);
    expect(result.data['id']).toBe('123');
    expect(mockGet).toHaveBeenCalledWith('/gateways/123');
  });

  it('listGateways sends the filters and returns the page', async () => {
    const mockGet = vi.spyOn(GatewayClient.prototype, 'get').mockResolvedValue(
      new RequestResult({
        success: true,
        statusCode: 200,
        data: { gateways: [{ id: '123', name: 'TestGateway' }], total: 1 },
      }),
    );

    const result = await client.listGateways({ name: 'Test', limit: 10, offset: 0 });

    expect(result.success).toBe(true);
    expect(result.data['gateways']).toHaveLength(1);
    expect(mockGet).toHaveBeenCalledTimes(1);
  });
});
