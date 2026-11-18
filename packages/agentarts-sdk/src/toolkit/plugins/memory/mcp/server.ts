/**
 * MCP server exposing AgentArts Memory tools via the stdio transport.
 *
 * Ported from `agentarts/toolkit/plugins/memory/mcp/server.py`.
 *
 * This module wraps {@link AgentArtsMemoryClient} and exposes four MCP tools
 * that the AI agent can call on-demand:
 *
 * - `search_memories` - semantic search of cloud memories
 * - `add_messages` - record conversation messages to cloud memory
 * - `list_memories` - paginated list of memory records
 * - `search_summary` - list summary-type memories
 *
 * Lifecycle is managed by the platform (Claude Code / Codex / OpenCode): the
 * platform launches `node <pkg>/dist/toolkit/plugins/memory/mcp/server.js` as a
 * subprocess and communicates over stdin/stdout JSON-RPC.
 *
 * Implementation note: the `@modelcontextprotocol/sdk` package is an *optional*
 * dependency, so it is imported dynamically (module load never fails when it is
 * absent). The low-level `Server` API is used instead of `McpServer.registerTool`
 * because tool registration in the high-level API requires `zod` schemas, which
 * this package does not depend on; the low-level API lets us declare the tool
 * JSON Schemas directly and keeps tool names, parameters and descriptions
 * identical to the Python implementation.
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getLogger } from '../../../../sdk/utils/logging.js';

import {
  AgentArtsMemoryClient,
  DEFAULT_LIST_LIMIT,
  DEFAULT_MIN_SCORE,
  DEFAULT_TOP_K,
  type MemoryMessageInput,
} from '../agentarts-client.js';

const logger = getLogger('toolkit.plugins.memory.mcp.server');

/** Platform name -> default user ID. */
export const PLATFORM_USER_ID: Record<string, string> = {
  'claude-code': 'cc-user',
  codex: 'codex-user',
  opencode: 'opencode-user',
  unknown: '__default__',
};

/** Detect the hosting platform from the environment. */
export function _detectPlatform(): string {
  const explicit = process.env['AGENTARTS_MEMORY_PLATFORM'];
  if (explicit) {
    return explicit;
  }
  if (process.env['CLAUDE_PLUGIN_ROOT']) {
    return 'claude-code';
  }
  if (process.env['CODEX_PLUGIN_ROOT']) {
    return 'codex';
  }
  if (process.env['OPENCODE_PLUGIN_ROOT']) {
    return 'opencode';
  }
  return 'unknown';
}

/** Resolve the user ID for memory scoping. */
export function _resolveUserId(userId?: string | null): string {
  if (userId) {
    return userId;
  }
  const envUid = process.env['AGENTARTS_MEMORY_USER_ID'];
  if (envUid) {
    return envUid;
  }
  return PLATFORM_USER_ID[_detectPlatform()] ?? '__default__';
}

/** Resolve the scope ID for memory scoping. */
export function _resolveScopeId(scopeId?: string | null): string {
  if (scopeId) {
    return scopeId;
  }
  const envScope = process.env['AGENTARTS_MEMORY_PROJECT_NAME'];
  if (envScope) {
    return envScope;
  }
  return 'default';
}

// ---- shared client instance ----

let _client: AgentArtsMemoryClient | null = null;

/** Return the shared `AgentArtsMemoryClient` singleton. */
export function getClient(): AgentArtsMemoryClient {
  if (_client === null) {
    _client = new AgentArtsMemoryClient();
  }
  return _client;
}

/** Replace the shared client (used by tests). */
export function resetClient(client: AgentArtsMemoryClient | null = null): void {
  _client = client;
}

// ---- Tool implementations ----

/**
 * Search cloud memories by semantic similarity.
 *
 * @param query Natural-language search query.
 * @param num Maximum results to return (1-100).
 * @param threshold Minimum similarity score (0.0-1.0).
 * @returns Object with `results` (list of `{content, score, type}`) and `total`.
 */
export async function searchMemories(
  query: string,
  num: number = DEFAULT_TOP_K,
  threshold: number = DEFAULT_MIN_SCORE,
): Promise<Record<string, any>> {
  try {
    const results = await getClient().searchMemories({
      query,
      userId: _resolveUserId(null),
      scopeId: _resolveScopeId(null),
      num,
      threshold,
    });
    return { results, total: results.length, query };
  } catch (error) {
    logger.warning(`search_memories failed: ${_errorMessage(error)}`);
    return { error: _errorMessage(error), results: [], total: 0 };
  }
}

/**
 * Record conversation messages to cloud memory.
 *
 * @param messages List of `{role, content}` objects
 *   (role: `user`/`assistant`/`system`).
 * @returns Object with `session_id` and the `count` of recorded messages.
 */
