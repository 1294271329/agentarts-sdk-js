/**
 * Pure read-only list tests (default tier).
 *
 * Ported 1:1 from `tests/integration/test_readonly_lists.py`.
 *
 * One list call per service, `limit=1` to minimise traffic. Creates nothing,
 * costs nothing — a cheap connectivity + auth probe for every control plane.
 */

import { describe, it, expect } from 'vitest';

import { CodeInterpreter } from 'agentarts-sdk';

import {
  cloudRegion,
  getGatewayClient,
  getMemoryControlClient,
  getRuntimeClient,
  hasCloudCredentials,
} from './_helpers.js';

const describeIntegration = hasCloudCredentials() ? describe : describe.skip;

describeIntegration('read-only lists (default tier)', () => {
  it('listSpaces returns a list (memory control plane)', async () => {
    const result = await getMemoryControlClient().listSpaces(1);
    expect(Array.isArray(result.items)).toBe(true);
  });

  it('listGateways succeeds (gateway control plane)', async () => {
    const result = await getGatewayClient().listGateways({ limit: 1 });
    expect(result.success, result.error ?? '').toBe(true);
  });

  it('getAgents returns a list (runtime control plane)', async () => {
    // The runtime control plane rejects limit<10 ("limit too small").
    const agents = await getRuntimeClient().getAgents({ limit: 10 });
    expect(Array.isArray(agents)).toBe(true);
  });

  it('listCodeInterpreters returns an object (code-interpreter control plane)', async () => {
    const codeInterpreter = new CodeInterpreter(cloudRegion());
    const result = await codeInterpreter.listCodeInterpreters(null, 1);
    expect(typeof result).toBe('object');
    expect(result).not.toBeNull();
  });
});
