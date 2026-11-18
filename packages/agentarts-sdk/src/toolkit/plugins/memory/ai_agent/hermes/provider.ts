/**
 * AgentArts Memory Provider for Hermes Agent.
 *
 * Ported from
 * `agentarts/toolkit/plugins/memory/ai_agent/hermes/provider.py`.
 *
 * This module implements a Hermes MemoryProvider backed by Huawei Cloud
 * AgentArts Memory. It provides cross-session cloud memory persistence and
 * retrieval (`ltm_search` / `ltm_search_summary` tools).
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

import { getLogger, type Logger } from '../../../../../sdk/utils/logging.js';
import type {
  MemoryClient,
  MemorySearchResponse,
  TextMessage as TextMessageType,
} from '../../../../../sdk/memory/index.js';
import { importMemorySdk, type MemorySdkNamespace } from '../../agentarts-client.js';

/**
 * Python `str.splitlines()` counterpart (no trailing empty element, `''` -> `[]`).
 *
 * Kept local so the Hermes provider module does not depend on the installer
 * package (the provider is deployed as a stand-alone plugin file).
 */
function splitLines(text: string): string[] {
  if (text === '') {
    return [];
  }
  const lines = text.split(/\r?\n/);
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines;
}

// ── Environment variable names ──
export const ENV_API_KEY = 'HUAWEICLOUD_SDK_MEMORY_API_KEY';
export const ENV_REGION = 'HUAWEICLOUD_SDK_REGION';
export const ENV_SPACE_ID = 'AGENTARTS_MEMORY_SPACE_ID';

// ── Default values ──
export const DEFAULT_REGION = 'cn-southwest-2';
export const DEFAULT_TOP_K = 5;
export const DEFAULT_MIN_SCORE = 0.7;
export const DEFAULT_LIST_LIMIT = 10;

// ── Provider identity ──
export const PROVIDER_NAME = 'agentarts';
export const PROVIDER_ASSISTANT_ID = 'hermes-agent';

// ── system prompt block text ──
export const SYSTEM_PROMPT_BLOCK =
  '## AgentArts Memory\n' +
  'This session provides cross-session cloud memory via Huawei Cloud AgentArts Memory.\n' +
  '- Conversation content is automatically written to memory after each turn\n' +
  '- Relevant memories are injected before each LLM call' +
  ' (user profile / episodic / semantic + history summary)\n' +
  '- Use the ltm_search tool to actively retrieve cloud memories\n' +
  '- Use the ltm_search_summary tool to view memory summaries\n';

/** One entry of the Hermes configuration schema. */
export interface ConfigSchemaEntry {
  key: string;
  description: string;
  secret?: boolean;
  required?: boolean;
  default?: string;
  env_var: string;
}

/** Hermes configuration schema. */
export const CONFIG_SCHEMA: ConfigSchemaEntry[] = [
  {
    key: 'space_id',
    description: 'Huawei Cloud AgentArts Memory Space ID',
    required: true,
    env_var: ENV_SPACE_ID,
  },
  {
    key: 'api_key',
    description: 'Huawei Cloud AgentArts Memory API Key',
    secret: true,
    required: true,
    env_var: ENV_API_KEY,
  },
  {
    key: 'region',
    description: 'Huawei Cloud Region',
    default: DEFAULT_REGION,
    env_var: ENV_REGION,
  },
];

/**
 * Write non-secret config values (space_id, region) to `.env`.
 *
 * Secret fields (API key) are handled by Hermes and written to `.env` directly.
 * Non-secret fields are persisted here to the same `.env` file using their
 * `env_var` names.
 */