export async function addMessages(messages: MemoryMessageInput[]): Promise<Record<string, any>> {
  try {
    return await getClient().addMessages(messages, {
      userId: _resolveUserId(null),
      scopeId: _resolveScopeId(null),
    });
  } catch (error) {
    logger.warning(`add_messages failed: ${_errorMessage(error)}`);
    return { error: _errorMessage(error), session_id: '', count: 0 };
  }
}

/**
 * List memory records from cloud memory.
 *
 * @param limit Maximum records to return (1-100).
 * @param offset Pagination offset.
 * @returns Object with `results` (list of `{id, content, type, created_at}`)
 *   and `total`.
 */
export async function listMemories(
  limit: number = DEFAULT_LIST_LIMIT,
  offset = 0,
): Promise<Record<string, any>> {
  try {
    const results = await getClient().listMemories({
      userId: _resolveUserId(null),
      scopeId: _resolveScopeId(null),
      limit,
      offset,
    });
    return { results, total: results.length };
  } catch (error) {
    logger.warning(`list_memories failed: ${_errorMessage(error)}`);
    return { error: _errorMessage(error), results: [], total: 0 };
  }
}

/**
 * Search summary-type memories by semantic similarity.
 *
 * Performs a semantic search with the query, then filters results to
 * summary-type memories (episodic, summary, user_preference). Falls back to
 * listing all memories if no summary-type results are found.
 *
 * @param query Natural-language search query.
 * @param num Maximum results to return.
 * @returns Object with `results` (list of `{content, type}`) and `total`.
 */
export async function searchSummary(query: string, num = 3): Promise<Record<string, any>> {
  try {
    const summaryTypes = new Set(['summary', 'episodic', 'user_preference']);

    const uid = _resolveUserId(null);
    const sid = _resolveScopeId(null);

    // Semantic search with the query, then filter to summary types.
    const searchResults = await getClient().searchMemories({
      query,
      userId: uid,
      scopeId: sid,
      num: Math.max(num * 3, DEFAULT_TOP_K),
      threshold: DEFAULT_MIN_SCORE,
    });
    let summaries: Array<Record<string, any>> = searchResults.filter((memory) =>
      summaryTypes.has(String(memory.type)),
    );

    // Fallback: list memories and filter by type if semantic search found none.
    if (summaries.length === 0) {
      const allMemories = await getClient().listMemories({
        userId: uid,
        scopeId: sid,
        limit: Math.min(Math.max(num * 5, DEFAULT_LIST_LIMIT), 20),
        offset: 0,
      });
      summaries = allMemories.filter((memory) => summaryTypes.has(String(memory.type)));
      if (summaries.length === 0) {
        summaries = allMemories;
      }
    }

    const limited = summaries.slice(0, num);
    return { results: limited, total: limited.length, query };
  } catch (error) {
    logger.warning(`search_summary failed: ${_errorMessage(error)}`);
    return { error: _errorMessage(error), results: [], total: 0 };
  }
}

// ---- Tool registry (declared like the Python `@mcp.tool()` decorators) ----

/** A tool exposed over MCP. */
export interface MemoryToolDefinition {
  /** MCP tool name (identical to the Python function name). */
  name: string;
  /** Tool description (the Python docstring). */
  description: string;
  /** JSON Schema of the tool arguments. */
  inputSchema: Record<string, any>;
  /** Tool implementation. */
  handler: (args: Record<string, any>) => Promise<Record<string, any>>;
}

