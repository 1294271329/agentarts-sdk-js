/**
 * Message converters for the AgentArts LangGraph integration.
 *
 * Mirrors `agentarts/sdk/integration/langgraph/converter.py`: bidirectional
 * conversion between LangGraph (LangChain JS) messages and AgentArts Memory
 * service messages.
 *
 * Differences with the Python module (all forced by the JS message API, see the
 * notes on each helper):
 * - Python dispatches with `isinstance`; here the LangChain message `type`
 *   discriminator is used so messages produced by a second copy of
 *   `@langchain/core` (ESM/CJS duplicates) still convert correctly.
 * - `json.dumps(..., ensure_ascii=False)` becomes `JSON.stringify(...)`
 *   (JavaScript never escapes non-ASCII characters, so the payload matches).
 * - `str(message.content)` becomes {@link _asText} (JSON for rich content), since
 *   the Memory message models require `content: string`.
 *
 * `@langchain/core` is an optional peer dependency: this module imports it
 * statically on purpose (it needs the message classes to build values), so it is
 * only loaded through the lazy accessors of `sdk/integration/index.ts`.
 */

import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';

import { TextMessage, ToolCallMessage, ToolResultMessage } from '../../memory/index.js';
import type { MessageInfo } from '../../memory/index.js';
import type { JsonDict } from '../../memory/inner/config.js';

/** Shape of the `meta` field as returned by the Memory backend. */
export type MetaInput = string | Record<string, any> | null | undefined;

/**
 * Parse `meta` from a backend response.
 *
 * Handles both `str` (JSON string) and `dict` (already parsed) formats and
 * returns an empty object when `meta` is empty or unparseable (Python
 * `_parse_meta`).
 */
