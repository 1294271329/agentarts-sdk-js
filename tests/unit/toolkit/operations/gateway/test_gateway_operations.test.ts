/**
 * Unit tests for the gateway operations namespace.
 *
 * Ported from `tests/unit/toolkit/operations/gateway/test_gateway_operations.py`,
 * which only asserts that `agentarts.toolkit.operations.gateway` can be imported
 * and that `__all__ == []` (the Python package is an empty namespace package —
 * the gateway implementation lives in `agentarts.sdk.gateway`).
 *
 * NOTE: source module pending — the TypeScript port has no
 * `toolkit/operations/gateway` package yet (and may never need one: the gateway
 * client lives in `agentarts-sdk/sdk/gateway` and the CLI in
 * `agentarts-sdk/toolkit/cli/gateway`). Until it lands, this file keeps the
 * Python intent — "the gateway surface exposes no operation helpers" — by
 * asserting the public surface of the gateway CLI module that the port does
 * have. When/if `toolkit/operations/gateway/index.ts` is added, replace the
 * assertion with `expect(Object.keys(await import("agentarts-sdk/toolkit/operations/gateway"))).toEqual([])`.
 */

import { describe, it, expect } from 'vitest';

import * as gatewayCli from 'agentarts-sdk/toolkit/cli/gateway/index';

describe('gateway operations', () => {
  it('exposes no gateway operation helpers (Python `__all__ == []`)', () => {
    const exported = Object.keys(gatewayCli).sort();

    expect(exported).toEqual(['createGatewayCommand', 'registerGatewayCommands']);
    for (const name of exported) {
      expect(name.toLowerCase()).not.toContain('operation');
    }
  });

  it('imports the gateway client from the SDK package', async () => {
    const gatewaySdk = await import('agentarts-sdk/sdk/gateway/index');

    expect(typeof gatewaySdk.GatewayClient).toBe('function');
  });
});