export function saveConfig(values: Record<string, any>, hermesHome: string): void {
  // Map non-secret field keys to env_var names.
  const keyToEnv: Record<string, string> = {};
  for (const entry of CONFIG_SCHEMA) {
    if (!entry.secret) {
      keyToEnv[entry.key] = entry.env_var;
    }
  }
  const entries: Record<string, string> = {};
  for (const [key, value] of Object.entries(values ?? {})) {
    if (key in keyToEnv && value) {
      entries[keyToEnv[key]!] = String(value);
    }
  }
  if (Object.keys(entries).length === 0) {
    return;
  }

  const envPath = join(hermesHome, '.env');

  // Read the existing .env content (dedup by key).
  const existing: Record<string, string> = {};
  const otherLines: string[] = [];
  if (existsSync(envPath)) {
    for (const line of splitLines(readFileSync(envPath, 'utf8'))) {
      if (line.includes('=') && !line.trim().startsWith('#')) {
        const separator = line.indexOf('=');
        existing[line.slice(0, separator).trim()] = line.slice(separator + 1);
      } else {
        otherLines.push(line);
      }
    }
  }

  Object.assign(existing, entries);
  mkdirSync(dirname(envPath), { recursive: true });

  const lines: string[] = [...otherLines];
  for (const [key, value] of Object.entries(existing)) {
    lines.push(`${key}=${value}`);
  }

  const tmp = `${envPath}.tmp`;
  writeFileSync(tmp, `${lines.join('\n')}\n`, 'utf8');
  renameSync(tmp, envPath);
}

/** One entry of the Hermes tool schema list. */
export interface ToolSchemaEntry {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

/** Hermes tool schemas exposed by the provider. */
export const TOOL_SCHEMAS: ToolSchemaEntry[] = [
  {
    name: 'ltm_search',
    description:
      'Search AgentArts memory and return memory entries relevant to the query' +
      ' (user profile / episodic / semantic + history summary).',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query string',
        },
        top_k: {
          type: 'integer',
          description: 'Return top K results',
          default: DEFAULT_TOP_K,
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'ltm_search_summary',
    description:
      'Get a list of AgentArts memory summaries to review generated memory overview.',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'integer',
          description: 'Number of entries to return',
          default: DEFAULT_LIST_LIMIT,
        },
      },
    },
  },
];

export { importMemorySdk };

const logger: Logger = getLogger('toolkit.plugins.memory.ai_agent.hermes.provider');

/**
 * Minimal file logger writing to `<hermesHome>/logs/agentarts.logs`, the Node.js
 * counterpart of the Python `logging.FileHandler` configured by
 * `_setup_logging`.
 */
class ProviderFileLogger {
  private fd: number | null = null;
  private readonly logPath: string;

  constructor(hermesHome: string) {
    this.logPath = join(hermesHome, 'logs', 'agentarts.logs');
  }

  /** Open (append) the log file. */
  open(): void {
    if (this.fd !== null) {
      return;
    }
    mkdirSync(dirname(this.logPath), { recursive: true });
    this.fd = openSync(this.logPath, 'a');
  }

  /** Append one formatted line. */
  write(level: 'INFO' | 'WARNING' | 'ERROR', funcName: string, message: string): void {
    if (this.fd === null) {
      return;
    }
    const timestamp = new Date().toISOString().replace('T', ' ').replace('Z', '');
    appendFileSync(
      this.fd,
      `${timestamp} [${level}] ${PROVIDER_NAME}.${funcName}: ${message}\n`,
      'utf8',
    );
  }

  /** Flush and close the log file. */
  close(): void {
    if (this.fd !== null) {
      try {
        closeSync(this.fd);
      } catch {
        // Already closed.
      }
      this.fd = null;
    }
  }
}

/**
 * Hermes Memory Provider backed by Huawei Cloud AgentArts Memory.
 */
export class AgentArtsMemoryProvider {
  private _client: MemoryClient | null = null;
  private _spaceId = '';
  private _sessionId = '';
  private _actorId = '';
  private _assistantId = PROVIDER_ASSISTANT_ID;
  private _hermesHome = '';
  private _sdk: MemorySdkNamespace | null = null;
  private _fileLogger: ProviderFileLogger | null = null;

