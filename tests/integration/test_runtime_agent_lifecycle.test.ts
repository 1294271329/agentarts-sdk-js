/**
 * Runtime control-plane CRUD tests (ALLOW_CREATE tier).
 *
 * Ported 1:1 from `tests/integration/test_runtime_agent_lifecycle.py`.
 *
 * The target agent is supplied through `AGENTARTS_TEST_RUNTIME_AGENT_NAME` (a
 * pre-provisioned agent — no Docker, no deploy, no billable resources). The
 * Python suite also falls back to the shared `deployed_runtime_agent` fixture
 * (Docker + `agentarts deploy`); that fixture was not ported (see README), so
 * these tests skip without the env var.
 *
 * The agent itself is NOT created/deleted here — `createAgent` needs an
 * `artifactSourceConfig` (a built image), which only `deploy` provides. These
 * tests exercise find/get/update + endpoint CRUD against an existing agent. The
 * endpoint is created and cleaned up via `resourceRegistry`; the agent is left
 * intact (owned by the env var).
 */

import { afterAll, beforeAll, describe, it, expect } from 'vitest';

import {
  allowCreate,
  cloudRegion,
  getRuntimeClient,
  hasCloudCredentials,
  resourceName,
  resourceRegistry,
  runtimeAgentName,
} from './_helpers.js';

const AGENT_NAME = runtimeAgentName();
const describeLifecycle =
  hasCloudCredentials() && allowCreate() && AGENT_NAME ? describe : describe.skip;

describeLifecycle('runtime agent lifecycle (ALLOW_CREATE tier)', () => {
  let agentId: string;
  let endpointName: string | null = null;
  let endpointSkipReason: string | null = null;

  beforeAll(async () => {
    const runtime = getRuntimeClient();
    const agent = await runtime.findAgentByName(AGENT_NAME as string);
    expect(
      agent,
      `agent '${AGENT_NAME}' not found in region ${cloudRegion()} ` +
        '(mode=standalone; set AGENTARTS_TEST_RUNTIME_AGENT_NAME)',
    ).not.toBeNull();
    agentId = String((agent as Record<string, any>)['id']);

    const candidate = resourceName('ep');
    try {
      await runtime.createAgentEndpoint(agentId, candidate);
      endpointName = candidate;
      resourceRegistry.register(
        () => runtime.deleteAgentEndpoint(agentId, candidate),
        `endpoint:${candidate}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Newer backends require a targetVersionName for endpoint creation, which
      // needs a published agent version we don't have here. Skip rather than
      // error — the agent read/update paths are still exercised.
      if (message.includes('targetVersionName')) {
        endpointSkipReason = message;
        return;
      }
      throw error;
    }
  });

  afterAll(async () => {
    await resourceRegistry.cleanupAll();
  });

  // -------------------------------------------------------------------------
  // Agent read / update
  // -------------------------------------------------------------------------

  it('findAgentByName returns the agent', async () => {
    const found = await getRuntimeClient().findAgentByName(AGENT_NAME as string);
    expect(found).not.toBeNull();
    expect((found as Record<string, any>)['id']).toBe(agentId);
  });

  it('findAgentById returns the agent', async () => {
    const found = await getRuntimeClient().findAgentById(agentId);
    expect(found).not.toBeNull();
    expect((found as Record<string, any>)['id']).toBe(agentId);
  });

  it('getAgents returns a list', async () => {
    // The backend rejects limit<10 ("limit too small").
    const agents = await getRuntimeClient().getAgents({ limit: 10 });
    expect(Array.isArray(agents)).toBe(true);
  });

  it('updateAgent updates the description', async () => {
    const updated = await getRuntimeClient().updateAgent(agentId, {
      description: 'updated by aa-it',
    });
    expect(updated['id']).toBe(agentId);
  });

  // -------------------------------------------------------------------------
  // Endpoint CRUD
  // -------------------------------------------------------------------------

  it('findAgentEndpoint returns the endpoint', async (ctx) => {
    if (!endpointName) {
      ctx.skip(`createAgentEndpoint skipped: ${endpointSkipReason ?? 'unknown reason'}`);
      return;
    }
    const endpoint = await getRuntimeClient().findAgentEndpoint(agentId, endpointName);
    expect(typeof endpoint).toBe('object');
  });

  it('updateAgentEndpoint updates the endpoint', async (ctx) => {
    if (!endpointName) {
      ctx.skip(`createAgentEndpoint skipped: ${endpointSkipReason ?? 'unknown reason'}`);
      return;
    }
    const endpoint = await getRuntimeClient().updateAgentEndpoint(agentId, endpointName, {
      config: { note: 'updated by aa-it' },
    });
    expect(typeof endpoint).toBe('object');
  });
});
