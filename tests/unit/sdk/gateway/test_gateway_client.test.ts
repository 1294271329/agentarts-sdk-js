/**
 * Unit tests for the Gateway client.
 *
 * Ported 1:1 from `tests/unit/sdk/gateway/test_gateway_client.py`.
 *
 * The Python suite patches module globals (`get_control_plane_endpoint`,
 * `IAMClient`, `generate_random_string`). The TypeScript client resolves
 * `post` on the prototype and constructs `IAMClient` lazily, so the same
 * behaviour is stubbed with `vi.spyOn`. `generateRandomString` draws each
 * character from `Math.random`, which is pinned to 0 so the generated suffix is
 * deterministic (`aaaaaaaa`) instead of patching the imported function.
 */

import { describe, it, expect, vi } from 'vitest';

import { GatewayClient } from 'agentarts-sdk/sdk/gateway/gateway-client';
import { IAMClient } from 'agentarts-sdk/sdk/service/iam-client';
import { RequestResult } from 'agentarts-sdk/sdk/service/http-client';

/** Build the `RequestResult` the Python tests emulate with `Mock(status_code=...)`. */
function okResult(statusCode = 200): RequestResult {
  return new RequestResult({ success: true, statusCode });
}

/** Stub the default agency creation performed when `agencyName` is omitted. */
function stubAgencyCreation() {
  return vi.spyOn(IAMClient.prototype, 'createAgencyWithPolicy').mockResolvedValue({});
}

/** JSON payload of the n-th call of a stubbed `post`/`put`/`patch` method. */
function jsonPayload(spy: { mock: { calls: any[][] } }, callIndex = 0): Record<string, any> {
  return spy.mock.calls[callIndex]![1]!.json as Record<string, any>;
}

