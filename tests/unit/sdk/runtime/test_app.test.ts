/**
 * Comprehensive unit tests for the runtime application module.
 *
 * Ported 1:1 from `tests/unit/sdk/runtime/test_app.py`.
 *
 * Tests cover:
 * - Decorators (entrypoint, ping, websocket, async_task)
 * - Task management (_addTask, _completeTask, hasRunningTasks)
 * - Request context helpers (_buildRequestContext, _taskContext)
 * - Invocation endpoint (_handleInvocation, _invokeHandler)
 * - Serialization (_safeSerializeToJsonString, _convertToSse)
 * - Stream generators (_syncStreamHandler, _asyncStreamHandler)
 * - Ping endpoint (_handlePing, getCurrentPingStatus, forcePingStatus)
 * - WebSocket endpoint (_handleWebsocket)
 *
 * Python's `MagicMock(spec=Request)` request objects are plain objects here
 * (`{ headers, json() }`), which is exactly the surface the endpoints consume.
 * `AsyncMock` becomes a vitest function, and Python's thread-pool context
 * copying becomes `AsyncLocalStorage` scopes (`runInNewContext`).
 */

import * as http from 'node:http';
import type { AddressInfo } from 'node:net';

import { describe, it, expect, vi, afterEach } from 'vitest';

import {
  AgentArtsRuntimeApp,
  AgentArtsRuntimeContext,
  PingStatus,
  RequestContext,
  WebSocketDisconnect,
} from 'agentarts-sdk/sdk/runtime';

afterEach(() => {
  AgentArtsRuntimeContext.clear();
});

/** Python `ValueError` counterpart, so `errorName()` reports the same class. */
class ValueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValueError';
  }
}

/** Build a `Request`-like object for the invocation endpoint (Python `MagicMock(spec=Request)`). */
function makeRequest(
  body: any,
  headers: Record<string, string> = {},
): { headers: Record<string, string>; json: () => Promise<any> } {
  return { headers, json: async () => body };
}

/** JSON body of a (non-streaming) runtime response. */
function jsonBody(response: { body: string | Buffer | null }): any {
  return JSON.parse(String(response.body));
}