  // ── Core lifecycle ──

  /** Provider name (`agentarts`). */
  get name(): string {
    return PROVIDER_NAME;
  }

  /** Check whether the required env vars are set. Must NOT perform network requests. */
  isAvailable(): boolean {
    return Boolean(process.env[ENV_API_KEY] && process.env[ENV_SPACE_ID]);
  }

  /** Configure file logging to `<hermesHome>/logs/agentarts.logs`. */
  private _setupLogging(): void {
    if (!this._hermesHome || this._fileLogger !== null) {
      return;
    }
    try {
      this._fileLogger = new ProviderFileLogger(this._hermesHome);
      this._fileLogger.open();
    } catch (error) {
      this._fileLogger = null;
      logger.warning(`Failed to setup file logging: ${_errorMessage(error)}`);
    }
  }

  /**
   * Called once when the agent starts.
   *
   * `options` always includes `hermesHome`: the active `HERMES_HOME` path.
   */
  async initialize(
    sessionId: string,
    options: { hermesHome?: string; userId?: string; [key: string]: any } = {},
  ): Promise<void> {
    this._hermesHome = options.hermesHome ?? '';
    this._setupLogging();
    this._sessionId = sessionId;
    this._actorId = options.userId ?? 'hermes-user';
    this._spaceId = process.env[ENV_SPACE_ID] ?? '';
    const region = process.env[ENV_REGION] ?? DEFAULT_REGION;
    const apiKey = process.env[ENV_API_KEY] ?? '';

    this._sdk = await importMemorySdk();
    this._client = new this._sdk.MemoryClient({ regionName: region, apiKey });

    // Create or reuse an AgentArts Memory session.
    try {
      const sessionData = await this._client.createMemorySession(
        this._spaceId,
        undefined,
        this._actorId,
        this._assistantId,
      );
      this._sessionId = sessionData.id;
    } catch (error) {
      logger.warning(
        `Failed to create memory session, using Hermes session_id: ${_errorMessage(error)}`,
      );
    }

    this._log(
      'INFO',
      'initialize',
      `AgentArts Memory provider initialized: space=${this._spaceId}, session=${this._sessionId}`,
    );
  }

  // ── Configuration ──

  /** Return the Hermes configuration schema. */
  getConfigSchema(): ConfigSchemaEntry[] {
    return CONFIG_SCHEMA;
  }

  /** Persist non-secret configuration values to `<hermesHome>/.env`. */
  saveConfig(values: Record<string, any>, hermesHome: string): void {
    saveConfig(values, hermesHome);
  }

  // ── Tools ──

  /** Return the Hermes tool schemas. */
  getToolSchemas(): ToolSchemaEntry[] {
    return TOOL_SCHEMAS;
  }

  /** Dispatch a tool call and return the JSON result string. */
  async handleToolCall(name: string, args: Record<string, any>): Promise<string> {
    if (name === 'ltm_search') {
      return this._ltmSearch(args);
    }
    if (name === 'ltm_search_summary') {
      return this._ltmSearchSummary(args);
    }
    return JSON.stringify({ error: `Unknown tool: ${name}` });
  }

