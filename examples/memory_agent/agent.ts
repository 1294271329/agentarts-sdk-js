/**
 * Memory Service Example.
 *
 * TypeScript port of `examples/memory_usage/agent_with_memory.py`.
 *
 * Demonstrates storing and replaying a conversation through the AgentArts
 * Memory Service:
 *
 * 1. create a conversation session (unless `session_id` is supplied);
 * 2. store the user message;
 * 3. read back the last K messages;
 * 4. store the assistant reply.
 *
 * Required environment variables:
 * - `HUAWEICLOUD_SDK_MEMORY_API_KEY`: API Key for the Memory Service
 * - `HUAWEICLOUD_SDK_REGION`: Huawei Cloud region (default: `cn-southwest-2`)
 * - `AGENTARTS_MEMORY_SPACE_ID`: Memory Space ID (or pass `space_id` in the payload)
 *
 * Run:
 *   npx tsx agent.ts
 */

import { pathToFileURL } from 'node:url';

import { AgentArtsRuntimeApp, MemoryClient, type RequestContext } from 'agentarts-sdk';
import { TextMessage, type MessageInfo } from 'agentarts-sdk/sdk/memory';

/** Runtime application hosting the AgentArts HTTP endpoints. */
export const app = new AgentArtsRuntimeApp();

/**
 * Memory client shared by all requests.
 *
 * Python: `MemoryClient(api_key=os.getenv("HUAWEICLOUD_SDK_MEMORY_API_KEY"))`.
 * The Node.js port takes an options object and camelCase field names.
 */
export const memoryClient = new MemoryClient({
  apiKey: process.env.HUAWEICLOUD_SDK_MEMORY_API_KEY ?? null,
  regionName: process.env.HUAWEICLOUD_SDK_REGION ?? null,
});

/** One entry of the serialized conversation history. */
export interface HistoryEntry {
  role: string;
  content: Array<string | null>;
}

/**
 * Turn Memory messages into the plain dictionaries returned to the caller.
 *
 * Python: `[{"role": msg.role, "content": [m.get("text") for m in msg.parts]}]`.
 */
export function toHistoryEntries(messages: MessageInfo[]): HistoryEntry[] {
  return messages.map((message) => ({
    role: message.role,
    content: (message.parts ?? []).map((part) => (part['text'] ?? null) as string | null),
  }));
}

/**
 * Chat entrypoint with conversation history stored in the Memory Service.
 *
 * Payload:
 * - `message`: the user message
 * - `session_id`: optional session ID (a new session is created when omitted)
 * - `space_id`: optional Memory Space ID (falls back to the environment)
 */
export const handler = app.entrypoint(
  async (payload: Record<string, any>, context?: RequestContext) => {
    const message = String(payload?.message ?? '');
    // Python: `session_id = payload.get("session_id")`.
    // The runtime also passes the session header through `RequestContext`.
    let sessionId: string | null = payload?.session_id ?? context?.sessionId ?? null;
    const spaceId: string | undefined =
      payload?.space_id ?? process.env.AGENTARTS_MEMORY_SPACE_ID;

    if (!spaceId) {
      return {
        error:
          'space_id is required. Set AGENTARTS_MEMORY_SPACE_ID env var or pass in payload.',
        session_id: sessionId ?? 'error',
        history: [] as HistoryEntry[],
      };
    }

    if (!sessionId) {
      // Python: `memory_client.create_memory_session(space_id=space_id)`.
      const session = await memoryClient.createMemorySession(spaceId);
      sessionId = session.id;
    }

    const userMessage = new TextMessage({
      role: 'user',
      content: message,
    });

    // Python: `add_messages(space_id=..., session_id=..., messages=[...])`.
    await memoryClient.addMessages(spaceId, sessionId, [userMessage]);

    const history = await memoryClient.getLastKMessages(
      sessionId,
      10,
      spaceId,
    );

    const responseText = `You said: ${message}. I remember our conversation!`;

    const assistantMessage = new TextMessage({
      role: 'assistant',
      content: responseText,
    });
    await memoryClient.addMessages(spaceId, sessionId, [assistantMessage]);

    return {
      response: responseText,
      session_id: sessionId,
      history: toHistoryEntries(history),
    };
  },
);

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log('Starting Agent with Memory Example...');
  console.log('Required environment variables:');
  console.log('  - HUAWEICLOUD_SDK_MEMORY_API_KEY: API Key for Memory Service');
  console.log('  - HUAWEICLOUD_SDK_REGION: Region (default: cn-southwest-2)');
  console.log('  - AGENTARTS_MEMORY_SPACE_ID: Space ID (optional, can pass in payload)');
  console.log('');
  console.log('Endpoints:');
  console.log('  - POST /invocations - Invoke the agent');
  console.log('  - GET  /ping         - Health check');

  handler.run('0.0.0.0', 8080);
}
