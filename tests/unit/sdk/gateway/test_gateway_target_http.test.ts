/**
 * Unit tests for the Gateway Target HTTP client.
 *
 * Ported 1:1 from `tests/unit/sdk/gateway/test_gateway_target_http.py`.
 *
 * Every test stubs the inherited HTTP verb (`post`/`put`/`delete`/`get`) on the
 * `GatewayClient` prototype, exactly like the Python suite patches
 * `GatewayClient.<verb>`; no request leaves the process.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GatewayClient } from 'agentarts-sdk/sdk/gateway/gateway-client';
import { RequestResult } from 'agentarts-sdk/sdk/service/http-client';

describe('GatewayClient target HTTP layer', () => {
  let client: GatewayClient;

  beforeEach(() => {
    client = new GatewayClient(true);
  });

  it('createGatewayTarget posts the target', async () => {
    const mockPost = vi.spyOn(GatewayClient.prototype, 'post').mockResolvedValue(
      new RequestResult({
        success: true,
        statusCode: 201,
        data: { id: '456', name: 'TestGatewayTarget-1234' },
      }),
    );

    const result = await client.createGatewayTarget('123', {
      name: 'TestTarget',
      description: 'Test target',
    });

    expect(result.success).toBe(true);
    expect(result.data['id']).toBe('456');
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('updateGatewayTarget puts the changed fields', async () => {
    const mockPut = vi.spyOn(GatewayClient.prototype, 'put').mockResolvedValue(
      new RequestResult({
        success: true,
        statusCode: 200,
        data: { id: '456', name: 'UpdatedTarget' },
      }),
    );

    const result = await client.updateGatewayTarget('123', '456', { name: 'UpdatedTarget' });

    expect(result.success).toBe(true);
    expect(mockPut).toHaveBeenCalledTimes(1);
  });

  it('updateGatewayTarget rejects when no parameter is provided', async () => {
    // Python passes `None` for every optional field; the port treats `undefined`
    // (an omitted option) as "not provided" and keeps `null` as an explicit value
    // that is dropped from the payload.
    await expect(client.updateGatewayTarget('123', '456', {})).rejects.toThrow(
      'At least one parameter',
    );
  });

  it('deleteGatewayTarget deletes the target by path', async () => {
    const mockDelete = vi.spyOn(GatewayClient.prototype, 'delete').mockResolvedValue(
      new RequestResult({ success: true, statusCode: 204 }),
    );

    const result = await client.deleteGatewayTarget('123', '456');

    expect(result.success).toBe(true);
    expect(mockDelete).toHaveBeenCalledWith('/gateways/123/targets/456');
  });

  it('getGatewayTarget fetches the target by path', async () => {
    const mockGet = vi.spyOn(GatewayClient.prototype, 'get').mockResolvedValue(
      new RequestResult({
        success: true,
        statusCode: 200,
        data: { id: '456', name: 'TestTarget' },
      }),
    );

    const result = await client.getGatewayTarget('123', '456');

    expect(result.success).toBe(true);
    expect(result.data['id']).toBe('456');
    expect(mockGet).toHaveBeenCalledWith('/gateways/123/targets/456');
  });

  it('listGatewayTargets sends the pagination and returns the page', async () => {
    const mockGet = vi.spyOn(GatewayClient.prototype, 'get').mockResolvedValue(
      new RequestResult({
        success: true,
        statusCode: 200,
        data: { targets: [{ id: '456', name: 'TestTarget' }], total: 1 },
      }),
    );

    const result = await client.listGatewayTargets('123', { limit: 10, offset: 0 });

    expect(result.success).toBe(true);
    expect(result.data['targets']).toHaveLength(1);
    expect(mockGet).toHaveBeenCalledTimes(1);
  });
});