export function _parseMeta(meta: MetaInput): JsonDict {
  if (!meta) {
    return {};
  }
  if (typeof meta === 'object') {
    return { ...(meta as JsonDict) };
  }
  if (typeof meta === 'string') {
    try {
      const result = JSON.parse(meta);
      if (result && typeof result === 'object' && !Array.isArray(result)) {
        return result as JsonDict;
      }
      return {};
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * Merge the caller's `meta` with the LangChain specific fields.
 *
 * @param callerMeta JSON string from the caller (e.g. the saver's
 *   `checkpoint_meta`).
 * @param additionalKwargs LangChain message's `additional_kwargs`.
 * @param responseMetadata LangChain message's `response_metadata`.
 * @param extra Additional key/value pairs to merge (e.g. `_lc_content`).
 * @returns The merged JSON string, or `callerMeta` when there is nothing to store.
 */
export function _buildMeta(
  callerMeta?: string | null,
  additionalKwargs?: Record<string, any> | null,
  responseMetadata?: Record<string, any> | null,
  extra?: Record<string, any> | null,
): string | null {
  const merged = _parseMeta(callerMeta);

  if (additionalKwargs && Object.keys(additionalKwargs).length > 0) {
    merged['_lc_additional_kwargs'] = additionalKwargs;
  }
  if (responseMetadata && Object.keys(responseMetadata).length > 0) {
    merged['_lc_response_metadata'] = responseMetadata;
  }
  if (extra && Object.keys(extra).length > 0) {
    Object.assign(merged, extra);
  }

  return Object.keys(merged).length > 0 ? JSON.stringify(merged) : (callerMeta ?? null);
}

/** Convert LangChain rich content into the `string` required by Memory models. */
function _asText(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  if (content === null || content === undefined) {
    return '';
  }
  try {
    return JSON.stringify(content) ?? String(content);
  } catch {
    return String(content);
  }
}

/** Convert LangChain rich content into a value accepted by LangChain's message fields. */
function _asContent(content: unknown): any {
  if (typeof content === 'string' || Array.isArray(content)) {
    return content;
  }
  return _asText(content);
}

/** Python truthiness for message content (`if message.content:`). */
function _isTruthy(value: unknown): boolean {
  if (typeof value === 'string') return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return Boolean(value);
}

/** Read a plain object field, mirroring `getattr(message, name, None)`. */
function _asDict(value: unknown): Record<string, any> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, any>;
  }
  return {};
}

/**
 * LangChain message discriminator.
 *
 * Python uses `isinstance`; the JS port reads the `type` field (the stable wire
 * discriminator set by every `BaseMessage` subclass) and falls back to
 * `_getType()` for exotic implementations.
 */
function _messageType(message: BaseMessage): string {
  const candidate = (message as any)?.type;
  if (typeof candidate === 'string') {
    return candidate;
  }
  const getter = (message as any)?._getType;
  if (typeof getter === 'function') {
    const value = getter.call(message);
    if (typeof value === 'string') {
      return value;
    }
  }
  return '';
}

/**
 * Convert a LangGraph message to an AgentArts Memory message.
 *
 * Mapping:
 * - `HumanMessage` -> `TextMessage(role: 'user')`
 * - `AIMessage` -> `TextMessage(role: 'assistant')`
 * - `AIMessage` with `tool_calls` -> `ToolCallMessage` (first tool call)
 * - `SystemMessage` -> `TextMessage(role: 'system')`
 * - `ToolMessage` -> `ToolResultMessage`
 * - `FunctionMessage` -> `ToolResultMessage`
 * - `ChatMessage` -> `TextMessage` with the normalized role
 *
 * @param message LangGraph message (`HumanMessage`, `AIMessage`, ...).
 * @param actorId Actor ID for the message.
 * @param assistantId Assistant ID for the message.
 * @param meta Optional metadata string to attach to the message.
 * @returns The AgentArts Memory message.
 */
export function langgraphToMemoryMessage(
  message: BaseMessage,
  actorId?: string | null,
  assistantId?: string | null,
  meta?: string | null,
): TextMessage | ToolCallMessage | ToolResultMessage {
  const type = _messageType(message);
  const additionalKwargs = _asDict((message as any)?.additional_kwargs);

  if (type === 'human') {
    const mergedMeta = _buildMeta(meta, additionalKwargs);
    return new TextMessage({
      role: 'user',
      content: _asText((message as any).content),
      actorId,
      assistantId,
      meta: mergedMeta,
    });
  }

  if (type === 'ai') {
    const aiMessage = message as AIMessage;
    const toolCalls = (aiMessage.tool_calls ?? []) as Array<Record<string, any>>;
    const responseMetadata = _asDict((aiMessage as any).response_metadata);

    if (toolCalls.length > 0) {
      const extra: Record<string, any> = {};
      if (_isTruthy((aiMessage as any).content)) {
        extra['_lc_content'] = (aiMessage as any).content;
      }

      const mergedMeta = _buildMeta(
        meta,
        additionalKwargs,
        responseMetadata,
        Object.keys(extra).length > 0 ? extra : null,
      );

      const firstToolCall = toolCalls[0]!;
      return new ToolCallMessage({
        id: firstToolCall['id'] ?? '',
        name: firstToolCall['name'] ?? '',
        arguments: JSON.stringify(firstToolCall['args'] ?? {}),
        meta: mergedMeta,
      });
    }

    const mergedMeta = _buildMeta(meta, additionalKwargs, responseMetadata);
    return new TextMessage({
      role: 'assistant',
      content: _asText((message as any).content),
      actorId,
      assistantId,
      meta: mergedMeta,
    });
  }

  if (type === 'system') {
    const mergedMeta = _buildMeta(meta, additionalKwargs);
    return new TextMessage({
      role: 'system',
      content: _asText((message as any).content),
      actorId,
      assistantId,
      meta: mergedMeta,
    });
  }

  if (type === 'tool') {
    const mergedMeta = _buildMeta(meta, additionalKwargs);
    return new ToolResultMessage({
      toolCallId: (message as ToolMessage).tool_call_id,
      content: _asText((message as any).content),
      meta: mergedMeta,
    });
  }

  if (type === 'function') {
    const mergedMeta = _buildMeta(meta, additionalKwargs);
    return new ToolResultMessage({
      toolCallId: (message as any).name ?? '',
      content: _asText((message as any).content),
      meta: mergedMeta,
    });
  }

  if (type === 'chat') {
    let role = (message as any).role as string;
    if (role !== 'user' && role !== 'assistant' && role !== 'system') {
      if (role === 'ai' || role === 'model') {
        role = 'assistant';
      } else if (role === 'human') {
        role = 'user';
      } else {
        role = 'user';
      }
    }
    const mergedMeta = _buildMeta(meta, additionalKwargs);
    return new TextMessage({
      role: role as TextMessage['role'],
      content: _asText((message as any).content),
      actorId,
      assistantId,
      meta: mergedMeta,
    });
  }

  const mergedMeta = _buildMeta(meta, additionalKwargs);
  return new TextMessage({
    role: 'user',
    content: _asText((message as any).content),
    actorId,
    assistantId,
    meta: mergedMeta,
  });
}

/**
 * Convert an AgentArts Memory message to a LangGraph message.
 *
 * Mapping:
 * - `TextMessage(role: 'user')` -> `HumanMessage`
 * - `TextMessage(role: 'assistant')` -> `AIMessage`
 * - `TextMessage(role: 'system')` -> `SystemMessage`
 * - `ToolResultMessage` -> `ToolMessage`
 * - part `tool_result` -> `ToolMessage`
 * - part `tool_call` -> `AIMessage` with a single tool call
 *
 * @param message AgentArts Memory `MessageInfo`.
 * @returns The LangGraph message.
 */
export function memoryToLanggraphMessage(message: MessageInfo): BaseMessage {
  const role = message.role;
  const parts = (message.parts ?? []) as Array<Record<string, any>>;

  // Parse meta to extract the LangChain specific fields.
  const metaDict = _parseMeta(message.meta as MetaInput);
  const additionalKwargs = _asDict(metaDict['_lc_additional_kwargs']);
  const responseMetadata = _asDict(metaDict['_lc_response_metadata']);
  const preservedContent = metaDict['_lc_content'];

  let textContent = '';
  let toolCallData: Record<string, any> | null = null;
  let toolResultData: Record<string, any> | null = null;

  for (const part of parts) {
    if (part && typeof part === 'object') {
      const partType = part['type'] ?? '';

      if (partType === 'text') {
        textContent = part['text'] ?? '';
      } else if (partType === 'tool_call') {
        toolCallData = part['tool_call'] ?? {};
      } else if (partType === 'tool_result') {
        toolResultData = part['tool_result'] ?? {};
      }
    }
  }

  if (toolResultData) {
    return new ToolMessage({
      content: _asContent(toolResultData['content'] ?? ''),
      tool_call_id: toolResultData['tool_call_id'] ?? '',
      additional_kwargs: additionalKwargs,
    });
  }

  if (toolCallData) {
    const content =
      preservedContent !== undefined && preservedContent !== null
        ? preservedContent
        : textContent;
    return new AIMessage({
      content: _asContent(content),
      tool_calls: [
        {
          id: toolCallData['id'] ?? '',
          name: toolCallData['name'] ?? '',
          args: JSON.parse(toolCallData['arguments'] ?? '{}'),
        },
      ],
      additional_kwargs: additionalKwargs,
      response_metadata: responseMetadata,
    });
  }

  if (role === 'user') {
    return new HumanMessage({
      content: _asContent(textContent),
      additional_kwargs: additionalKwargs,
    });
  }
  if (role === 'assistant') {
    return new AIMessage({
      content: _asContent(textContent),
      additional_kwargs: additionalKwargs,
      response_metadata: responseMetadata,
    });
  }
  if (role === 'system') {
    return new SystemMessage({
      content: _asContent(textContent),
      additional_kwargs: additionalKwargs,
    });
  }
  if (role === 'tool') {
    return new ToolMessage({
      content: _asContent(textContent),
      tool_call_id: '',
      additional_kwargs: additionalKwargs,
    });
  }
  return new HumanMessage({
    content: _asContent(textContent),
    additional_kwargs: additionalKwargs,
  });
}

/**
 * Convert a list of LangGraph messages to AgentArts Memory messages.
 *
 * @param messages List of LangGraph messages.
 * @param actorId Actor ID for the messages.
 * @param assistantId Assistant ID for the messages.
 * @param meta Optional metadata string to attach to each message.
 * @returns The list of AgentArts Memory message objects.
 */
export function langgraphMessagesToMemory(
  messages: BaseMessage[],
  actorId?: string | null,
  assistantId?: string | null,
  meta?: string | null,
): Array<TextMessage | ToolCallMessage | ToolResultMessage> {
  return messages.map((msg) =>
    langgraphToMemoryMessage(msg, actorId, assistantId, meta),
  );
}

/**
 * Convert a list of AgentArts Memory messages to LangGraph messages.
 *
 * @param messages List of AgentArts Memory `MessageInfo` objects.
 * @returns The list of LangGraph messages.
 */
export function memoryMessagesToLanggraph(messages: MessageInfo[]): BaseMessage[] {
  return messages.map((msg) => memoryToLanggraphMessage(msg));
}
