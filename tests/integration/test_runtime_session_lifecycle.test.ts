/**
 * Runtime data-plane session lifecycle (RUN_BILLABLE tier).
 *
 * Ported 1:1 from `tests/integration/test_runtime_session_lifecycle.py`.
 *
 * Starts a runtime session against a *pre-deployed* agent, runs a command,
 * round-trips a small file (upload→download), then stops the session.
 * `stopSession` is also registered with the resource registry so the session is
 * torn down even if a step crashes mid-flow. Requires
 * `AGENTARTS_TEST_RUNTIME_AGENT_NAME` and `AGENTARTS_RUNTIME_DATA_ENDPOINT`.
 */

import { afterAll, describe, it, expect } from 'vitest';

import { randomUUID } from 'node:crypto';

import {
  getRuntimeClient,
  hasCloudCredentials,
  resourceRegistry,
  runBillable,
  runtimeAgentName,
} from './_helpers.js';

const AGENT_NAME = runtimeAgentName();
const describeSession =
  hasCloudCredentials() && runBillable() && AGENT_NAME ? describe : describe.skip;

const FILE_PATH = '/home/user/aa-it-uploaded.txt';
const FILE_CONTENT = 'hello-aa-it';

describeSession('runtime session lifecycle (RUN_BILLABLE tier)', () => {
  afterAll(async () => {
    await resourceRegistry.cleanupAll();
  });

  it('startSession → execCommand → upload/download → stopSession', async () => {
    const runtime = getRuntimeClient();
    const agentName = AGENT_NAME as string;
    const requestedSessionId = `aa-it-${randomUUID().replace(/-/g, '').slice(0, 8)}`;

    const started = await runtime.startSession(agentName);
    const backendSessionId =
      started && typeof started === 'object' ? (started['session_id'] as string | undefined) : undefined;
    const sessionId = backendSessionId || requestedSessionId;

    // Safety net: always stop the session at the end, even on failure.
    resourceRegistry.register(
      () => runtime.stopSession(agentName, sessionId),
      `runtime_session:${agentName}:${sessionId}`,
    );

    // 1. execCommand
    const command = await runtime.execCommand(agentName, sessionId, ['echo', FILE_CONTENT]);
    expect(typeof command).toBe('object');

    // 2. uploadFiles (single file, content-based) then downloadFiles round-trip
    const uploaded = await runtime.uploadFiles(
      agentName,
      sessionId,
      [{ content: FILE_CONTENT }],
      { path: FILE_PATH },
    );
    expect(typeof uploaded).toBe('object');

    const downloaded = await runtime.downloadFiles(agentName, sessionId, FILE_PATH, {
      recursive: false,
    });
    const chunks: Buffer[] = [];
    for await (const chunk of downloaded.iterBytes()) {
      chunks.push(Buffer.from(chunk));
    }
    expect(Buffer.concat(chunks).toString('utf8')).toContain(FILE_CONTENT);

    await runtime.stopSession(agentName, sessionId);
  });
});
