/**
 * Basic Agent Example.
 *
 * TypeScript port of `examples/basic_agent/agent.py` from `agentarts-sdk-python`.
 *
 * The agent ignores any framework: it just echoes the incoming `message` back
 * through the standard AgentArts runtime endpoints:
 *
 * - `POST /invocations` - invoke the agent
 * - `GET  /ping`         - health check
 *
 * Run:
 *   npx tsx agent.ts        # 直接执行 TypeScript（开发模式，推荐）
 *   node dist/agent.js      # 先编译再运行（见 README.md）
 */

import { pathToFileURL } from 'node:url';

import { AgentArtsRuntimeApp, type RequestContext } from 'agentarts-sdk';

/** Runtime application hosting the AgentArts HTTP/WebSocket endpoints. */
export const app = new AgentArtsRuntimeApp();

/**
 * Simple entrypoint that echoes back the message.
 *
 * Registration replaces Python's `@app.entrypoint` decorator; the returned
 * value is the original handler with an extra `run()` attached, so it can be
 * started like Python's `handler.run(host="0.0.0.0", port=8080)`.
 *
 * @param payload Input payload containing the `message` field.
 * @param context Request metadata injected by the SDK (the parameter must be
 *   named `context` for the runtime to pass it).
 */
export const handler = app.entrypoint(
  (payload: Record<string, any>, context?: RequestContext) => {
    const message = String(payload?.message ?? '');
    // Python reads `session_id` from the payload only; the Node.js SDK also
    // exposes the session id sent through the `x-hw-agentarts-session-id`
    // header via `RequestContext.sessionId`, so it is used as a fallback here.
    const sessionId = payload?.session_id ?? context?.sessionId ?? 'default-session';

    return {
      response: `You said: ${message}`,
      session_id: sessionId,
    };
  },
);

// Same guard as Python's `if __name__ == "__main__":` (only start the server
// when this file is executed directly, not when it is imported by `agentarts dev`).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log('Starting Basic Agent Example...');
  console.log('Endpoints:');
  console.log('  - POST /invocations - Invoke the agent');
  console.log('  - GET  /ping         - Health check');

  handler.run('0.0.0.0', 8080);
}
