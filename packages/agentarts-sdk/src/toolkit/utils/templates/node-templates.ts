/**
 * TypeScript project templates for `agentarts init`.
 *
 * The Python toolkit scaffolds Python projects (`agent.py` + `requirements.txt`).
 * The Node.js port scaffolds TypeScript projects instead: `agent.ts` +
 * `package.json` (+ Dockerfile and `.agentarts_config.yaml`). Node.js >= 22.18
 * runs `.ts` entrypoints natively through type stripping; Node.js >= 20 needs a
 * loader such as `tsx` or a compilation step.
 */

export interface NodeTemplate {
  /** `agent.ts` content; `{{ name }}` is replaced with the project name. */
  agentTs: string;
  /** `package.json` content; `{{ name }}` is replaced with the project name. */
  packageJson: string;
}

function packageJson(name: string, dependencies: Record<string, string>): string {
  return `${JSON.stringify(
    {
      name,
      version: '0.1.0',
      private: true,
      type: 'module',
      scripts: {
        start: 'node --experimental-strip-types agent.ts',
        dev: 'agentarts dev',
      },
      dependencies,
    },
    null,
    2,
  )}\n`;
}

const BASIC_AGENT = `/**
 * {{ name }} - Basic Agent Implementation
 *
 * A simple agent that processes user queries using the AgentArts SDK runtime.
 *
 * Environment Variables:
 *   None required for the basic template.
 *
 * Configuration:
 *   Edit .agentarts_config.yaml to customize runtime settings.
 */

import { pathToFileURL } from 'node:url';

import { AgentArtsRuntimeApp, type RequestContext } from 'agentarts-sdk';

const app = new AgentArtsRuntimeApp();

app.entrypoint(
  async (payload: Record<string, unknown>, context?: RequestContext | null) => {
    const query = String(payload['message'] ?? '');

    // TODO: Implement your agent logic here

    return {
      response: 'Processed: ' + query,
      status: 'success',
      agent: '{{ name }}',
      session_id: context?.sessionId ?? null,
    };
  },
);

export { app };

// Run directly (node agent.ts) but not when imported by the dev server.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.run();
}
`;

const LANGCHAIN_AGENT = `/**
 * {{ name }} - LangChain Agent Implementation
 *
 * An agent built with LangChain, wrapped with the AgentArts SDK runtime.
 *
 * Environment Variables:
 *   OPENAI_API_KEY    - Model API key
 *   OPENAI_MODEL_NAME - Model name (default: gpt-4o-mini)
 *   OPENAI_BASE_URL   - Optional custom model endpoint
 */

import { pathToFileURL } from 'node:url';

import { AgentArtsRuntimeApp, type RequestContext } from 'agentarts-sdk';
import { ChatOpenAI } from '@langchain/openai';
import type { BaseMessage } from '@langchain/core/messages';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

const app = new AgentArtsRuntimeApp();

const MODEL_NAME = process.env['OPENAI_MODEL_NAME'] ?? 'gpt-4o-mini';

const llm = new ChatOpenAI({
  model: MODEL_NAME,
  apiKey: process.env['OPENAI_API_KEY'],
  configuration: { baseURL: process.env['OPENAI_BASE_URL'] || undefined },
});

const SYSTEM_PROMPT = new SystemMessage(
  'You are a helpful assistant. Answer the user query concisely.',
);

app.entrypoint(
  async (payload: Record<string, unknown>, context?: RequestContext | null) => {
    const query = String(payload['message'] ?? '');
    const history = Array.isArray(payload['history']) ? (payload['history'] as BaseMessage[]) : [];

    // TODO: Add tools / retrieval / memory as needed.
    const response = await llm.invoke([SYSTEM_PROMPT, ...history, new HumanMessage(query)]);

    return {
      response:
        typeof response.content === 'string'
          ? response.content
          : JSON.stringify(response.content),
      status: 'success',
      agent: '{{ name }}',
      model: MODEL_NAME,
      session_id: context?.sessionId ?? null,
    };
  },
);

export { app };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.run();
}
`;

const LANGGRAPH_AGENT = `/**
 * {{ name }} - LangGraph Agent Implementation
 *
 * A single-node LangGraph agent wrapped with the AgentArts SDK runtime.
 *
 * Environment Variables:
 *   OPENAI_API_KEY    - Model API key
 *   OPENAI_MODEL_NAME - Model name (default: gpt-4o-mini)
 *   OPENAI_BASE_URL   - Optional custom model endpoint
 */

import { pathToFileURL } from 'node:url';

import { AgentArtsRuntimeApp, type RequestContext } from 'agentarts-sdk';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, type BaseMessage } from '@langchain/core/messages';

const GraphState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (left, right) => left.concat(right),
    default: () => [],
  }),
  response: Annotation<string>({
    reducer: (_left, right) => right,
    default: () => '',
  }),
});

const MODEL_NAME = process.env['OPENAI_MODEL_NAME'] ?? 'gpt-4o-mini';

const llm = new ChatOpenAI({
  model: MODEL_NAME,
  apiKey: process.env['OPENAI_API_KEY'],
  configuration: { baseURL: process.env['OPENAI_BASE_URL'] || undefined },
});

const graph = new StateGraph(GraphState)
  .addNode('process', async (state) => {
    const result = await llm.invoke(state.messages);
    return {
      messages: [result],
      response:
        typeof result.content === 'string'
          ? result.content
          : JSON.stringify(result.content),
    };
  })
  .addEdge(START, 'process')
  .addEdge('process', END)
  .compile();

const app = new AgentArtsRuntimeApp();

app.entrypoint(
  async (payload: Record<string, unknown>, context?: RequestContext | null) => {
    const query = String(payload['message'] ?? '');
    const result = await graph.invoke({ messages: [new HumanMessage(query)] });
    return {
      response: result.response,
      status: 'success',
      agent: '{{ name }}',
      model: MODEL_NAME,
      session_id: context?.sessionId ?? null,
    };
  },
);

export { app, graph };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.run();
}
`;

const AGENTARTS_DEP = { 'agentarts-sdk': '^0.1.11' };

/** TypeScript templates by template type (mirrors `TEMPLATES` for Python). */
export const NODE_TEMPLATES: Readonly<Record<string, NodeTemplate>> = {
  basic: {
    agentTs: BASIC_AGENT,
    packageJson: packageJson('{{ name }}', { ...AGENTARTS_DEP }),
  },
  langchain: {
    agentTs: LANGCHAIN_AGENT,
    packageJson: packageJson('{{ name }}', {
      ...AGENTARTS_DEP,
      '@langchain/core': '^1.0.0',
      '@langchain/openai': '^1.0.0',
    }),
  },
  langgraph: {
    agentTs: LANGGRAPH_AGENT,
    packageJson: packageJson('{{ name }}', {
      ...AGENTARTS_DEP,
      '@langchain/core': '^1.0.0',
      '@langchain/langgraph': '^1.0.0',
      '@langchain/openai': '^1.0.0',
    }),
  },
};

/** Shared `tsconfig.json` for scaffolded projects. */
export const NODE_TSCONFIG = `${JSON.stringify(
  {
    compilerOptions: {
      target: 'ES2022',
      lib: ['ES2022'],
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      strict: true,
      skipLibCheck: true,
      noEmit: true,
      esModuleInterop: true,
      forceConsistentCasingInFileNames: true,
    },
    include: ['agent.ts'],
  },
  null,
  2,
)}\n`;
