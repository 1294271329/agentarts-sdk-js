/**
 * Integration tests for the runtime application.
 *
 * Ported 1:1 from `tests/unit/sdk/runtime/test_app_integration.py`.
 *
 * Python drives a real ASGI transport (`httpx.AsyncClient` + `ASGITransport`);
 * here the request is handed to the endpoint directly (`_handleInvocation` /
 * `_handlePing`), which exercises routing, request parsing, response
 * serialisation and streaming without an external HTTP server. The WebSocket
 * scenario keeps Python's end-to-end shape: a real server on a temporary
 * localhost port with a `ws` client.
 *
 * Test scenarios:
 * 1. Simple sync agent - POST /invocations returns JSON result
 * 2. Simple async agent - POST /invocations returns JSON result
 * 3. Sync streaming agent - POST /invocations returns SSE stream
 * 4. Async streaming agent - POST /invocations returns SSE stream
 * 5. Agent with context - POST /invocations passes RequestContext
 * 6. Health check - GET /ping returns status
 * 7. WebSocket - bidirectional communication
 * 8. Error handling - invalid JSON, handler exceptions, no entrypoint
 * 9. LangGraph agent - real LangGraph graph wrapped by app (skip if not installed)
 */

import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { describe, it, expect, afterAll } from 'vitest';
import { WebSocket as WsClient } from 'ws';
import type { RawData } from 'ws';

import { AgentArtsRuntimeApp, StreamingResponse } from 'agentarts-sdk/sdk/runtime';

const requireFromHere = createRequire(import.meta.url);

/** Python `try: import langgraph ... HAS_LANGGRAPH = True/False`. */
function loadLangGraph(): any | null {
  try {
    requireFromHere.resolve('@langchain/langgraph');
  } catch {
    return null;
  }
  return import('@langchain/langgraph');
}

const HAS_LANGGRAPH = (() => {
  try {
    requireFromHere.resolve('@langchain/langgraph');
    return true;
  } catch {
    return false;
  }
})();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a `Request`-like object for the invocation endpoint. */
function makeRequest(
  body: any,
  headers: Record<string, string> = {},
): { headers: Record<string, string>; json: () => Promise<any> } {
  return { headers, json: async () => body };
}

/** Build a request whose body is raw text (invalid JSON scenario). */
function makeRawRequest(
  text: string,
  headers: Record<string, string> = {},
): { headers: Record<string, string>; json: () => Promise<any> } {
  return { headers, json: async () => JSON.parse(text) };
}

function jsonBody(response: { body: string | Buffer | null }): any {
  return JSON.parse(String(response.body));
}

/** Collect every SSE chunk produced by a streaming response. */
async function collectStream(response: StreamingResponse): Promise<string[]> {
  const chunks: string[] = [];
  const stream = response.contentStream as AsyncIterable<string> | Iterable<string>;
  if (typeof (stream as any)[Symbol.asyncIterator] === 'function') {
    for await (const chunk of stream as AsyncIterable<string>) {
      chunks.push(chunk);
    }
  } else {
    for (const chunk of stream as Iterable<string>) {
      chunks.push(chunk);
    }
  }
  return chunks;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const port = (server.address() as AddressInfo).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

const openServers: Server[] = [];

/** Start `app` on a temporary localhost port and track it for teardown. */
async function startServer(app: AgentArtsRuntimeApp): Promise<{ server: Server; port: number }> {
  const port = await freePort();
  const server = app.run('127.0.0.1', port);
  openServers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once('listening', () => resolve());
    server.once('error', reject);
  });
  return { server, port };
}

function closeServer(server: Server): Promise<void> {
  const index = openServers.indexOf(server);
  if (index >= 0) {
    openServers.splice(index, 1);
  }
  return new Promise<void>((resolve) => server.close(() => resolve()));
}

/** Wait for the next JSON message on a `ws` client. */
function nextMessage(client: WsClient, timeoutMs = 10_000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Timed out waiting for a WebSocket message')),
      timeoutMs,
    );
    client.once('message', (data: RawData) => {
      clearTimeout(timer);
      resolve(JSON.parse(data.toString()));
    });
    client.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