  /** Execute `ltm_search`: search AgentArts memories. */
  async _ltmSearch(args: Record<string, any> | null | undefined): Promise<string> {
    if (!this._client) {
      return JSON.stringify({ error: 'Memory provider not initialized' });
    }

    if (args === null || args === undefined || typeof args !== 'object' || Array.isArray(args)) {
      return JSON.stringify({ error: 'Invalid arguments: expected a dict' });
    }

    const query = args['query'] ?? '';
    if (!query) {
      return JSON.stringify({ error: 'Missing required parameter: query' });
    }

    const topK = args['top_k'] ?? DEFAULT_TOP_K;
    const sdk = this._sdk;
    if (sdk === null) {
      return JSON.stringify({ error: 'Memory SDK not initialized' });
    }

    let results: MemorySearchResponse;
    try {
      const filters = new sdk.MemorySearchFilter({
        query,
        topK,
        actorId: this._actorId,
        minScore: DEFAULT_MIN_SCORE,
      });
      this._log(
        'INFO',
        '_ltm_search',
        `_space_id=${this._spaceId}, session_id=${this._sessionId}, top_k=${topK}, ` +
          `_actor_id=${this._actorId}, min_score=${DEFAULT_MIN_SCORE}`,
      );
      results = await this._client.searchMemories(this._spaceId, filters);
    } catch (error) {
      return JSON.stringify({ error: _errorMessage(error) });
    }

    const resultList: any[] = (results as any)?.results ?? [];
    const items: Array<Record<string, any>> = [];
    for (const item of resultList) {
      if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
        const record = item['record'] ?? {};
        let content: any;
        let strategyType: any;
        if (record !== null && typeof record === 'object') {
          content = record['content'] ?? '';
          strategyType = record['strategy_type'] ?? null;
        } else {
          content = String(record);
          strategyType = null;
        }
        items.push({
          content,
          score: item['score'] ?? null,
          strategy_type: strategyType,
        });
      } else {
        items.push({ content: String(item), score: null, strategy_type: null });
      }
    }