/** The four MCP tools, in registration order. */
export const TOOLS: readonly MemoryToolDefinition[] = [
  {
    name: 'search_memories',
    description:
      'Search cloud memories by semantic similarity.\n' +
      '\n' +
      'Args:\n' +
      '    query: Natural-language search query.\n' +
      '    num: Maximum results to return (1-100).\n' +
      '    threshold: Minimum similarity score (0.0-1.0).\n' +
      '\n' +
      'Returns:\n' +
      '    Dict with ``results`` (list of {content, score, type}) and ``total``.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Natural-language search query.' },
        num: {
          type: 'integer',
          description: 'Maximum results to return (1-100).',
          default: DEFAULT_TOP_K,
        },
        threshold: {
          type: 'number',
          description: 'Minimum similarity score (0.0-1.0).',
          default: DEFAULT_MIN_SCORE,
        },
      },
      required: ['query'],
    },
    handler: async (args) =>
      searchMemories(
        String(args['query'] ?? ''),
        _optionalNumber(args['num'], DEFAULT_TOP_K),
        _optionalNumber(args['threshold'], DEFAULT_MIN_SCORE),
      ),
  },
  {
    name: 'add_messages',
    description:
      'Record conversation messages to cloud memory.\n' +
      '\n' +
      'Args:\n' +
      '    messages: List of {role, content} dicts (role: user/assistant/system).\n' +
      '\n' +
      'Returns:\n' +
      '    Dict with ``session_id`` and ``count`` of recorded messages.',
    inputSchema: {
      type: 'object',
      properties: {
        messages: {
          type: 'array',
          description: 'List of {role, content} dicts (role: user/assistant/system).',
          items: { type: 'object', additionalProperties: { type: 'string' } },
        },
      },
      required: ['messages'],
    },
    handler: async (args) => addMessages((args['messages'] ?? []) as MemoryMessageInput[]),
  },
  {
    name: 'list_memories',
    description:
      'List memory records from cloud memory.\n' +
      '\n' +
      'Args:\n' +
      '    limit: Maximum records to return (1-100).\n' +
      '    offset: Pagination offset.\n' +
      '\n' +
      'Returns:\n' +
      '    Dict with ``results`` (list of {id, content, type, created_at}) and ``total``.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'integer',
          description: 'Maximum records to return (1-100).',
          default: DEFAULT_LIST_LIMIT,
        },
        offset: { type: 'integer', description: 'Pagination offset.', default: 0 },
      },
    },
    handler: async (args) =>
      listMemories(
        _optionalNumber(args['limit'], DEFAULT_LIST_LIMIT),
        _optionalNumber(args['offset'], 0),
      ),
  },
  {
    name: 'search_summary',
    description:
      'Search summary-type memories by semantic similarity.\n' +
      '\n' +
      'Performs a semantic search with the query, then filters results to\n' +
      'summary-type memories (episodic, summary, user_preference). Falls back\n' +
      'to listing all memories if no summary-type results are found.\n' +
      '\n' +
      'Args:\n' +
      '    query: Natural-language search query.\n' +
      '    num: Maximum results to return.\n' +
      '\n' +
      'Returns:\n' +
      '    Dict with ``results`` (list of {content, type}) and ``total``.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Natural-language search query.' },
        num: { type: 'integer', description: 'Maximum results to return.', default: 3 },
      },
      required: ['query'],
    },
    handler: async (args) =>
      searchSummary(String(args['query'] ?? ''), _optionalNumber(args['num'], 3)),
  },
];

/** Coerce an optional numeric tool argument (defaults are applied on omission). */
function _optionalNumber(value: unknown, defaultValue: number): number {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

/** `str(exc)` counterpart. */
function _errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

// ---- MCP server instance ----

/** Instructions advertised to the MCP client (Python `MCPServer(...)`). */
export const INSTRUCTIONS =
  'AgentArts Memory provides cross-session cloud memory via Huawei Cloud. ' +
  'Use search_memories to find relevant past context, add_messages to record ' +
  'important information, and list_memories to browse stored memories.';

/** The AgentArts Memory MCP server (`mcp` in the Python module). */
export class MemoryMcpServer {
  /** Server name. */
  readonly name = 'agentarts-memory';
  /** Server version. */
  readonly version = '1.0.0';
  /** Server instructions. */
  readonly instructions = INSTRUCTIONS;

  /**
   * Build the underlying MCP `Server` with the tools registered.
   *
   * Loads `@modelcontextprotocol/sdk` dynamically so that merely importing this
   * module never requires the optional dependency.
   */
  async createServer(): Promise<Server> {
    const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
    const { CallToolRequestSchema, ListToolsRequestSchema } = await import(
      '@modelcontextprotocol/sdk/types.js'
    );

    const server = new Server(
      { name: this.name, version: this.version },
      { capabilities: { tools: {} }, instructions: this.instructions },
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: TOOLS.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
    }));

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const name = request.params.name;
      const args = (request.params.arguments ?? {}) as Record<string, any>;
      const tool = TOOLS.find((candidate) => candidate.name === name);
      if (!tool) {
        return {
          content: [
            { type: 'text' as const, text: JSON.stringify({ error: `Unknown tool: ${name}` }) },
          ],
          isError: true,
        };
      }
      const result = await tool.handler(args);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    });

    return server;
  }

  /** Start the server on a transport (only `stdio` is supported, like Python). */
  async run(transport = 'stdio'): Promise<void> {
    if (transport !== 'stdio') {
      throw new Error(`Unsupported transport: ${transport}`);
    }
    const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
    const server = await this.createServer();
    await server.connect(new StdioServerTransport());
  }
}

/** The shared MCP server instance (Python `mcp`). */
export const mcp = new MemoryMcpServer();

/**
 * Entry point for
 * `node <pkg>/dist/toolkit/plugins/memory/mcp/server.js`.
 */
export async function main(): Promise<void> {
  if (process.env['AGENTARTS_MEMORY_LOG_LEVEL']?.toLowerCase() === 'debug') {
    logger.setLevel('DEBUG');
  }
  await mcp.run('stdio');
}

/** Run `main()` when executed directly (`python -m ...` counterpart). */
function _isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  try {
    return resolve(entry) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (_isMainModule()) {
  main().catch((error: unknown) => {
    process.stderr.write(`[agentarts-memory] fatal: ${_errorMessage(error)}\n`);
    process.exitCode = 1;
  });
}