/** Outcome of a WebSocket handshake: `open`, `error`, `close` or `rejected`. */
function connectOutcome(url: string, timeoutMs = 10_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = new WsClient(url);
    let settled = false;
    const finish = (value: string): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      try {
        client.terminate();
      } catch {
        // Socket already gone.
      }
      resolve(value);
    };
    const timer = setTimeout(
      () => reject(new Error('Timed out waiting for the WebSocket handshake')),
      timeoutMs,
    );
    client.once('open', () => finish('open'));
    client.once('error', () => finish('error'));
    client.once('close', () => finish('close'));
    client.once('unexpected-response', () => finish('rejected'));
  });
}

/** Python `RuntimeError` counterpart, so `errorName()` reports the same class. */
class AppRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuntimeError';
  }
}

afterAll(async () => {
  for (const server of [...openServers]) {
    await closeServer(server);
  }
});

// ---------------------------------------------------------------------------
// Fixtures (Python `@pytest.fixture`)
// ---------------------------------------------------------------------------

/** Create an app with a simple sync entrypoint. */
function syncApp(): AgentArtsRuntimeApp {
  const app = new AgentArtsRuntimeApp();
  app.entrypoint((payload) => ({
    echo: payload?.['input'] ?? '',
    processed: true,
  }));
  return app;
}

/** Create an app with an async entrypoint. */
function asyncApp(): AgentArtsRuntimeApp {
  const app = new AgentArtsRuntimeApp();
  app.entrypoint(async (payload) => {
    await sleep(10);
    return { echo: payload?.['input'] ?? '', async: true };
  });
  return app;
}

/** Create an app with a sync generator entrypoint. */
function streamingApp(): AgentArtsRuntimeApp {
  const app = new AgentArtsRuntimeApp();
  app.entrypoint(function* handle(payload) {
    for (let i = 0; i < 3; i += 1) {
      yield { chunk: i, input: payload?.['input'] ?? '' };
    }
  });
  return app;
}

/** Create an app with an async generator entrypoint. */
function asyncStreamingApp(): AgentArtsRuntimeApp {
  const app = new AgentArtsRuntimeApp();
  app.entrypoint(async function* handle(payload) {
    for (let i = 0; i < 3; i += 1) {
      await sleep(10);
      yield { chunk: i, input: payload?.['input'] ?? '' };
    }
  });
  return app;
}

/** Create an app whose handler accepts a RequestContext. */
function contextApp(): AgentArtsRuntimeApp {
  const app = new AgentArtsRuntimeApp();
  app.entrypoint((payload, context) => ({
    session_id: context!.sessionId,
    request_id: context!.requestId,
    input: payload?.['input'] ?? '',
  }));
  return app;
}

/** Create an app whose handler always raises. */
function errorApp(): AgentArtsRuntimeApp {
  const app = new AgentArtsRuntimeApp();
  app.entrypoint(() => {
    throw new AppRuntimeError('Intentional failure for testing');
  });
  return app;
}

/** Create an app with a WebSocket handler. */
function wsApp(): AgentArtsRuntimeApp {
  const app = new AgentArtsRuntimeApp();
  app.websocket(async (websocket) => {
    await websocket.accept();
    try {
      for (;;) {
        const data = await websocket.receiveJson();
        await websocket.sendJson({ reply: data?.['message'] ?? '' });
      }
    } catch {
      // Client disconnected.
    }
  });
  return app;
}

// ---------------------------------------------------------------------------
// 1. Simple sync agent
// ---------------------------------------------------------------------------

