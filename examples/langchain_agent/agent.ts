/**
 * LangChain Integration Example.
 *
 * TypeScript port of `examples/integration/langchain/langchain_agent.py`.
 *
 * The Python example builds a `create_tool_calling_agent` + `AgentExecutor`.
 * `@langchain/core` 1.x does not ship an `AgentExecutor` (that class lives in
 * the higher-level `langchain` package, which has no Node.js counterpart), so
 * the exact same tool-calling loop is implemented explicitly here:
 *
 *   model -> tool calls? -> run tools -> model -> ... -> final answer
 *
 * Tools: `calculate`, `get_current_time` and `word_count`.
 *
 * Required environment variables:
 * - `OPENAI_API_KEY`: API Key of the OpenAI-compatible model endpoint
 * - `OPENAI_MODEL_NAME`: model name (default: `gpt-4o-mini`)
 * - `OPENAI_BASE_URL`: API base URL (optional)
 *
 * Note: `@langchain/openai` is declared in `package.json` but loaded
 * dynamically, so this file type-checks even when the package is not installed
 * (`pnpm add @langchain/openai` is required at runtime).
 *
 * Run:
 *   npx tsx agent.ts
 */

import { pathToFileURL } from 'node:url';

import {
  HumanMessage,
  SystemMessage,
  ToolMessage,
  type BaseMessage,
} from '@langchain/core/messages';
import { tool } from '@langchain/core/tools';

import { AgentArtsRuntimeApp, type RequestContext } from 'agentarts-sdk';

/** Runtime application hosting the AgentArts HTTP endpoints. */
export const app = new AgentArtsRuntimeApp();

/** System prompt used by the Python example's `ChatPromptTemplate`. */
export const SYSTEM_PROMPT =
  'You are a helpful assistant with access to tools for calculations, ' +
  'time, and text analysis. Use the tools when appropriate to help answer questions.';

/** Upper bound of model/tool round-trips (Python AgentExecutor `max_iterations`). */
export const MAX_TOOL_ROUNDS = 8;

/** Names and values exposed to {@link evaluateExpression}. */
const ALLOWED_IDENTIFIERS: Record<string, unknown> = {
  sqrt: Math.sqrt,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  log: Math.log,
  log10: Math.log10,
  exp: Math.exp,
  pow: Math.pow,
  abs: Math.abs,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
  pi: Math.PI,
  e: Math.E,
};

/**
 * Evaluate a mathematical expression, mirroring the Python example's
 * `eval(expression, {"__builtins__": {}}, allowed_names)`.
 *
 * Only the identifiers of {@link ALLOWED_IDENTIFIERS} and the operators known
 * to both languages are accepted; this keeps the demo behaviour (Python `^` is
 * XOR, `**` is power) without exposing Node.js globals.
 */
export function evaluateExpression(expression: string): string {
  const identifiers = expression.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
  const unknown = identifiers.filter((name) => !(name in ALLOWED_IDENTIFIERS));
  if (unknown.length > 0) {
    throw new Error(`unknown identifiers: ${unknown.join(', ')}`);
  }
  if (!/^[0-9A-Za-z_+\-*/%().,\s^]+$/.test(expression)) {
    throw new Error('expression contains unsupported characters');
  }

  const names = Object.keys(ALLOWED_IDENTIFIERS);
  const values = names.map((name) => ALLOWED_IDENTIFIERS[name]);
  // Demo-only evaluator: the identifier whitelist above is what keeps it safe.
  const evaluate = new Function(...names, `'use strict'; return (${expression});`);
  const result = evaluate(...values);
  return String(result);
}

/** Format a date as `YYYY-MM-DD HH:MM:SS` (Python `strftime("%Y-%m-%d %H:%M:%S")`). */
export function formatDateTime(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

/**
 * Tool: evaluate a mathematical expression.
 *
 * Python:
 *   @tool
 *   def calculate(expression: str) -> str: ...
 */
export const calculateTool = tool(
  async (input: Record<string, any>) => {
    try {
      return evaluateExpression(String(input?.expression ?? ''));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `Error evaluating expression: ${message}`;
    }
  },
  {
    name: 'calculate',
    description:
      'Evaluate a mathematical expression. Use this tool for mathematical ' +
      'calculations. The expression may use +, -, *, /, %, ** and the functions ' +
      'sqrt, sin, cos, tan, log, log10, exp, pow, abs, round, floor, ceil (pi/e constants).',
    schema: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description: 'Mathematical expression to evaluate (e.g., "2 + 2", "sqrt(16)")',
        },
      },
      required: ['expression'],
    },
  },
);

/** Tool: get the current date and time. */
export const currentTimeTool = tool(
  async () => formatDateTime(new Date()),
  {
    name: 'get_current_time',
    description: 'Get the current date and time.',
    schema: {
      type: 'object',
      properties: {},
    },
  },
);

