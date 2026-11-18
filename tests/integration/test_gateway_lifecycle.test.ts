/**
 * Gateway lifecycle tests (ALLOW_CREATE tier).
 *
 * Ported 1:1 from `tests/integration/test_gateway_lifecycle.py`.
 *
 * Creates a gateway + a target, exercises get/list/update, then deletes the
 * target before the gateway. Note: `createGateway` auto-creates a shared IAM
 * agency `AgentArtsCoreGateway` (409-ignored if it already exists) which the
 * SDK intentionally does not delete — this residue is documented and
 * intentional.
 */

import { afterAll, beforeAll, describe, it, expect } from 'vitest';

import {
  allowCreate,
  getGatewayClient,
  hasCloudCredentials,
  resourceName,
  resourceRegistry,
} from './_helpers.js';

const describeLifecycle = hasCloudCredentials() && allowCreate() ? describe : describe.skip;

/**
 * Pull a resource id out of a response dict, trying common shapes: top-level
 * `id`/`gateway_id`/`target_id`, nested `data["gateway"]`/`data["target"]`, or
 * the first item of a list.
 */
function extractId(data: Record<string, any>, ...keys: string[]): string {
  for (const key of keys) {
    if (data[key]) {
      return String(data[key]);
    }
  }
  for (const nested of ['gateway', 'target']) {
    const obj = data[nested];
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      for (const key of keys) {
        if (obj[key]) {
          return String(obj[key]);
        }
      }
    }
  }
  for (const value of Object.values(data)) {
    if (Array.isArray(value) && value.length > 0 && value[0] && typeof value[0] === 'object') {
      if (value[0]['id']) {
        return String(value[0]['id']);
      }
    }
  }
  throw new Error(`could not find id in response: ${JSON.stringify(data)}`);
}

describeLifecycle('gateway lifecycle (ALLOW_CREATE tier)', () => {
  let gatewayId: string;
  let gatewayName: string;
  let targetId: string;
  let targetName: string;

  beforeAll(async () => {
    const gateway = getGatewayClient();

    gatewayName = resourceName('gw');
    const gatewayResult = await gateway.createGateway({
      name: gatewayName,
      description: 'aa-it',
    });
    expect(gatewayResult.success, `createGateway failed: ${gatewayResult.error ?? ''}`).toBe(true);
    gatewayId = extractId(gatewayResult.data, 'id', 'gateway_id');
    resourceRegistry.register(() => gateway.deleteGateway(gatewayId), `gateway:${gatewayId}`);

    targetName = resourceName('tgt');
    const targetResult = await gateway.createGatewayTarget(gatewayId, {
      name: targetName,
      targetConfiguration: {
        mcp_server: { endpoint: 'https://example.com/mcp', server_type: 'sse' },
      },
    });
    expect(
      targetResult.success,
      `createGatewayTarget failed: ${targetResult.error ?? ''}`,
    ).toBe(true);
    targetId = extractId(targetResult.data, 'id', 'target_id');
    resourceRegistry.register(
      () => gateway.deleteGatewayTarget(gatewayId, targetId),
      `target:${targetId}`,
    );
  });

  afterAll(async () => {
    await resourceRegistry.cleanupAll();
  });

  // -------------------------------------------------------------------------
  // Gateway
  // -------------------------------------------------------------------------

  it('getGateway succeeds', async () => {
    const result = await getGatewayClient().getGateway(gatewayId);
    expect(result.success, result.error ?? '').toBe(true);
  });

  it('listGateways succeeds', async () => {
    // limit is capped at 100 by the backend.
    const result = await getGatewayClient().listGateways({ limit: 100 });
    expect(result.success, result.error ?? '').toBe(true);
    expect(typeof result.data).toBe('object');
  });

  it('updateGateway updates the description', async () => {
    const result = await getGatewayClient().updateGateway(gatewayId, {
      description: 'updated by aa-it',
    });
    expect(result.success, result.error ?? '').toBe(true);
  });

  // -------------------------------------------------------------------------
  // Target
  // -------------------------------------------------------------------------

  it('getGatewayTarget succeeds', async () => {
    const result = await getGatewayClient().getGatewayTarget(gatewayId, targetId);
    expect(result.success, result.error ?? '').toBe(true);
  });

  it('listGatewayTargets succeeds', async () => {
    const result = await getGatewayClient().listGatewayTargets(gatewayId, { limit: 100 });
    expect(result.success, result.error ?? '').toBe(true);
    expect(typeof result.data).toBe('object');
  });

  it('updateGatewayTarget updates the description', async () => {
    const result = await getGatewayClient().updateGatewayTarget(gatewayId, targetId, {
      description: 'updated target by aa-it',
    });
    expect(result.success, result.error ?? '').toBe(true);
  });
});