describe('TestSyncAgentIntegration', () => {
  it('invocation returns json', async () => {
    const app = syncApp();

    const response = await app._handleInvocation(makeRequest({ input: 'hello' }));

    expect(response.statusCode).toBe(200);
    const body = jsonBody(response);
    expect(body['echo']).toBe('hello');
    expect(body['processed']).toBe(true);
  });

  it('invocation empty payload', async () => {
    const app = syncApp();

    const response = await app._handleInvocation(makeRequest({}));

    expect(response.statusCode).toBe(200);
    const body = jsonBody(response);
    expect(body['processed']).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. Simple async agent
// ---------------------------------------------------------------------------

describe('TestAsyncAgentIntegration', () => {
  it('invocation returns json', async () => {
    const app = asyncApp();

    const response = await app._handleInvocation(makeRequest({ input: 'world' }));

    expect(response.statusCode).toBe(200);
    const body = jsonBody(response);
    expect(body['echo']).toBe('world');
    expect(body['async']).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. Sync streaming agent
// ---------------------------------------------------------------------------

describe('TestSyncStreamingIntegration', () => {
  it('invocation returns sse stream', async () => {
    const app = streamingApp();

    const response = await app._handleInvocation(makeRequest({ input: 'stream' }));

    expect(response.statusCode).toBe(200);
    expect(response).toBeInstanceOf(StreamingResponse);
    const streaming = response as StreamingResponse;
    // The HTTP layer derives `content-type: text/event-stream; charset=utf-8`.
    expect(streaming.mediaType).toBe('text/event-stream');

    const text = (await collectStream(streaming)).join('');
    const lines = text
      .trim()
      .split('\n')
      .filter((line) => line.startsWith('data: '));
    expect(lines.length).toBe(3);

    lines.forEach((line, index) => {
      const data = JSON.parse(line.replace('data: ', ''));
      expect(data['chunk']).toBe(index);
      expect(data['input']).toBe('stream');
    });
  });
});

// ---------------------------------------------------------------------------
// 4. Async streaming agent
// ---------------------------------------------------------------------------

describe('TestAsyncStreamingIntegration', () => {
  it('invocation returns sse stream', async () => {
    const app = asyncStreamingApp();

    const response = await app._handleInvocation(makeRequest({ input: 'astream' }));

    expect(response.statusCode).toBe(200);

    const text = (await collectStream(response as StreamingResponse)).join('');
    const lines = text
      .trim()
      .split('\n')
      .filter((line) => line.startsWith('data: '));
    expect(lines.length).toBe(3);

    lines.forEach((line, index) => {
      const data = JSON.parse(line.replace('data: ', ''));
      expect(data['chunk']).toBe(index);
    });
  });
});

// ---------------------------------------------------------------------------
// 5. Agent with context
// ---------------------------------------------------------------------------

describe('TestContextIntegration', () => {
  it('invocation passes session header', async () => {
    const app = contextApp();

    const response = await app._handleInvocation(
      makeRequest({ input: 'ctx' }, { 'x-hw-agentarts-session-id': 'session-int-001' }),
    );

    expect(response.statusCode).toBe(200);
    const body = jsonBody(response);
    expect(body['session_id']).toBe('session-int-001');
    expect(body['input']).toBe('ctx');
    expect(body['request_id']).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 6. Health check
// ---------------------------------------------------------------------------

describe('TestPingIntegration', () => {
  it('ping returns healthy', async () => {
    const app = syncApp();

    const response = await app._handlePing({ headers: {} });

    expect(response.statusCode).toBe(200);
    expect(jsonBody(response)['status']).toBe('Healthy');
  });

  it('ping with custom handler', async () => {
    const app = new AgentArtsRuntimeApp();

    app.entrypoint(() => ({ ok: true }));
    app.ping(() => 'HealthyBusy');

    const response = await app._handlePing({ headers: {} });

    expect(response.statusCode).toBe(200);
    expect(jsonBody(response)['status']).toBe('HealthyBusy');
  });

  it('ping with running async task', async () => {
    const app = new AgentArtsRuntimeApp();

    app.entrypoint(() => ({ ok: true }));

    let releaseTask: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      releaseTask = resolve;
    });

    const slowTask = app.asyncTask(async function slowTask() {
      await gate;
    });

    // Python starts the task with `asyncio.create_task` and cancels it in the
    // `finally` block; here the task is released instead of cancelled.
    const taskPromise = slowTask();
    try {
      const response = await app._handlePing({ headers: {} });

      expect(response.statusCode).toBe(200);
      expect(jsonBody(response)['status']).toBe('HealthyBusy');
    } finally {
      releaseTask!();
      await taskPromise;
    }
  });
});

// ---------------------------------------------------------------------------
// 7. WebSocket
// ---------------------------------------------------------------------------

describe('TestWebSocketIntegration', () => {
  it('websocket echo', async () => {
    const app = wsApp();
    const { server, port } = await startServer(app);
    const client = new WsClient(`ws://127.0.0.1:${port}/ws`);

    try {
      await new Promise<void>((resolve, reject) => {
        client.once('open', () => resolve());
        client.once('error', reject);
      });

      client.send(JSON.stringify({ message: 'hello ws' }));
      expect((await nextMessage(client))['reply']).toBe('hello ws');

      client.send(JSON.stringify({ message: 'second' }));
      expect((await nextMessage(client))['reply']).toBe('second');
    } finally {
      await new Promise<void>((resolve) => {
        client.once('close', () => resolve());
        client.close();
      });
      await closeServer(server);
    }
  });
});

// ---------------------------------------------------------------------------
// 8. Error handling
// ---------------------------------------------------------------------------

describe('TestErrorHandlingIntegration', () => {
  it('no entrypoint returns 404', async () => {
    const app = new AgentArtsRuntimeApp();

    const response = await app._handleInvocation(makeRequest({ input: 'test' }));

    expect(response.statusCode).toBe(404);
    const body = jsonBody(response);
    expect(String(body['error'])).toContain('No entrypoint');
  });

  it('invalid json returns 400', async () => {
    const app = syncApp();

    const response = await app._handleInvocation(
      makeRawRequest('not json at all', { 'content-type': 'application/json' }),
    );

    expect(response.statusCode).toBe(400);
    const body = jsonBody(response);
    expect(body['error']).toBe('Invalid JSON payload');
  });

  it('handler exception returns 500', async () => {
    const app = errorApp();

    const response = await app._handleInvocation(makeRequest({ input: 'test' }));

    expect(response.statusCode).toBe(500);
    const body = jsonBody(response);
    expect(body['error']).toBe('RuntimeError');
    expect(String(body['message'])).toContain('Intentional failure');
  });

  it('websocket no handler closes', async () => {
    const app = new AgentArtsRuntimeApp();
    const { server, port } = await startServer(app);

    try {
      const outcome = await connectOutcome(`ws://127.0.0.1:${port}/ws`);
      expect(outcome).not.toBe('open');
    } finally {
      await closeServer(server);
    }
  });
});

// ---------------------------------------------------------------------------
// 9. LangGraph agent (skip if langgraph not installed)
// ---------------------------------------------------------------------------

describe.skipIf(!HAS_LANGGRAPH)('TestLangGraphAgentIntegration', () => {
  it('langgraph agent invocation', async () => {
    const langgraph = await loadLangGraph();
    const { Annotation, StateGraph, START, END } = langgraph;

    const AgentState = Annotation.Root({
      // Python's TypedDict channels overwrite by default; the graph node
      // returns the full list, exactly like the original test.
      messages: Annotation({
        reducer: (_left: string[], right: string[]) => right,
        default: () => [],
      }),
      result: Annotation({
        reducer: (_left: string, right: string) => right,
        default: () => '',
      }),
    });

    const nodeA = (state: any) => ({
      messages: [...state.messages, 'node_a_processed'],
      result: 'processed_by_langgraph',
    });

    const builder = new StateGraph(AgentState)
      .addNode('a', nodeA)
      .addEdge(START, 'a')
      .addEdge('a', END);
    const graph = builder.compile();

    const app = new AgentArtsRuntimeApp();

    app.entrypoint(async (payload) => {
      const inputData = payload?.['input'] ?? '';
      const result = await graph.invoke({ messages: [inputData], result: '' });
      return {
        framework: 'langgraph',
        result: result['result'],
        messages: result['messages'],
      };
    });

    const response = await app._handleInvocation(makeRequest({ input: 'hello langgraph' }));

    expect(response.statusCode).toBe(200);
    const body = jsonBody(response);
    expect(body['framework']).toBe('langgraph');
    expect(body['result']).toBe('processed_by_langgraph');
    expect(body['messages']).toContain('node_a_processed');
  });

  it('langgraph agent with ping', async () => {
    const langgraph = await loadLangGraph();
    const { Annotation, StateGraph, START, END } = langgraph;

    const State = Annotation.Root({
      query: Annotation({
        reducer: (_left: string, right: string) => right,
        default: () => '',
      }),
      answer: Annotation({
        reducer: (_left: string, right: string) => right,
        default: () => '',
      }),
    });

    const responder = (state: any) => ({
      answer: `Response to: ${state.query}`,
    });

    const builder = new StateGraph(State)
      .addNode('respond', responder)
      .addEdge(START, 'respond')
      .addEdge('respond', END);
    const graph = builder.compile();

    const app = new AgentArtsRuntimeApp();

    app.entrypoint(async (payload) => {
      const result = await graph.invoke({ query: payload?.['query'] ?? '', answer: '' });
      return { answer: result['answer'] };
    });

    app.ping(() => 'Healthy');

    const pingResponse = await app._handlePing({ headers: {} });
    expect(pingResponse.statusCode).toBe(200);
    expect(jsonBody(pingResponse)['status']).toBe('Healthy');

    const invokeResponse = await app._handleInvocation(makeRequest({ query: 'test query' }));
    expect(invokeResponse.statusCode).toBe(200);
    expect(jsonBody(invokeResponse)['answer']).toBe('Response to: test query');
  });
});