    return JSON.stringify({ query, results: items }, null, 2);
  }

  /** Execute `ltm_search_summary`: list AgentArts memory summaries. */
  async _ltmSearchSummary(args: Record<string, any> | null | undefined): Promise<string> {
    if (!this._client) {
      return JSON.stringify({ error: 'Memory provider not initialized' });
    }

    if (args === null || args === undefined || typeof args !== 'object' || Array.isArray(args)) {
      args = {};
    }

    const limit = args['limit'] ?? DEFAULT_LIST_LIMIT;
    const sdk = this._sdk;

    let memories: any;
    try {
      const filters = new sdk!.MemorySearchFilter({ actorId: this._actorId });
      this._log(
        'INFO',
        '_ltm_search_summary',
        `_space_id=${this._spaceId},session_id=${this._sessionId},limit=${limit}, ` +
          `_actor_id=${this._actorId}`,
      );
      memories = await this._client.listMemories(this._spaceId, limit, 0, filters);
    } catch (error) {
      return JSON.stringify({ error: _errorMessage(error) });
    }

    const rawItems: any[] = (memories as any)?.items ?? [];
    const items = rawItems.map((memory: any) => ({
      id: memory?.id ?? null,
      content: memory?.content ?? null,
      strategy_type: memory?.strategyType ?? memory?.strategy_type ?? null,
      created_at: memory?.createdAt ?? memory?.created_at ?? null,
    }));

    return JSON.stringify({ total: (memories as any)?.total ?? items.length, items }, null, 2);
  }

  // ── Optional hooks ──

  /** System prompt block injected into the Hermes system prompt. */
  systemPromptBlock(): string {
    return SYSTEM_PROMPT_BLOCK;
  }

  /** Inject relevant memories before each LLM call. */
  async prefetch(query: string): Promise<string> {
    if (!this._client || !query) {
      return '';
    }
    try {
      const sdk = this._sdk!;
      const results = await this._client.searchMemories(
        this._spaceId,
        new sdk.MemorySearchFilter({ query, topK: DEFAULT_TOP_K }),
      );
      return this._formatSearchResults(results, query);
    } catch (error) {
      logger.warning(`prefetch failed: ${_errorMessage(error)}`);
      return '';
    }
  }

  /** Format search results into text for context injection. */
  _formatSearchResults(results: any, query: string): string {
    const resultList: any[] | null | undefined = results?.results;
    if (!resultList || resultList.length === 0) {
      return '';
    }
    const lines = [`## Retrieved AgentArts Memory (query: ${query})`];
    let index = 1;
    for (const item of resultList) {
      if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
        const record = item['record'] ?? {};
        const content = record !== null && typeof record === 'object' ? record['content'] ?? '' : String(record);
        const score = item['score'] ?? '';
        lines.push(`${index}. [${score}] ${content}`);
      } else {
        lines.push(`${index}. ${item}`);
      }
      index += 1;
    }
    return `${lines.join('\n')}\n`;
  }

  /** Persist each conversation turn to AgentArts Memory. */
  async syncTurn(
    userContent: string,
    assistantContent: string,
    options: { sessionId?: string } = {},
  ): Promise<void> {
    if (!this._client) {
      return;
    }
    try {
      const sdk = this._sdk!;
      const messages: TextMessageType[] = [
        new sdk.TextMessage({
          role: 'user',
          content: userContent,
          actorId: this._actorId,
          assistantId: this._assistantId,
        }),
        new sdk.TextMessage({
          role: 'assistant',
          content: assistantContent,
          actorId: this._actorId,
          assistantId: this._assistantId,
        }),
      ];
      await this._client.addMessages(this._spaceId, this._sessionId, messages);
    } catch (error) {
      logger.warning(`sync_turn failed: ${_errorMessage(error)}`);
    }
  }

  /** Re-inject relevant memories before context compression. */
  async onPreCompress(messages: Array<any>): Promise<string> {
    const query = this._extractQueryFromMessages(messages);
    return this.prefetch(query);
  }

  /** Extract a search query from the message list (last user message). */
  _extractQueryFromMessages(messages: Array<any>): string {
    for (const message of [...(messages ?? [])].reverse()) {
      let role: any;
      let content: any;
      if (message !== null && typeof message === 'object' && !Array.isArray(message)) {
        role = message['role'];
        content = message['content'];
      } else {
        role = undefined;
        content = undefined;
      }
      if (role === 'user' && content) {
        return String(content).slice(0, 200);
      }
    }
    return '';
  }

  /** Mirror Hermes MEMORY.md writes to AgentArts Memory. */
  async onMemoryWrite(action: string, target: string, content: string): Promise<void> {
    if (!this._client || !content) {
      return;
    }
    try {
      const sdk = this._sdk!;
      const message = new sdk.TextMessage({
        role: 'system',
        content: `[MEMORY_MIRROR][${action}][${target}] ${content}`,
        actorId: this._actorId,
        assistantId: this._assistantId,
      });
      await this._client.addMessages(this._spaceId, this._sessionId, [message]);
    } catch (error) {
      logger.warning(`on_memory_write failed: ${_errorMessage(error)}`);
    }
  }

  /** Default no-op; turns are already persisted via {@link syncTurn}. */
  async onSessionEnd(_messages: Array<any>): Promise<void> {
    // Nothing to do.
  }

  /** Clean up connections on process exit. */
  async shutdown(): Promise<void> {
    if (this._fileLogger !== null) {
      this._fileLogger.close();
      this._fileLogger = null;
    }
    if (this._client) {
      try {
        await this._client.close();
      } catch (error) {
        logger.warning(`shutdown failed: ${_errorMessage(error)}`);
      }
    }
    this._client = null;
  }

  /** Write a log line to both the SDK logger and the provider log file. */
  private _log(level: 'INFO' | 'WARNING' | 'ERROR', funcName: string, message: string): void {
    if (level === 'WARNING') {
      logger.warning(message);
    } else if (level === 'ERROR') {
      logger.error(message);
    } else {
      logger.info(message);
    }
    this._fileLogger?.write(level, funcName, message);
  }
}

/**
 * Entry point called by the Hermes memory plugin discovery system.
 */
export function register(ctx: {
  registerMemoryProvider: (provider: any) => void;
}): void {
  ctx.registerMemoryProvider(new AgentArtsMemoryProvider());
}

/** `str(exc)` counterpart. */
function _errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