/** Tool: count the words of a text. */
export const wordCountTool = tool(
  async (input: Record<string, any>) => {
    const text = String(input?.text ?? '');
    const words = text.split(/\s+/).filter((word) => word.length > 0);
    return `The text contains ${words.length} words.`;
  },
  {
    name: 'word_count',
    description: 'Count the number of words in a text.',
    schema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The text to count words in' },
      },
      required: ['text'],
    },
  },
);

/** Tools exposed to the model (Python: `tools = [calculate, get_current_time, word_count]`). */
export const tools = [calculateTool, currentTimeTool, wordCountTool];

/** Tools indexed by name, so tool calls coming from the model can be resolved. */
const toolsByName: Record<string, any> = Object.fromEntries(
  tools.map((item) => [item.name, item]),
);

/** One executed tool call, as returned when `include_intermediate_steps` is set. */
export interface IntermediateStep {
  tool: string;
  input: unknown;
  output: string;
}

/**
 * Minimal structural type for a chat model.
 *
 * `@langchain/openai` is an optional dependency loaded dynamically, so the
 * example does not need its types at build time.
 */
export interface ChatModelLike {
  invoke(messages: BaseMessage[]): Promise<any>;
  bindTools(tools: unknown[]): ChatModelLike;
}

/** Load `@langchain/openai` dynamically and create the chat model. */
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

/** Cached model with tools bound (Python: module-level `agent_executor`). */
let modelPromise: Promise<ChatModelLike> | null = null;

/** Get the model with tools bound, creating it on first use. */
export function getModel(): Promise<ChatModelLike> {
  modelPromise ??= (async () => {
    const model = await createChatModel({
      model: process.env.OPENAI_MODEL_NAME ?? 'gpt-4o-mini',
      apiKey: process.env.OPENAI_API_KEY,
      configuration: { baseURL: process.env.OPENAI_BASE_URL },
      temperature: 0,
    });
    return model.bindTools(tools);
  })();
  return modelPromise;
}

export interface AgentRunResult {
  response: string;
  intermediateSteps: IntermediateStep[] | null;
}

/**
 * Run the tool-calling loop (Python `agent_executor.invoke({"input": message})`).
 */
export async function runAgent(
  input: string,
  includeIntermediateSteps: boolean,
): Promise<AgentRunResult> {
  const model = await getModel();
  const messages: BaseMessage[] = [new SystemMessage(SYSTEM_PROMPT), new HumanMessage(input)];
  const steps: IntermediateStep[] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const response: any = await model.invoke(messages);
    messages.push(response);

    const toolCalls: any[] = response?.tool_calls ?? [];
    if (toolCalls.length === 0) {
      return {
        response: messageText(response),
        intermediateSteps: includeIntermediateSteps ? steps : null,
      };
    }

    for (const call of toolCalls) {
      const selected = toolsByName[String(call?.name ?? '')];
      let output: string;
      if (!selected) {
        output = `Unknown tool: ${String(call?.name ?? '')}`;
      } else {
        try {
          output = String(await selected.invoke(call));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          output = `Error executing tool ${String(call?.name ?? '')}: ${message}`;
        }
      }

      steps.push({
        tool: String(call?.name ?? ''),
        input: call?.args ?? {},
        output,
      });

      messages.push(
        new ToolMessage({
          content: output,
          tool_call_id: String(call?.id ?? ''),
        }),
      );
    }
  }

  return {
    response: 'The agent exceeded the maximum number of tool rounds.',
    intermediateSteps: includeIntermediateSteps ? steps : null,
  };
}

/**
 * Chat entrypoint using the LangChain tool-calling agent.
 *
 * Payload:
 * - `message`: the user message (required)
 * - `include_intermediate_steps`: include the executed tool calls in the reply
 */
export const handler = app.entrypoint(
  async (payload: Record<string, any>, context?: RequestContext) => {
    const message = String(payload?.message ?? '');
    const includeIntermediateSteps = Boolean(payload?.include_intermediate_steps ?? false);

    if (!message) {
      return {
        error: 'message is required',
      };
    }

    const result = await runAgent(message, includeIntermediateSteps);

    return {
      response: result.response,
      intermediate_steps: result.intermediateSteps,
    };
  },
);

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log('Starting LangChain Agent Example...');
  console.log('');
  console.log('Required environment variables:');
  console.log('  - OPENAI_API_KEY: OpenAI API Key');
  console.log('  - OPENAI_MODEL_NAME: Model name (default: gpt-4o-mini)');
  console.log('  - OPENAI_BASE_URL: API Base URL (optional)');
  console.log('');
  console.log('Available tools:');
  console.log('  - calculate: Evaluate mathematical expressions');
  console.log('  - get_current_time: Get current date and time');
  console.log('  - word_count: Count words in text');
  console.log('');
  console.log('Endpoints:');
  console.log('  - POST /invocations - Invoke the agent');
  console.log('  - GET  /ping         - Health check');

  handler.run('0.0.0.0', 8080);
}