describe('GatewayClient', () => {
  it('createGateway posts a gateway and returns the result', async () => {
    stubAgencyCreation();
    const mockPost = vi.spyOn(GatewayClient.prototype, 'post').mockResolvedValue(okResult(200));

    const client = new GatewayClient();
    const result = await client.createGateway({
      name: 'test-gateway',
      description: 'Test gateway',
      agencyName: 'TestAgency',
    });

    expect(result).not.toBeNull();
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('createGateway creates the default agency when agencyName is omitted', async () => {
    const mockAgency = stubAgencyCreation();
    const mockPost = vi.spyOn(GatewayClient.prototype, 'post').mockResolvedValue(okResult(200));

    const client = new GatewayClient();
    const result = await client.createGateway({
      name: 'test-gateway',
      description: 'Test gateway',
    });

    expect(result).not.toBeNull();
    expect(mockAgency).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('createGateway tolerates an already existing agency (409)', async () => {
    vi.spyOn(IAMClient.prototype, 'createAgencyWithPolicy').mockRejectedValue(
      new Error('409 Conflict: Agency already exists'),
    );
    const mockPost = vi.spyOn(GatewayClient.prototype, 'post').mockResolvedValue(okResult(200));

    const client = new GatewayClient();
    const result = await client.createGateway({
      name: 'test-gateway',
      description: 'Test gateway',
    });

    expect(result).not.toBeNull();
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('createGateway fails on a non-409 agency error', async () => {
    vi.spyOn(IAMClient.prototype, 'createAgencyWithPolicy').mockRejectedValue(
      new Error('500 Internal Server Error'),
    );

    const client = new GatewayClient();

    await expect(
      client.createGateway({ name: 'test-gateway', description: 'Test gateway' }),
    ).rejects.toThrow('Failed to create agency');
  });

  it('updateGateway puts the changed fields', async () => {
    const mockPut = vi.spyOn(GatewayClient.prototype, 'put').mockResolvedValue(okResult(200));

    const client = new GatewayClient();
    const result = await client.updateGateway('test-gateway-id', {
      description: 'Updated description',
    });

    expect(result).not.toBeNull();
    expect(mockPut).toHaveBeenCalledTimes(1);
  });

  it('updateGateway rejects when no parameter is provided', async () => {
    const client = new GatewayClient();

    await expect(client.updateGateway('test-gateway-id')).rejects.toThrow(
      'At least one parameter',
    );
  });

  it('deleteGateway deletes the gateway', async () => {
    const mockDelete = vi.spyOn(GatewayClient.prototype, 'delete').mockResolvedValue(okResult(200));

    const client = new GatewayClient();
    const result = await client.deleteGateway('test-gateway-id');

    expect(result).not.toBeNull();
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it('getGateway fetches the gateway', async () => {
    const mockGet = vi.spyOn(GatewayClient.prototype, 'get').mockResolvedValue(okResult(200));

    const client = new GatewayClient();
    const result = await client.getGateway('test-gateway-id');

    expect(result).not.toBeNull();
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('listGateways lists gateways filtered by name', async () => {
    const mockGet = vi.spyOn(GatewayClient.prototype, 'get').mockResolvedValue(okResult(200));

    const client = new GatewayClient();
    const result = await client.listGateways({ name: 'test-gateway' });

    expect(result).not.toBeNull();
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('createGatewayTarget posts a target', async () => {
    const mockPost = vi.spyOn(GatewayClient.prototype, 'post').mockResolvedValue(okResult(200));

    const client = new GatewayClient();
    const result = await client.createGatewayTarget('test-gateway-id', {
      name: 'test-target',
      description: 'Test target',
    });

    expect(result).not.toBeNull();
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('updateGatewayTarget puts the changed fields', async () => {
    const mockPut = vi.spyOn(GatewayClient.prototype, 'put').mockResolvedValue(okResult(200));

    const client = new GatewayClient();
    const result = await client.updateGatewayTarget('test-gateway-id', 'test-target-id', {
      name: 'updated-target',
    });

    expect(result).not.toBeNull();
    expect(mockPut).toHaveBeenCalledTimes(1);
  });

  it('updateGatewayTarget rejects when no parameter is provided', async () => {
    const client = new GatewayClient();

    await expect(client.updateGatewayTarget('test-gateway-id', 'test-target-id')).rejects.toThrow(
      'At least one parameter',
    );
  });

  it('deleteGatewayTarget deletes the target', async () => {
    const mockDelete = vi.spyOn(GatewayClient.prototype, 'delete').mockResolvedValue(okResult(200));

    const client = new GatewayClient();
    const result = await client.deleteGatewayTarget('test-gateway-id', 'test-target-id');

    expect(result).not.toBeNull();
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it('getGatewayTarget fetches the target', async () => {
    const mockGet = vi.spyOn(GatewayClient.prototype, 'get').mockResolvedValue(okResult(200));

    const client = new GatewayClient();
    const result = await client.getGatewayTarget('test-gateway-id', 'test-target-id');

    expect(result).not.toBeNull();
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('listGatewayTargets lists the targets of a gateway', async () => {
    const mockGet = vi.spyOn(GatewayClient.prototype, 'get').mockResolvedValue(okResult(200));

    const client = new GatewayClient();
    const result = await client.listGatewayTargets('test-gateway-id');

    expect(result).not.toBeNull();
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('createGateway generates a default name', async () => {
    // Python pins `generate_random_string` to "abcdefgh"; `Math.random() === 0`
    // selects the first character of the alphabet for every position instead.
    vi.spyOn(Math, 'random').mockReturnValue(0);
    stubAgencyCreation();
    const mockPost = vi.spyOn(GatewayClient.prototype, 'post').mockResolvedValue(okResult(200));

    const client = new GatewayClient();
    const result = await client.createGateway({ description: 'Test gateway' });

    expect(result).not.toBeNull();
    const payload = jsonPayload(mockPost);
    expect(payload['name']).toBe('gateway-aaaaaaaa');
  });

  it('createGateway applies the default configurations', async () => {
    stubAgencyCreation();
    const mockPost = vi.spyOn(GatewayClient.prototype, 'post').mockResolvedValue(okResult(200));

    const client = new GatewayClient();
    const result = await client.createGateway({
      name: 'test-gateway',
      agencyName: 'TestAgency',
    });

    expect(result).not.toBeNull();
    const payload = jsonPayload(mockPost);
    expect(payload['log_delivery_configuration']).toEqual({ enabled: false });
    expect(payload['outbound_network_configuration']).toEqual({ network_mode: 'public' });
  });

  it('createGatewayTarget generates a default name and credential configuration', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const mockPost = vi.spyOn(GatewayClient.prototype, 'post').mockResolvedValue(okResult(200));

    const client = new GatewayClient();
    const result = await client.createGatewayTarget('test-gateway-id', {
      description: 'Test target',
    });

    expect(result).not.toBeNull();
    const payload = jsonPayload(mockPost);
    expect(payload['name']).toBe('target-aaaaaaaa');
    expect(payload['credential_provider_configuration']).toEqual({
      credential_provider_type: 'none',
    });
  });
});
