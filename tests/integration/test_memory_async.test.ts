/**
 * Async Memory SDK tests (ALLOW_CREATE tier).
 *
 * Ported 1:1 from `tests/integration/test_memory_async.py`.
 *
 * Exercises `AsyncMemoryClient`'s data-plane methods against a run-scoped
 * Space. Setup (Space + session + seeded messages) is done once with the *sync*
 * client; the async tests then mostly read — cheap and isolated.
 */

import { afterAll, beforeAll, describe, it, expect } from 'vitest';

import {
  AsyncMemoryClient,
  AsyncMemorySession,
  MemoryClient,
  MemorySearchFilter,
  TextMessage,
} from 'agentarts-sdk/sdk/memory';
import type { SpaceInfo } from 'agentarts-sdk/sdk/memory';

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

describeLifecycle('memory async (ALLOW_CREATE tier)', () => {
  let space: SpaceInfo;
  let sessionId: string;
  let messageIds: string[];

  beforeAll(async () => {
    const control = getMemoryControlClient();
    // Distinct kind from the sync module so a shared process never collides.
    space = await createMemorySpace({ client: control, kind: 'space-async' });

    // Seed a session + two messages via the sync client (one-time).
    const sync = new MemoryClient({ apiKey: space.apiKey });
    try {
      const session = await sync.createMemorySession(space.id, undefined, 'aa-it-async-actor');
      sessionId = session.id;
      const batch = await sync.addMessages(
        space.id,
        session.id,
        [
          new TextMessage({ role: 'user', content: 'My name is Bob and I work in Shanghai.' }),
          new TextMessage({ role: 'assistant', content: 'Got it, Bob from Shanghai.' }),
        ],
        // Force extraction so deleteMemory can be exercised.
        { isForceExtract: true },
      );
      messageIds = batch.items.map((message) => message.id);

      // Memory extraction is async — wait (~90s) for memories to appear so the
      // retrieval/delete tests can actually exercise them. Best-effort.
      try {
        await waitFor(() => sync.listMemories(space.id, 10).then((result) => result.items), {
          timeoutMs: memoryExtractionWaitSeconds() * 1000,
          intervalMs: 10_000,
          desc: 'memory extraction (async module)',
        });
      } catch {
        // best-effort
      }
    } finally {
      await sync.close();
    }
  });

  afterAll(async () => {
    await resourceRegistry.cleanupAll();
    await getMemoryControlClient().close();
  });

  function asyncClient(): AsyncMemoryClient {
    return new AsyncMemoryClient({ apiKey: space.apiKey });
  }

  it('getLastKMessages returns the last two messages', async () => {
    const client = asyncClient();
    try {
      const messages = await client.getLastKMessages(sessionId, 2, space.id);
      expect(messages.length).toBe(2);
    } finally {
      await client.close();
    }
  });

  it('listMessages returns the seeded messages', async () => {
    const client = asyncClient();
    try {
      const result = await client.listMessages(space.id, sessionId, 10);
      expect(result.total).toBeGreaterThanOrEqual(2);
    } finally {
      await client.close();
    }
  });

  it('getMessage returns the first seeded message', async () => {
    const client = asyncClient();
    try {
      const message = await client.getMessage(messageIds[0], space.id, sessionId);
      expect(message.id).toBe(messageIds[0]);
    } finally {
      await client.close();
    }
  });

  it('searchMemories returns a result list', async () => {
    const client = asyncClient();
    try {
      const result = await client.searchMemories(
        space.id,
        new MemorySearchFilter({ query: 'hello', topK: 3 }),
      );
      expect(Array.isArray(result.results)).toBe(true);
      expect(result.total).toBeGreaterThanOrEqual(0);
    } finally {
      await client.close();
    }
  });

  it('listMemories returns a result list', async () => {
    const client = asyncClient();
    try {
      const result = await client.listMemories(space.id, 10);
      expect(Array.isArray(result.items)).toBe(true);
      expect(result.total).toBeGreaterThanOrEqual(0);
    } finally {
      await client.close();
    }
  });

  it('deleteMemory deletes an extracted memory when one exists', async (ctx) => {
    const client = asyncClient();
    try {
      const result = await client.listMemories(space.id, 10);
      if (result.items.length === 0) {
        ctx.skip('no extracted memories to delete in async path');
        return;
      }
      await client.deleteMemory(space.id, result.items[0].id);
    } finally {
      await client.close();
    }
  });

  // -------------------------------------------------------------------------
  // Direct async create/add (the setup above uses the sync client; these close
  // the gap by exercising AsyncMemoryClient's async writers + the
  // AsyncMemorySession wrapper directly).
  // -------------------------------------------------------------------------

  it('createMemorySession + addMessages work asynchronously', async () => {
    const client = new AsyncMemoryClient({ apiKey: space.apiKey, regionName: cloudRegion() });
    try {
      const session = await client.createMemorySession(
        space.id,
        undefined,
        'aa-it-async-direct',
      );
      expect(session.id).toBeTruthy();

      const batch = await client.addMessages(
        space.id,
        session.id,
        [new TextMessage({ role: 'user', content: 'async direct message' })],
        // Force extraction so deleteMemory can be exercised.
        { isForceExtract: true },
      );
      expect(batch.items.length).toBe(1);

      const listed = await client.listMessages(space.id, session.id, 5);
      expect(listed.total).toBeGreaterThanOrEqual(1);
    } finally {
      await client.close();
    }
  });

  it('AsyncMemorySession wrapper adds and reads messages', async () => {
    // Auto-creates the session on first await, then bound add/get/list ops go
    // through the wrapper (not the raw client).
    const wrapper = new AsyncMemorySession({
      spaceId: space.id,
      actorId: 'aa-it-async-wrap',
      apiKey: space.apiKey,
      regionName: cloudRegion(),
    });
    try {
      await wrapper.addMessages([new TextMessage({ role: 'user', content: 'wrap async' })]);
      const last = await wrapper.getLastKMessages(1);
      expect(last.length).toBe(1);
      const listed = await wrapper.listMessages(5);
      expect(listed.total).toBeGreaterThanOrEqual(1);
    } finally {
      await wrapper.close();
    }
  });
});
