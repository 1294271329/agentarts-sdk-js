/**
 * Local runtime-app tests — no cloud, no credentials (default tier).
 *
 * Ported 1:1 from `tests/integration/test_runtime_app_local.py`.
 *
 * Python drives the ASGI app through Starlette's `TestClient`; the Node app is
 * a real HTTP/WebSocket server, so each test starts `app.run('127.0.0.1', port)`
 * on a free port, exercises `/ping`, `/invocations` (JSON + SSE streaming +
 * error paths) and `/ws`, then closes the server.
 */

import { once } from 'node:events';
import type { Server } from 'node:http';

import { describe, it, expect } from 'vitest';
import { WebSocket as WsClient } from 'ws';

import { AgentArtsRuntimeApp, PingStatus } from 'agentarts-sdk';
import { SESSION_HEADER } from 'agentarts-sdk/sdk/runtime/model';

import { findFreePort } from './_helpers.js';

interface RunningApp {
  app: AgentArtsRuntimeApp;
  baseUrl: string;
  close(): Promise<void>;
}

/** Start `app` on a free localhost port and return its base URL + closer. */
async function startLocalApp(
  app: AgentArtsRuntimeApp = new AgentArtsRuntimeApp(),
): Promise<RunningApp> {
  const port = await findFreePort();
  const server: Server = app.run('127.0.0.1', port);
  if (!server.listening) {
    await once(server, 'listening');
  }
  return {
    app,
    baseUrl: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}

/** Run `fn` against a freshly started app, closing the server afterwards. */
async function withLocalApp(
  app: AgentArtsRuntimeApp,
  fn: (running: RunningApp) => Promise<void>,
): Promise<void> {
  const running = await startLocalApp(app);
  try {
    await fn(running);
  } finally {
    await running.close();
  }
}

/** POST a JSON body to `/invocations`. */
function invoke(baseUrl: string, body: unknown): Promise<Response> {
  return fetch(`${baseUrl}/invocations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('runtime app (local, no credentials)', () => {
  // -------------------------------------------------------------------------
  // /ping
  // -------------------------------------------------------------------------

  it('GET /ping reports Healthy by default', async () => {
    const app = new AgentArtsRuntimeApp();
    await withLocalApp(app, async ({ baseUrl }) => {
      const response = await fetch(`${baseUrl}/ping`);
      expect(response.status).toBe(200);
      const body = (await response.json()) as Record<string, any>;
      expect(body['status']).toBe(PingStatus.HEALTHY);
      expect('time_of_last_update' in body).toBe(true);
    });
  });

  it('GET /ping honours forcePingStatus', async () => {
    const app = new AgentArtsRuntimeApp();
    app.forcePingStatus(PingStatus.UNHEALTHY);
    await withLocalApp(app, async ({ baseUrl }) => {
      const response = await fetch(`${baseUrl}/ping`);
      expect(response.status).toBe(200);
      expect(((await response.json()) as Record<string, any>)['status']).toBe(PingStatus.UNHEALTHY);
    });
  });

  it('GET /ping uses a custom ping handler', async () => {
    const app = new AgentArtsRuntimeApp();
    app.ping(() => PingStatus.HEALTHY_BUSY);
    await withLocalApp(app, async ({ baseUrl }) => {
      const response = await fetch(`${baseUrl}/ping`);
      expect(response.status).toBe(200);
      expect(((await response.json()) as Record<string, any>)['status']).toBe(
        PingStatus.HEALTHY_BUSY,
      );
    });
  });

  // -------------------------------------------------------------------------
  // /invocations — happy path + error paths
  // -------------------------------------------------------------------------

  it('POST /invocations returns the handler result and echoes the session header', async () => {
    const app = new AgentArtsRuntimeApp();
    app.entrypoint((payload: any) => ({ echo: payload.message }));
    await withLocalApp(app, async ({ baseUrl }) => {
      const response = await invoke(baseUrl, { message: 'hello' });
      expect(response.status).toBe(200);
      expect(((await response.json()) as Record<string, any>)['echo']).toBe('hello');
      // The session header is echoed back on the response.
      expect(response.headers.has(SESSION_HEADER)).toBe(true);
    });
  });

  it('POST /invocations without an entrypoint returns 404', async () => {
    const app = new AgentArtsRuntimeApp();
    await withLocalApp(app, async ({ baseUrl }) => {
      const response = await invoke(baseUrl, { message: 'hi' });
      expect(response.status).toBe(404);
    });
  });

  it('POST /invocations with invalid JSON returns 400', async () => {
    const app = new AgentArtsRuntimeApp();
    app.entrypoint(() => ({ ok: true }));
    await withLocalApp(app, async ({ baseUrl }) => {
      const response = await fetch(`${baseUrl}/invocations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{not json',
      });
      expect(response.status).toBe(400);
    });
  });

  it('POST /invocations returns 500 when the handler raises', async () => {
    const app = new AgentArtsRuntimeApp();
    app.entrypoint(() => {
      throw new Error('boom');
    });
    await withLocalApp(app, async ({ baseUrl }) => {
      const response = await invoke(baseUrl, { x: 1 });
      expect(response.status).toBe(500);
    });
  });

  it('POST /invocations streams a sync generator as SSE', async () => {
    const app = new AgentArtsRuntimeApp();
    app.entrypoint(function* () {
      for (const word of ['a', 'b', 'c']) {
        yield { token: word };
      }
    });
    await withLocalApp(app, async ({ baseUrl }) => {
      const response = await invoke(baseUrl, {});
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type') ?? '').toContain('text/event-stream');
      const text = await response.text();
      // Each yielded item is serialised into an SSE `data:` line.
      expect((text.match(/data:/g) ?? []).length).toBeGreaterThanOrEqual(3);
      expect(text).toContain('"a"');
      expect(text).toContain('"c"');
    });
  });

  it('POST /invocations streams an async generator as SSE', async () => {
    const app = new AgentArtsRuntimeApp();
    app.entrypoint(async function* () {
      for (const word of ['x', 'y']) {
        yield { token: word };
      }
    });
    await withLocalApp(app, async ({ baseUrl }) => {
      const response = await invoke(baseUrl, {});
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type') ?? '').toContain('text/event-stream');
      const text = await response.text();
      expect((text.match(/data:/g) ?? []).length).toBeGreaterThanOrEqual(2);
    });
  });

  // -------------------------------------------------------------------------
  // /ws
  // -------------------------------------------------------------------------

  it('WS /ws without a handler is rejected (Python closes with 1011)', async () => {
    const app = new AgentArtsRuntimeApp();
    await withLocalApp(app, async ({ baseUrl }) => {
      const wsUrl = baseUrl.replace('http://', 'ws://') + '/ws';
      const outcome = await new Promise<string>((resolve, reject) => {
        const socket = new WsClient(wsUrl);
        const timer = setTimeout(() => {
          socket.terminate();
          reject(new Error('websocket neither opened nor failed'));
        }, 5_000);
        socket.once('open', () => {
          clearTimeout(timer);
          socket.close();
          reject(new Error('websocket unexpectedly opened without a handler'));
        });
        socket.once('error', (error: Error) => {
          clearTimeout(timer);
          resolve(`error: ${error.message}`);
        });
        socket.once('close', (code: number) => {
          clearTimeout(timer);
          resolve(`close: ${code}`);
        });
      });
      // The Node runtime rejects the upgrade with 403; Python's ASGI app accepts
      // and closes 1011. Both mean "no handler, connection unusable".
      expect(outcome).toMatch(/error:|close: (1011|1006)/);
    });
  });

  it('WS /ws echoes through a custom handler', async () => {
    const app = new AgentArtsRuntimeApp();
    app.websocket(async (websocket) => {
      await websocket.accept();
      try {
        for (;;) {
          const data = await websocket.receiveJson();
          await websocket.sendJson({ echo: data });
        }
      } catch {
        // Connection closed — the handler owns the lifecycle.
      }
    });

    await withLocalApp(app, async ({ baseUrl }) => {
      const wsUrl = baseUrl.replace('http://', 'ws://') + '/ws';
      const received = await new Promise<any>((resolve, reject) => {
        const socket = new WsClient(wsUrl);
        const timer = setTimeout(() => {
          socket.terminate();
          reject(new Error('no websocket echo received'));
        }, 10_000);
        socket.once('open', () => {
          socket.send(JSON.stringify({ msg: 'ping' }));
        });
        socket.once('message', (raw: any) => {
          clearTimeout(timer);
          socket.close();
          resolve(JSON.parse(raw.toString()));
        });
        socket.once('error', (error: Error) => {
          clearTimeout(timer);
          reject(error);
        });
      });
      expect(received).toEqual({ echo: { msg: 'ping' } });
    });
  });
});
