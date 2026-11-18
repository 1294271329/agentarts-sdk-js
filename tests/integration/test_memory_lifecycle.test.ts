/**
 * Memory SDK lifecycle tests (ALLOW_CREATE tier).
 *
 * Ported 1:1 from `tests/integration/test_memory_lifecycle.py`.
 *
 * Self-contained: creates a Space (which mints its own data-plane API key),
 * uses that key for session/message/memory ops, then deletes the Space — which
 * cascades to all sessions/messages/memories. No pre-existing memory API key
 * is required; only AK/SK for the control-plane Space CRUD.
 */

import { afterAll, beforeAll, describe, it, expect } from 'vitest';

import {
  MemoryClient,
  MemorySearchFilter,
  MemorySession,
  TextMessage,
} from 'agentarts-sdk/sdk/memory';
import type {
  MessageBatchResponse,
  SessionInfo,
  SpaceInfo,
} from 'agentarts-sdk/sdk/memory';

import {
  allowCreate,
  cloudRegion,
  createMemorySpace,
  getMemoryControlClient,
  hasCloudCredentials,
  memoryExtractionWaitSeconds,
  resourceRegistry,
  waitFor,
} from './_helpers.js';

const describeLifecycle = hasCloudCredentials() && allowCreate() ? describe : describe.skip;

describeLifecycle('memory lifecycle (ALLOW_CREATE tier)', () => {
  // A Space is created per test file (Python shares one across modules through
  // the session-scoped `memory_space` fixture; vitest isolates module state).
  let space: SpaceInfo;
  let dataClient: MemoryClient;
  let memorySession: SessionInfo;
  let seededMessages: MessageBatchResponse;

  beforeAll(async () => {
    const control = getMemoryControlClient();
    space = await createMemorySpace({ client: control });

    // Data-plane client authenticated with the Space's own API key.
    dataClient = new MemoryClient({ apiKey: space.apiKey });

    memorySession = await dataClient.createMemorySession(space.id, undefined, 'aa-it-actor');

    seededMessages = await dataClient.addMessages(
      space.id,
      memorySession.id,
      [
        new TextMessage({ role: 'user', content: 'My name is Alice and I live in Beijing.' }),
        new TextMessage({ role: 'assistant', content: 'Nice to meet you, Alice from Beijing.' }),
      ],
      // Force extraction so deleteMemory can be exercised.
      { isForceExtract: true },
    );

    // Memory extraction is async on the backend — wait (~90s) for extracted
    // memories to appear before the retrieval/delete tests run. Best-effort:
    // if extraction doesn't fire in time, deleteMemory soft-skips.
    try {
      await waitFor(() => dataClient.listMemories(space.id, 10).then((result) => result.items), {
        timeoutMs: memoryExtractionWaitSeconds() * 1000,
        intervalMs: 10_000,
        desc: 'memory extraction',
      });
    } catch {
      // best-effort
    }
  });

  afterAll(async () => {
    await dataClient?.close();
    await resourceRegistry.cleanupAll();
    await getMemoryControlClient().close();
  });

  // -------------------------------------------------------------------------
  // Space control plane
  // -------------------------------------------------------------------------

  it('getSpace returns the created space', async () => {
    const got = await getMemoryControlClient().getSpace(space.id);
    expect(got.id).toBe(space.id);
    expect(got.name).toBe(space.name);
  });

  it('listSpaces contains the created space', async () => {
    // limit is capped at 100 by the backend ("limit too large" above 100).
    const result = await getMemoryControlClient().listSpaces(100);
    const ids = result.items.map((item) => item.id);
    expect(ids).toContain(space.id);
  });

  it('updateSpace updates the description', async () => {
    const updated = await getMemoryControlClient().updateSpace(space.id, {
      description: 'updated by integration suite',
    });
    expect(updated.id).toBe(space.id);
  });

  // -------------------------------------------------------------------------
  // Session + message data plane
  // -------------------------------------------------------------------------

  it('createMemorySession creates a session', () => {
    expect(memorySession.id).toBeTruthy();
  });

  it('addMessages stores two messages', () => {
    expect(seededMessages.items.length).toBe(2);
  });

  it('listMessages returns the seeded messages', async () => {
    const result = await dataClient.listMessages(space.id, memorySession.id, 10);
    expect(Array.isArray(result.items)).toBe(true);
    expect(result.total).toBeGreaterThanOrEqual(2);
  });

  it('getLastKMessages returns the last two messages with both roles', async () => {
    const messages = await dataClient.getLastKMessages(memorySession.id, 2, space.id);
    expect(Array.isArray(messages)).toBe(true);
    expect(messages.length).toBe(2);
    const roles = messages.map((message) => message.role);
    expect(roles).toContain('user');
    expect(roles).toContain('assistant');
  });

  it('getMessage returns the first seeded message', async () => {
    const messageId = seededMessages.items[0].id;
    const message = await dataClient.getMessage(messageId, space.id, memorySession.id);
    expect(message.id).toBe(messageId);
    expect(['user', 'assistant', 'system', 'tool']).toContain(message.role);
  });

  // -------------------------------------------------------------------------
  // Memory data plane (search / list / get / delete)
  // -------------------------------------------------------------------------

  it('searchMemories returns a result list', async () => {
    const result = await dataClient.searchMemories(
      space.id,
      new MemorySearchFilter({ query: 'hello', topK: 3 }),
    );
    expect(Array.isArray(result.results)).toBe(true);
    expect(result.total).toBeGreaterThanOrEqual(0);
  });

  it('listMemories returns a result list', async () => {
    const result = await dataClient.listMemories(space.id, 10);
    expect(Array.isArray(result.items)).toBe(true);
    expect(result.total).toBeGreaterThanOrEqual(0);
  });

  it('deleteMemory deletes an extracted memory when one exists', async (ctx) => {
    const result = await dataClient.listMemories(space.id, 10);
    if (result.items.length === 0) {
      // Memories are backend-extracted; if none exist yet, this is a soft skip.
      ctx.skip(
        'no extracted memories to delete — enable memoryStrategiesBuiltin + ' +
          'isForceExtract=true to exercise the extraction+delete path',
      );
      return;
    }
    const target = result.items[0];
    await dataClient.deleteMemory(space.id, target.id);
  });

  // -------------------------------------------------------------------------
  // MemorySession wrapper (bound space+session, auto-creates session on init)
  // -------------------------------------------------------------------------

  it('MemorySession wrapper adds and reads messages', async () => {
    const wrapper = new MemorySession({
      spaceId: space.id,
      actorId: 'aa-it-wrap',
      apiKey: space.apiKey,
      regionName: cloudRegion(),
    });
    try {
      await wrapper.addMessages([new TextMessage({ role: 'user', content: 'wrap sync' })]);
      const last = await wrapper.getLastKMessages(1);
      expect(last.length).toBe(1);
      const listed = await wrapper.listMessages(5);
      expect(listed.total).toBeGreaterThanOrEqual(1);
    } finally {
      await wrapper.close();
    }
  });
});