/** Bind a throwaway server to obtain a free localhost port. */
async function freePort(): Promise<number> {
  const server = http.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const port = (server.address() as AddressInfo).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

describe('TestAgentArtsRuntimeAppInit', () => {
  it('init default values', () => {
    const app = new AgentArtsRuntimeApp();
    expect(app.handlers).toEqual({});
    expect(app._pingHandler).toBeNull();
    expect(app._wsHandler).toBeNull();
    expect(app.protocol).toBe('http');
    expect(app._activeTasks.size).toBe(0);
    expect(app._forcePingStatus).toBeNull();
  });

  it('init custom protocol', () => {
    const app = new AgentArtsRuntimeApp({ protocol: 'https' });
    expect(app.protocol).toBe('https');
  });

  it('init debug mode', () => {
    const app = new AgentArtsRuntimeApp({ debug: true });
    expect(app.debug).toBe(true);
  });
});

describe('TestDecorators', () => {
  it('entrypoint decorator', () => {
    const app = new AgentArtsRuntimeApp();

    function myHandler(payload: any) {
      return { result: 'ok' };
    }

    const handler = app.entrypoint(myHandler);

    expect(app.handlers['main']).toBe(handler);
    expect(typeof (handler as any).run).toBe('function');
    expect(handler.name).toBe('myHandler');
  });

  it('ping decorator', () => {
    const app = new AgentArtsRuntimeApp();

    function healthCheck() {
      return 'Healthy';
    }

    const handler = app.ping(healthCheck);

    expect(app._pingHandler).toBe(handler);
  });

  it('websocket decorator', () => {
    const app = new AgentArtsRuntimeApp();

    const wsHandler = async () => {};

    const registered = app.websocket(wsHandler);

    expect(app._wsHandler).toBe(registered);
  });

  it('async task decorator sync function raises', () => {
    const app = new AgentArtsRuntimeApp();

    const syncFunc = () => {};

    expect(() => app.asyncTask(syncFunc as any)).toThrow(/must be used with async functions/);
  });

  it('async task decorator', async () => {
    const app = new AgentArtsRuntimeApp();

    const backgroundJob = app.asyncTask(async (payload: any) => ({ result: payload }));

    expect(backgroundJob._isAsyncTask).toBe(true);

    const result = await backgroundJob({ input: 'test' });
    expect(result).toEqual({ result: { input: 'test' } });
    expect(app.hasRunningTasks()).toBe(false);
  });

  it('async task decorator with exception', async () => {
    const app = new AgentArtsRuntimeApp();

    const failingTask = app.asyncTask(async () => {
      throw new ValueError('Task failed');
    });

    await expect(failingTask()).rejects.toThrow('Task failed');
    expect(app.hasRunningTasks()).toBe(false);
  });
});

describe('TestTaskManagement', () => {
  it('add task', () => {
    const app = new AgentArtsRuntimeApp();

    const taskId = app._addTask('test_task', { key: 'value' });

    expect(typeof taskId).toBe('number');
    expect(app._activeTasks.has(taskId)).toBe(true);
    expect(app._activeTasks.get(taskId)!.name).toBe('test_task');
    expect(app._activeTasks.get(taskId)!.metadata).toEqual({ key: 'value' });
  });

  it('add task multiple', () => {
    const app = new AgentArtsRuntimeApp();

    const taskId1 = app._addTask('task1');
    const taskId2 = app._addTask('task2');

    expect(taskId1).not.toBe(taskId2);
    expect(app._activeTasks.size).toBe(2);
  });

  it('complete task', () => {
    const app = new AgentArtsRuntimeApp();

    const taskId = app._addTask('test_task');
    const result = app._completeTask(taskId);

    expect(result).toBe(true);
    expect(app._activeTasks.has(taskId)).toBe(false);
  });

  it('complete task not found', () => {
    const app = new AgentArtsRuntimeApp();

    const result = app._completeTask(99999);

    expect(result).toBe(false);
  });

  it('has running tasks', () => {
    const app = new AgentArtsRuntimeApp();

    expect(app.hasRunningTasks()).toBe(false);

    app._addTask('running_task');
    expect(app.hasRunningTasks()).toBe(true);
  });

  it('has running tasks after complete', () => {
    const app = new AgentArtsRuntimeApp();

    const taskId = app._addTask('test_task');
    expect(app.hasRunningTasks()).toBe(true);

    app._completeTask(taskId);
    expect(app.hasRunningTasks()).toBe(false);
  });
});

describe('TestBuildContext', () => {
  it('build request context with headers', () => {
    const app = new AgentArtsRuntimeApp();

    const mockRequest = {
      headers: {
        'X-HW-AgentGateway-Workload-Access-Token': 'test-token',
        'x-hw-agentarts-session-id': 'session-123',
        'X-Hw-AgentArts-Runtime-User-Id': 'user-456',
        'X-Request-Id': 'req-789',
      } as Record<string, string>,
    };

    const context = app._buildRequestContext(mockRequest);

    expect(context.sessionId).toBe('session-123');
    expect(context.requestId).toBe('req-789');
    expect(context.request).toBe(mockRequest);
  });

  it('build request context generates request id', () => {
    const app = new AgentArtsRuntimeApp();

    const mockRequest = { headers: {} as Record<string, string> };

    const context = app._buildRequestContext(mockRequest);

    expect(context.requestId).not.toBeNull();
    expect(String(context.requestId).length).toBe(36); // UUID format
  });

  it('build request context sets runtime context', () => {
    const app = new AgentArtsRuntimeApp();

    const mockRequest = {
      headers: {
        'X-HW-AgentGateway-Workload-Access-Token': 'workload-token',
        'x-hw-agentarts-session-id': 'session-abc',
        'X-HW-AgentGateway-User-Id': 'user-xyz',
      } as Record<string, string>,
    };

    app._buildRequestContext(mockRequest);

    expect(AgentArtsRuntimeContext.getWorkloadAccessToken()).toBe('workload-token');
    expect(AgentArtsRuntimeContext.getSessionId()).toBe('session-abc');
    expect(AgentArtsRuntimeContext.getUserId()).toBe('user-xyz');

    AgentArtsRuntimeContext.clear();
  });
});

describe('TestTaskContext', () => {
  it('task context with context param', () => {
    const app = new AgentArtsRuntimeApp();

    const handler = (payload: any, context: any) => [payload, context];

    // Type annotations are stripped by the transformer, so the source-based
    // parameter introspection sees the plain identifiers `payload`/`context`.
    expect(app._taskContext((payload, context) => [payload, context])).toBe(true);
    expect(app._taskContext(handler)).toBe(true);
  });

  it('task context without context param', () => {
    const app = new AgentArtsRuntimeApp();

    const handler = (payload: any) => payload;

    expect(app._taskContext((payload) => payload)).toBe(false);
    expect(app._taskContext(handler)).toBe(false);
  });

  it('task context wrong param name', () => {
    const app = new AgentArtsRuntimeApp();

    const handler = (payload: any, other: any) => [payload, other];

    expect(app._taskContext(handler)).toBe(false);
  });
});

describe('TestPingTaskContext', () => {
  it('ping task context with context param', () => {
    const app = new AgentArtsRuntimeApp();

    const handler = (context: any) => context;

    expect(app._pingTaskContext(handler)).toBe(true);
  });

  it('ping task context without context param', () => {
    const app = new AgentArtsRuntimeApp();

    const handler = () => 'Healthy';

    expect(app._pingTaskContext(handler)).toBe(false);
  });

  it('ping task context wrong param name', () => {
    const app = new AgentArtsRuntimeApp();

    const handler = (other: any) => other;

    expect(app._pingTaskContext(handler)).toBe(false);
  });

  it('ping task context with multiple params', () => {
    const app = new AgentArtsRuntimeApp();

    const handler = (context: any, extra: any) => [context, extra];

    expect(app._pingTaskContext(handler as any)).toBe(true);
  });
});

describe('TestSerialization', () => {
  it('safe serialize to json string dict', () => {
    const app = new AgentArtsRuntimeApp();

    const result = app._safeSerializeToJsonString({ key: 'value' });
    expect(JSON.parse(result)).toEqual({ key: 'value' });
  });

  it('safe serialize to json string list', () => {
    const app = new AgentArtsRuntimeApp();

    const result = app._safeSerializeToJsonString([1, 2, 3]);
    expect(JSON.parse(result)).toEqual([1, 2, 3]);
  });

  it('safe serialize to json string with datetime', () => {
    const app = new AgentArtsRuntimeApp();

    const now = new Date('2024-01-01T12:00:00.000Z');
    const result = app._safeSerializeToJsonString({ time: now });

    const parsed = JSON.parse(result);
    expect(String(parsed.time)).toContain('2024-01-01');
  });

  it('convert to sse', () => {
    const app = new AgentArtsRuntimeApp();

    const result = app._convertToSse({ data: 'test' });

    // Python returns bytes; the Node.js port returns the same UTF-8 text.
    expect(typeof result).toBe('string');
    expect(result.startsWith('data: ')).toBe(true);
    expect(result.endsWith('\n\n')).toBe(true);
  });
});

describe('TestSyncStreamHandler', () => {
  it('sync stream handler', () => {
    const app = new AgentArtsRuntimeApp();

    function* generator() {
      yield { chunk: 1 };
      yield { chunk: 2 };
    }

    const results = [...app._syncStreamHandler(generator())];

    expect(results.length).toBe(2);
    expect(results.every((chunk) => chunk.startsWith('data: '))).toBe(true);
    expect(results.every((chunk) => chunk.endsWith('\n\n'))).toBe(true);
  });

  it('sync stream handler with exception', () => {
    const app = new AgentArtsRuntimeApp();

    function* failingGenerator() {
      yield { chunk: 1 };
      throw new Error('Generator error');
    }

    const results = [...app._syncStreamHandler(failingGenerator())];

    expect(results.length).toBe(2);
    const errorData = JSON.parse(results[1].replace('data: ', '').trim());
    expect(errorData.error).toBeDefined();
  });
});

describe('TestAsyncStreamHandler', () => {
  it('async stream handler', async () => {
    const app = new AgentArtsRuntimeApp();

    async function* asyncGenerator() {
      yield { chunk: 1 };
      yield { chunk: 2 };
    }

    const results: string[] = [];
    for await (const chunk of app._asyncStreamHandler(asyncGenerator())) {
      results.push(chunk);
    }

    expect(results.length).toBe(2);
    expect(results.every((chunk) => chunk.startsWith('data: '))).toBe(true);
  });

  it('async stream handler with exception', async () => {
    const app = new AgentArtsRuntimeApp();

    async function* failingAsyncGenerator() {
      yield { chunk: 1 };
      throw new Error('Async generator error');
    }

    const results: string[] = [];
    for await (const chunk of app._asyncStreamHandler(failingAsyncGenerator())) {
      results.push(chunk);
    }

    expect(results.length).toBe(2);
    const errorData = JSON.parse(results[1].replace('data: ', '').trim());
    expect(errorData.error).toBeDefined();
  });
});

describe('TestHandleInvocation', () => {
  it('handle invocation no entrypoint', async () => {
    const app = new AgentArtsRuntimeApp();

    const response = await app._handleInvocation(makeRequest({ input: 'test' }));

    expect(response.statusCode).toBe(404);
    expect(jsonBody(response)).toEqual({ error: 'No entrypoint defined' });
  });

  it('handle invocation success', async () => {
    const app = new AgentArtsRuntimeApp();

    app.entrypoint((payload) => ({ result: String(payload['input']).toUpperCase() }));

    const response = await app._handleInvocation(makeRequest({ input: 'test' }));

    expect(response.statusCode).toBe(200);
    expect(jsonBody(response)).toEqual({ result: 'TEST' });
  });

  it('handle invocation async handler', async () => {
    const app = new AgentArtsRuntimeApp();

    app.entrypoint(async (payload) => ({ result: String(payload['input']).repeat(2) }));

    const response = await app._handleInvocation(makeRequest({ input: 'ab' }));

    expect(response.statusCode).toBe(200);
    expect(jsonBody(response)).toEqual({ result: 'abab' });
  });

  it('handle invocation invalid json', async () => {
    const app = new AgentArtsRuntimeApp();

    app.entrypoint(() => ({ result: 'ok' }));

    const request = {
      headers: {} as Record<string, string>,
      json: async () => {
        throw new SyntaxError('test: test');
      },
    };

    const response = await app._handleInvocation(request);

    expect(response.statusCode).toBe(400);
    expect(jsonBody(response)['error']).toBe('Invalid JSON payload');
  });

  it('handle invocation handler exception', async () => {
    const app = new AgentArtsRuntimeApp();

    app.entrypoint(() => {
      throw new ValueError('Handler error');
    });

    const response = await app._handleInvocation(makeRequest({ input: 'test' }));

    expect(response.statusCode).toBe(500);
    expect(jsonBody(response)['error']).toBe('ValueError');
  });
});

describe('TestHandlePing', () => {
  it('handle ping default healthy', async () => {
    const app = new AgentArtsRuntimeApp();

    const response = await app._handlePing({ headers: {} });

    expect(response.statusCode).toBe(200);
    expect(jsonBody(response)['status']).toBe('Healthy');
  });

  it('handle ping with custom handler', async () => {
    const app = new AgentArtsRuntimeApp();

    app.ping(() => 'HealthyBusy');

    const response = await app._handlePing({ headers: {} });

    expect(jsonBody(response)['status']).toBe('HealthyBusy');
  });

  it('handle ping custom handler initing', async () => {
    const app = new AgentArtsRuntimeApp();

    app.ping(() => PingStatus.INITING);

    const response = await app._handlePing({ headers: {} });

    expect(jsonBody(response)['status']).toBe('Initing');
  });

  it('handle ping handler error returns unhealthy', async () => {
    const app = new AgentArtsRuntimeApp();

    app.ping(() => {
      throw new Error('health check crashed');
    });

    const response = await app._handlePing({ headers: {} });

    expect(jsonBody(response)['status']).toBe('Unhealthy');
  });

  it('handle ping with running tasks', async () => {
    const app = new AgentArtsRuntimeApp();
    app._addTask('running_task');

    const response = await app._handlePing({ headers: {} });

    expect(jsonBody(response)['status']).toBe('HealthyBusy');
  });

  it('handle ping with context param handler', async () => {
    const app = new AgentArtsRuntimeApp();

    let receivedContext: any = null;

    app.ping((context) => {
      receivedContext = context;
      return PingStatus.HEALTHY;
    });

    const mockRequest = {
      headers: {
        'x-hw-agentarts-session-id': 'test-session-123',
        'X-Request-Id': 'req-456',
      } as Record<string, string>,
    };

    const response = await app._handlePing(mockRequest);

    expect(response.statusCode).toBe(200);
    expect(receivedContext).not.toBeNull();
    expect(receivedContext.sessionId).toBe('test-session-123');
    expect(receivedContext.requestId).toBe('req-456');
    expect(receivedContext.request).toBe(mockRequest);
  });

  it('handle ping without context param handler', async () => {
    const app = new AgentArtsRuntimeApp();

    let handlerCalled = false;

    app.ping(() => {
      handlerCalled = true;
      return PingStatus.HEALTHY;
    });

    const response = await app._handlePing({ headers: {} });

    expect(response.statusCode).toBe(200);
    expect(handlerCalled).toBe(true);
  });

  it('handle ping context with headers', async () => {
    const app = new AgentArtsRuntimeApp();

    let receivedSessionId: string | null | undefined = null;

    app.ping((context) => {
      receivedSessionId = context?.sessionId;
      return PingStatus.HEALTHY;
    });

    const mockRequest = {
      headers: {
        'X-HW-AgentGateway-Workload-Access-Token': 'workload-token',
        'x-hw-agentarts-session-id': 'session-abc',
        'X-HW-AgentGateway-User-Id': 'user-xyz',
      } as Record<string, string>,
    };

    const response = await app._handlePing(mockRequest);

    expect(response.statusCode).toBe(200);
    expect(receivedSessionId).toBe('session-abc');
    expect(AgentArtsRuntimeContext.getWorkloadAccessToken()).toBe('workload-token');
    expect(AgentArtsRuntimeContext.getSessionId()).toBe('session-abc');
    expect(AgentArtsRuntimeContext.getUserId()).toBe('user-xyz');

    AgentArtsRuntimeContext.clear();
  });
});

describe('TestGetCurrentPingStatus', () => {
  it('get current ping status healthy', () => {
    const app = new AgentArtsRuntimeApp();

    const status = app.getCurrentPingStatus();

    expect(status).toBe(PingStatus.HEALTHY);
  });

  it('get current ping status busy with tasks', () => {
    const app = new AgentArtsRuntimeApp();
    app._addTask('test_task');

    const status = app.getCurrentPingStatus();

    expect(status).toBe(PingStatus.HEALTHY_BUSY);
  });

  it('get current ping status forced', () => {
    const app = new AgentArtsRuntimeApp();
    app.forcePingStatus(PingStatus.UNHEALTHY);

    const status = app.getCurrentPingStatus();

    expect(status).toBe(PingStatus.UNHEALTHY);
  });

  it('get current ping status handler unknown string fails unhealthy', () => {
    const app = new AgentArtsRuntimeApp();

    // Wrong case - must not silently fall back to HEALTHY.
    app.ping(() => 'initing');

    expect(app.getCurrentPingStatus()).toBe(PingStatus.UNHEALTHY);
  });

  it('get current ping status handler invalid return fails unhealthy', () => {
    const app = new AgentArtsRuntimeApp();

    app.ping(() => ({ status: 'healthy' }) as any);

    expect(app.getCurrentPingStatus()).toBe(PingStatus.UNHEALTHY);
  });

  it('get current ping status transition updates timestamp', async () => {
    const app = new AgentArtsRuntimeApp();
    const state = { ready: false };

    app.ping(() => (state['ready'] ? PingStatus.HEALTHY : PingStatus.INITING));

    const before = app.getCurrentPingStatus();
    const timestampBefore = app._lastStatusUpdateTime;

    state['ready'] = true; // background loading finished
    await new Promise((resolve) => setTimeout(resolve, 5));
    const after = app.getCurrentPingStatus();

    expect(before).toBe(PingStatus.INITING);
    expect(after).toBe(PingStatus.HEALTHY);
    expect(app._lastStatusUpdateTime).toBeGreaterThan(timestampBefore);
  });

  it('get current ping status with context param handler', () => {
    const app = new AgentArtsRuntimeApp();

    let receivedContext: any = null;

    app.ping((context) => {
      receivedContext = context;
      return PingStatus.HEALTHY;
    });

    const requestContext = new RequestContext({
      sessionId: 'test-session',
      requestId: 'req-123',
      request: null,
    });

    const status = app.getCurrentPingStatus(requestContext);

    expect(status).toBe(PingStatus.HEALTHY);
    expect(receivedContext).toBe(requestContext);
  });

  it('get current ping status without context param handler', () => {
    const app = new AgentArtsRuntimeApp();

    let handlerCalled = false;

    app.ping(() => {
      handlerCalled = true;
      return PingStatus.HEALTHY;
    });

    const requestContext = new RequestContext({
      sessionId: 'test-session',
      requestId: 'req-123',
      request: null,
    });

    const status = app.getCurrentPingStatus(requestContext);

    expect(status).toBe(PingStatus.HEALTHY);
    expect(handlerCalled).toBe(true);
  });

  it('get current ping status passes none context when unavailable', () => {
    const app = new AgentArtsRuntimeApp();

    let receivedContext: any = undefined;

    app.ping((context) => {
      receivedContext = context;
      return PingStatus.HEALTHY;
    });

    const status = app.getCurrentPingStatus(null);

    expect(status).toBe(PingStatus.HEALTHY);
    expect(receivedContext).toBeNull();
  });

  it('get current ping status custom handler uses context', () => {
    const app = new AgentArtsRuntimeApp();

    app.ping((context) => {
      if (context && context.sessionId === 'healthy-session') {
        return PingStatus.HEALTHY;
      }
      return PingStatus.UNHEALTHY;
    });

    const healthyContext = new RequestContext({
      sessionId: 'healthy-session',
      requestId: 'req-1',
      request: null,
    });
    const unhealthyContext = new RequestContext({
      sessionId: 'unhealthy-session',
      requestId: 'req-2',
      request: null,
    });

    expect(app.getCurrentPingStatus(healthyContext)).toBe(PingStatus.HEALTHY);
    expect(app.getCurrentPingStatus(unhealthyContext)).toBe(PingStatus.UNHEALTHY);
  });
});

describe('TestForcePingStatus', () => {
  it('force ping status', () => {
    const app = new AgentArtsRuntimeApp();

    app.forcePingStatus(PingStatus.UNHEALTHY);

    expect(app._forcePingStatus).toBe(PingStatus.UNHEALTHY);
    expect(app.getCurrentPingStatus()).toBe(PingStatus.UNHEALTHY);
  });

  it('force ping status overrides tasks', () => {
    const app = new AgentArtsRuntimeApp();
    app._addTask('test_task');

    app.forcePingStatus(PingStatus.HEALTHY);

    expect(app.getCurrentPingStatus()).toBe(PingStatus.HEALTHY);
  });

  it('force ping status overrides custom handler', () => {
    const app = new AgentArtsRuntimeApp();

    app.ping(() => PingStatus.HEALTHY);

    app.forcePingStatus(PingStatus.INITING);
    expect(app.getCurrentPingStatus()).toBe(PingStatus.INITING);

    app.forcePingStatus(null); // clear -> handler resolution resumes
    expect(app.getCurrentPingStatus()).toBe(PingStatus.HEALTHY);
  });
});

describe('TestHandleWebsocket', () => {
  it('handle websocket no handler', async () => {
    const app = new AgentArtsRuntimeApp();

    const mockWebsocket = { headers: {} as Record<string, string>, close: vi.fn(async () => {}) };

    await app._handleWebsocket(mockWebsocket);

    expect(mockWebsocket.close).toHaveBeenCalledOnce();
    expect(mockWebsocket.close).toHaveBeenCalledWith(1011);
  });

  it('handle websocket with handler', async () => {
    const app = new AgentArtsRuntimeApp();

    app.websocket(async (websocket) => {
      await websocket.accept();
      await websocket.close();
    });

    const mockWebsocket = {
      headers: {} as Record<string, string>,
      accept: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
    };

    await app._handleWebsocket(mockWebsocket);

    expect(mockWebsocket.accept).toHaveBeenCalledOnce();
  });

  it('handle websocket disconnect', async () => {
    const app = new AgentArtsRuntimeApp();

    app.websocket(async () => {
      throw new WebSocketDisconnect();
    });

    const mockWebsocket = { headers: {} as Record<string, string> };

    await expect(app._handleWebsocket(mockWebsocket)).resolves.toBeUndefined();
  });
});

describe('TestRun', () => {
  it('run default host', () => {
    vi.stubEnv('AGENTARTS_BIND_IP', '');
    vi.stubEnv('HOST', '');
    vi.stubEnv('PORT', '');

    try {
      const app = new AgentArtsRuntimeApp();
      // The container probes look at /.dockerenv and /proc, which are not a
      // meaningful signal on every platform: pin the branch under test.
      vi.spyOn(app as any, '_isContainerEnvironment').mockReturnValue(false);

      expect((app as any)._resolveHost(null)).toBe('127.0.0.1');
      expect((app as any)._resolvePort()).toBe(8080);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('run custom host port', async () => {
    const app = new AgentArtsRuntimeApp();
    const port = await freePort();

    const server = app.run('127.0.0.1', port);
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('listening', () => resolve());
        server.once('error', reject);
      });
      const address = server.address() as AddressInfo;
      expect(address.address).toBe('127.0.0.1');
      expect(address.port).toBe(port);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('run docker environment', () => {
    const app = new AgentArtsRuntimeApp();
    vi.spyOn(app as any, '_isContainerEnvironment').mockReturnValue(true);
    vi.spyOn(app as any, '_getContainerIp').mockReturnValue(null);

    expect((app as any)._resolveHost(null)).toBe('0.0.0.0');
  });
});

describe('TestInvokeHandler', () => {
  it('invoke handler sync function', async () => {
    const app = new AgentArtsRuntimeApp();

    const syncHandler = (payload: any) => ({ result: payload['input'] });

    const context = new RequestContext({ sessionId: 'test', requestId: 'req-1', request: null });
    const result = await app._invokeHandler(syncHandler, context, false, { input: 'test' });

    expect(result).toEqual({ result: 'test' });
  });

  it('invoke handler async function', async () => {
    const app = new AgentArtsRuntimeApp();

    const asyncHandler = async (payload: any) => ({ result: payload['input'] });

    const context = new RequestContext({ sessionId: 'test', requestId: 'req-1', request: null });
    const result = await app._invokeHandler(asyncHandler, context, false, { input: 'async' });

    expect(result).toEqual({ result: 'async' });
  });

  it('invoke handler with context', async () => {
    const app = new AgentArtsRuntimeApp();

    const handlerWithContext = (payload: any, context?: RequestContext) => ({
      session: context!.sessionId,
    });

    const context = new RequestContext({
      sessionId: 'session-123',
      requestId: 'req-1',
      request: null,
    });
    const result = await app._invokeHandler(handlerWithContext, context, true, {});

    expect(result).toEqual({ session: 'session-123' });
  });

  it('invoke handler exception', async () => {
    const app = new AgentArtsRuntimeApp();

    const failingHandler = () => {
      throw new Error('Handler failed');
    };

    const context = new RequestContext({ sessionId: 'test', requestId: 'req-1', request: null });

    await expect(app._invokeHandler(failingHandler, context, false, {})).rejects.toThrow(
      'Handler failed',
    );
  });
});

describe('TestInvokeHandlerContextPropagation', () => {
  it('sync handler gets workload access token', async () => {
    const app = new AgentArtsRuntimeApp();

    const syncHandler = () => ({ token: AgentArtsRuntimeContext.getWorkloadAccessToken() });

    AgentArtsRuntimeContext.setWorkloadAccessToken('test-workload-token-123');
    try {
      const context = new RequestContext({ sessionId: 'test', requestId: 'req-1', request: null });
      const result = await app._invokeHandler(syncHandler, context, false, {});
      expect(result['token']).toBe('test-workload-token-123');
    } finally {
      AgentArtsRuntimeContext.setWorkloadAccessToken(null);
    }
  });

  it('async handler gets workload access token', async () => {
    const app = new AgentArtsRuntimeApp();

    const asyncHandler = async () => ({
      token: AgentArtsRuntimeContext.getWorkloadAccessToken(),
    });

    AgentArtsRuntimeContext.setWorkloadAccessToken('test-workload-token-456');
    try {
      const context = new RequestContext({ sessionId: 'test', requestId: 'req-1', request: null });
      const result = await app._invokeHandler(asyncHandler, context, false, {});
      expect(result['token']).toBe('test-workload-token-456');
    } finally {
      AgentArtsRuntimeContext.setWorkloadAccessToken(null);
    }
  });

  it('sync handler gets session id', async () => {
    const app = new AgentArtsRuntimeApp();

    const syncHandler = () => ({ session_id: AgentArtsRuntimeContext.getSessionId() });

    AgentArtsRuntimeContext.setSessionId('session-abc');
    try {
      const context = new RequestContext({ sessionId: 'test', requestId: 'req-1', request: null });
      const result = await app._invokeHandler(syncHandler, context, false, {});
      expect(result['session_id']).toBe('session-abc');
    } finally {
      AgentArtsRuntimeContext.setSessionId(null);
    }
  });

  it('sync handler gets user id', async () => {
    const app = new AgentArtsRuntimeApp();

    const syncHandler = () => ({ user_id: AgentArtsRuntimeContext.getUserId() });

    AgentArtsRuntimeContext.setUserId('user-xyz');
    try {
      const context = new RequestContext({ sessionId: 'test', requestId: 'req-1', request: null });
      const result = await app._invokeHandler(syncHandler, context, false, {});
      expect(result['user_id']).toBe('user-xyz');
    } finally {
      AgentArtsRuntimeContext.setUserId(null);
    }
  });

  it('concurrent sync handlers isolated context', async () => {
    const app = new AgentArtsRuntimeApp();
    const results: Record<string, string | null> = {};

    const makeHandler = (key: string) => () => {
      const localToken = AgentArtsRuntimeContext.getWorkloadAccessToken();
      results[key] = localToken;
      return { key, token: localToken };
    };

    // `asyncio.gather` runs each coroutine in its own contextvars copy;
    // `runInNewContext` provides the same per-task isolation.
    const runWithContext = (key: string, tokenValue: string) =>
      AgentArtsRuntimeContext.runInNewContext(async () => {
        AgentArtsRuntimeContext.setWorkloadAccessToken(tokenValue);
        try {
          const context = new RequestContext({
            sessionId: 'test',
            requestId: 'req-1',
            request: null,
          });
          return await app._invokeHandler(makeHandler(key), context, false, {});
        } finally {
          AgentArtsRuntimeContext.setWorkloadAccessToken(null);
        }
      });

    await Promise.all([
      runWithContext('handler_a', 'token-A'),
      runWithContext('handler_b', 'token-B'),
    ]);

    expect(results['handler_a']).toBe('token-A');
    expect(results['handler_b']).toBe('token-B');
  });
});
