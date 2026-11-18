/**
 * LangGraph Integration Example.
 *
 * TypeScript port of `examples/integration/langgraph/langgraph_agent.py`.
 *
 * A LangGraph `StateGraph` (one LLM node over `MessagesAnnotation`) is compiled
 * with the AgentArts Memory Service as checkpoint saver, so the conversation
 * state of a `thread_id` survives process restarts.
 *
 * Required environment variables:
 * - `OPENAI_API_KEY`: API Key of the OpenAI-compatible model endpoint
 * - `OPENAI_MODEL_NAME`: model name (default: `gpt-4o-mini`)
 * - `OPENAI_BASE_URL`: API base URL (optional)
 * - `AGENTARTS_MEMORY_SPACE_ID`: Memory Space ID
 * - `HUAWEICLOUD_SDK_MEMORY_API_KEY`: API Key for the Memory Service
 *
 * When `AGENTARTS_MEMORY_SPACE_ID` is not set the graph falls back to the
 * in-memory `MemorySaver` (local mode), which mirrors the two modes documented
 * in the Python example's README.
 *
 * Run:
 *   npx tsx agent.ts
 */

import { pathToFileURL } from 'node:url';

import { HumanMessage, type BaseMessage } from '@langchain/core/messages';
import { END, MemorySaver, MessagesAnnotation, START, StateGraph } from '@langchain/langgraph';

import { AgentArtsRuntimeApp, type RequestContext } from 'agentarts-sdk';
import { AgentArtsMemorySessionSaver } from 'agentarts-sdk/sdk/integration/langgraph';

/** Runtime application hosting the AgentArts HTTP endpoints. */
export const app = new AgentArtsRuntimeApp();

/**
 * Minimal structural type for a chat model.
 *
 * `@langchain/openai` is an optional dependency that is loaded dynamically
 * (see {@link createChatModel}), so the example does not need its types at
 * build time; only this small interface is used.
 */
export interface ChatModelLike {
  invoke(messages: BaseMessage[]): Promise<any>;
}

/**
 * Create the chat model through a dynamic import.
 *
 * Python: `ChatOpenAI(model=..., api_key=..., base_url=...)`. Keeping the
 * import dynamic means the example type-checks without `@langchain/openai`
 * installed; at runtime it must be installed (`pnpm add @langchain/openai`).
 */
export async function createChatModel(options: Record<string, any>): Promise<ChatModelLike> {
  const packageName: string = '@langchain/openai';
  let module: any;
  try {
    module = await import(packageName);
  } catch (error) {
    throw new Error(
      "The '@langchain/openai' package is required for this example. " +
        "Install it with: pnpm add @langchain/openai",
      { cause: error },
    );
  }
  const { ChatOpenAI } = module;
  return new ChatOpenAI(options);
}

/** Extract plain text from a LangChain message (string or content blocks). */
export function messageText(message: any): string {
  const content = message?.content;
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part: any) => (typeof part === 'string' ? part : (part?.text ?? '')))
      .join('');
  }
  return content === undefined || content === null ? '' : String(content);
}

/**
 * Checkpoint saver used by the graph.
 *
 * Python always passes `AgentArtsMemorySessionSaver(space_id=..., api_key=...)`
 * to `workflow.compile()`; here the cloud saver is used only when a Space ID is
 * configured, otherwise the graph keeps its state in memory.
 */
export function createCheckpointer(): AgentArtsMemorySessionSaver | null {
  const spaceId = process.env.AGENTARTS_MEMORY_SPACE_ID;
  if (!spaceId) {
    return null;
  }
  return new AgentArtsMemorySessionSaver({
    spaceId,
    apiKey: process.env.HUAWEICLOUD_SDK_MEMORY_API_KEY ?? null,
    region: process.env.HUAWEICLOUD_SDK_REGION ?? null,
  });
}

/** Create the LangGraph agent (Python `create_agent()`). */
export async function buildGraph() {
  const model = await createChatModel({
    model: process.env.OPENAI_MODEL_NAME ?? 'gpt-4o-mini',
    apiKey: process.env.OPENAI_API_KEY,
    configuration: { baseURL: process.env.OPENAI_BASE_URL },
    temperature: 0,
  });

  /** Call the model with the accumulated messages (Python `call_model`). */
  const callModel = async (state: typeof MessagesAnnotation.State) => {
    const response = await model.invoke(state.messages);
    return { messages: [response] };
  };

  const workflow = new StateGraph(MessagesAnnotation)
    .addNode('agent', callModel)
    // Python: `set_entry_point("agent")` + `set_finish_point("agent")`.
    .addEdge(START, 'agent')
    .addEdge('agent', END);

  const checkpointer = createCheckpointer() ?? new MemorySaver();
  return workflow.compile({ checkpointer });
}

/** Cached graph (built on first use, like Python's module-level `agent`). */
let graphPromise: Promise<Awaited<ReturnType<typeof buildGraph>>> | null = null;

/** Get the compiled graph, building it on first use. */
export function getGraph(): Promise<Awaited<ReturnType<typeof buildGraph>>> {
  graphPromise ??= buildGraph();
  return graphPromise;
}

/** Generate a thread ID (Python: `os.urandom(8).hex()`, 16 hex characters). */
export function createThreadId(): string {
  return globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}

/**
 * Chat entrypoint using a LangGraph agent with persistent state.
 *
 * Payload:
 * - `message`: the user message
 * - `thread_id`: optional thread ID for conversation continuity
 */
export const handler = app.entrypoint(
  async (payload: Record<string, any>, context?: RequestContext) => {
    const message = String(payload?.message ?? '');
    // Python: `thread_id = payload.get("thread_id")`; the runtime session id is
    // used as a fallback so HTTP clients can keep a conversation by header.
    let threadId: string | null = payload?.thread_id ?? context?.sessionId ?? null;

    if (!message) {
      return {
        error: 'message is required',
        thread_id: threadId ?? '',
      };
    }

    threadId ??= createThreadId();

    const agent = await getGraph();
    const result = await agent.invoke(
      { messages: [new HumanMessage(message)] },
      { configurable: { thread_id: threadId } },
    );

    return {
      response: messageText(result.messages?.at(-1)),
      thread_id: threadId,
    };
  },
);

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log('Starting LangGraph agent with AgentArts Memory');
  console.log('');
  console.log('Required environment variables:');
  console.log('  - OPENAI_API_KEY: OpenAI API Key');
  console.log('  - OPENAI_MODEL_NAME: Model name (default: gpt-4o-mini)');
  console.log('  - OPENAI_BASE_URL: API Base URL (optional)');
  console.log('  - AGENTARTS_MEMORY_SPACE_ID: Memory Space ID');
  console.log('  - HUAWEICLOUD_SDK_MEMORY_API_KEY: API Key for Memory Service');
  console.log('');
  console.log('Endpoints:');
  console.log('  - POST /invocations - Invoke the agent');

  handler.run('0.0.0.0', 8080);
}
