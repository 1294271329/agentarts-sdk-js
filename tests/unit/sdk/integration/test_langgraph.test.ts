/**
 * Unit tests for the AgentArts LangGraph integration.
 *
 * Ported 1:1 from `tests/unit/sdk/integration/test_langgraph.py`.
 *
 * Porting notes:
 * - `unittest.mock.patch` -> `vi.spyOn` / `vi.mock`; `Mock()` -> `vi.fn()`.
 * - `pytest.raises(ValueError)` -> `expect(...).toThrow()`: JavaScript has no
 *   `ValueError`, the port throws a plain `Error` (same message as Python).
 * - Python snake_case members -> camelCase (`thread_id` -> `threadId`,
 *   `to_runnable_config` -> `toRunnableConfig`, ...); the `configurable` keys that
 *   belong to the LangGraph protocol stay snake_case.
 * - `LANGCHAIN_AVAILABLE` has no equivalent: the port imports `@langchain/core`
 *   statically, so there is no runtime availability flag (see the skipped test).
 * - No network: every memory/model object used here is a plain in-process value.
 */

import { describe, it, expect } from 'vitest';

import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';

import {
  AgentArtsMemorySessionSaver,
  CheckpointerConfig,
  langgraphMessagesToMemory,
  langgraphToMemoryMessage,
  memoryMessagesToLanggraph,
  memoryToLanggraphMessage,
} from 'agentarts-sdk/sdk/integration/langgraph';
import { _buildMeta, _parseMeta } from 'agentarts-sdk/sdk/integration/langgraph/converter';
import { loadLangGraphIntegration } from 'agentarts-sdk/sdk/integration';
import {
  MessageInfo,
  TextMessage,
  ToolCallMessage,
  ToolResultMessage,
} from 'agentarts-sdk/sdk/memory';
import {
  APIKeyAuthConfig,
  APIKeyPair,
  AuthConfig,
  CustomJWTAuthConfig,
  InboundIdentityConfig,
} from 'agentarts-sdk/toolkit/utils/runtime/config';

/**
 * Build a `MessageInfo`.
 *
 * The backend (and Python's `MessageInfo`) allow `meta` to be either a JSON
 * string or an already parsed dict; the TypeScript model declares it as a dict,
 * so the Python string form needs a cast here.
 */
function messageInfo(init: Omit<Partial<MessageInfo>, 'meta'> & { meta?: any }): MessageInfo {
  return new MessageInfo(init as Partial<MessageInfo>);
}

// ============================================================
// CheckpointerConfig
// ============================================================

describe('TestCheckpointerConfig', () => {
  it('test_from_runnable_config_basic', () => {
    const runnableConfig = {
      configurable: {
        thread_id: 'conv-123',
        actor_id: 'user-456',
        checkpoint_id: 'cp-789',
      },
    };

    const config = CheckpointerConfig.fromRunnableConfig(runnableConfig);

    expect(config.threadId).toBe('conv-123');
    expect(config.actorId).toBe('user-456');
    expect(config.checkpointId).toBe('cp-789');
  });

  it('test_from_runnable_config_missing_thread_id', () => {
    const runnableConfig = { configurable: {} };

    expect(() => CheckpointerConfig.fromRunnableConfig(runnableConfig)).toThrow();
  });

  it('test_from_runnable_config_empty_configurable', () => {
    const runnableConfig = {};

    expect(() => CheckpointerConfig.fromRunnableConfig(runnableConfig)).toThrow();
  });

  it('test_session_id_property', () => {
    const config = new CheckpointerConfig({
      threadId: 'test-thread',
      actorId: 'test-actor',
    });

    expect(config.sessionId).toBe('test-thread');
  });

  it('test_to_runnable_config', () => {
    const config = new CheckpointerConfig({
      threadId: 'conv-123',
      actorId: 'user-456',
      checkpointId: 'cp-789',
      checkpointNs: 'ns-1',
    });

    const result = config.toRunnableConfig();

    expect(result.configurable['thread_id']).toBe('conv-123');
    expect(result.configurable['actor_id']).toBe('user-456');
    expect(result.configurable['checkpoint_id']).toBe('cp-789');
    expect(result.configurable['checkpoint_ns']).toBe('ns-1');
  });

  it('test_to_runnable_config_minimal', () => {
    const config = new CheckpointerConfig({ threadId: 'test-thread' });

    const result = config.toRunnableConfig();

    expect(result.configurable['thread_id']).toBe('test-thread');
  });
});

// ============================================================
// Message converter / memory message models
// ============================================================

describe('TestMessageConverter', () => {
  // Python: `from ...converter import LANGCHAIN_AVAILABLE; assert
  // isinstance(LANGCHAIN_AVAILABLE, bool)`.
  //
  // The TypeScript port has no `LANGCHAIN_AVAILABLE` flag: `converter.ts` imports
  // `@langchain/core` statically through the lazy accessors of
  // `sdk/integration/index.ts`, so the peer is either installed (the module
  // loads) or the import throws -- there is no boolean to assert on. Skipped
  // rather than replaced by a weaker assertion.
  it.skip('test_langchain_available_check', () => {
    // Skipped: `LANGCHAIN_AVAILABLE` does not exist in the TypeScript port.
  });

  it('test_text_message_creation', () => {
    const msg = new TextMessage({ role: 'user', content: 'Hello' });

    expect(msg.role).toBe('user');
    expect(msg.content).toBe('Hello');
  });

  it('test_tool_call_message_creation', () => {
    const msg = new ToolCallMessage({
      id: 'call-123',
      name: 'search',
      arguments: '{"query": "test"}',
    });

    expect(msg.id).toBe('call-123');
    expect(msg.name).toBe('search');
  });

  it('test_tool_result_message_creation', () => {
    const msg = new ToolResultMessage({ toolCallId: 'call-123', content: 'Result' });

    expect(msg.toolCallId).toBe('call-123');
    expect(msg.content).toBe('Result');
  });
});

// ============================================================
// AgentArtsMemorySessionSaver shape
// ============================================================

describe('TestAgentArtsMemorySessionSaver', () => {
  /** Python `hasattr(cls, name)` for a prototype method. */
  function hasMethod(name: string): boolean {
    return typeof (AgentArtsMemorySessionSaver.prototype as any)[name] === 'function';
  }

  /** Python `hasattr(cls, name)` for a class property (a getter in TypeScript). */
  function hasProperty(name: string): boolean {
    const descriptor = Object.getOwnPropertyDescriptor(
      AgentArtsMemorySessionSaver.prototype,
      name,
    );
    return typeof descriptor?.get === 'function';
  }

  it('test_import_saver', () => {
    expect(AgentArtsMemorySessionSaver).toBeTruthy();
  });

  it('test_saver_methods_exist', () => {
    // Sync family (Python get_tuple / put / list / delete_thread / put_writes).
    expect(hasMethod('getTuple')).toBe(true);
    expect(hasMethod('put')).toBe(true);
    expect(hasMethod('list')).toBe(true);
    expect(hasMethod('deleteThread')).toBe(true);
    expect(hasMethod('putWrites')).toBe(true);

    // Async family (Python aget_tuple / aput / alist / adelete_thread / aput_writes).
    expect(hasMethod('agetTuple')).toBe(true);
    expect(hasMethod('aput')).toBe(true);
    expect(hasMethod('alist')).toBe(true);
    expect(hasMethod('adeleteThread')).toBe(true);
    expect(hasMethod('aputWrites')).toBe(true);
  });

  it('test_saver_properties', () => {
    expect(hasProperty('spaceId')).toBe(true);
    expect(hasProperty('region')).toBe(true);
    expect(hasProperty('maxMessages')).toBe(true);
  });
});

// ============================================================
// Integration module exports
// ============================================================

describe('TestIntegrationModule', () => {
  it('test_module_exports', async () => {
    expect(AgentArtsMemorySessionSaver).toBeTruthy();
    expect(CheckpointerConfig).toBeTruthy();
    expect(langgraphToMemoryMessage).toBeTruthy();
    expect(memoryToLanggraphMessage).toBeTruthy();
    expect(langgraphMessagesToMemory).toBeTruthy();
    expect(memoryMessagesToLanggraph).toBeTruthy();

    // `sdk/integration` (Python `agentarts.sdk.integration.__init__`) exposes the
    // same components through its lazy loader; the Python package imports the
    // module eagerly, so this extra assertion has no Python counterpart.
    const integration = await loadLangGraphIntegration();
    expect(typeof integration.AgentArtsMemorySessionSaver).toBe('function');
    expect(typeof integration.CheckpointerConfig).toBe('function');
    expect(typeof integration.langgraphToMemoryMessage).toBe('function');
    expect(typeof integration.memoryToLanggraphMessage).toBe('function');
    expect(typeof integration.langgraphMessagesToMemory).toBe('function');
    expect(typeof integration.memoryMessagesToLanggraph).toBe('function');
  });
});

// ============================================================
// Message `meta` field support
// ============================================================

describe('TestMessageMetaField', () => {
  it('test_text_message_with_meta', () => {
    const msg = new TextMessage({
      role: 'user',
      content: 'Hello',
      meta: '{"key": "value"}',
    });

    expect(msg.role).toBe('user');
    expect(msg.content).toBe('Hello');
    expect(msg.meta).toBe('{"key": "value"}');
  });

  it('test_tool_call_message_with_meta', () => {
    const msg = new ToolCallMessage({
      id: 'call-123',
      name: 'search',
      arguments: '{"query": "test"}',
      meta: '{"checkpoint_id": "cp-456"}',
    });

    expect(msg.id).toBe('call-123');
    expect(msg.name).toBe('search');
    expect(msg.meta).toBe('{"checkpoint_id": "cp-456"}');
  });

  it('test_tool_result_message_with_meta', () => {
    const msg = new ToolResultMessage({
      toolCallId: 'call-123',
      content: 'Result',
      meta: '{"checkpoint_ts": "2024-01-01T00:00:00"}',
    });

    expect(msg.toolCallId).toBe('call-123');
    expect(msg.content).toBe('Result');
    expect(msg.meta).toBe('{"checkpoint_ts": "2024-01-01T00:00:00"}');
  });

  it('test_text_message_to_dict_includes_meta', () => {
    const msg = new TextMessage({
      role: 'user',
      content: 'Hello',
      meta: '{"key": "value"}',
    });
    const result = msg.toDict();

    expect('meta' in result).toBe(true);
    expect(result['meta']).toBe('{"key": "value"}');
  });

  it('test_text_message_to_dict_excludes_none_meta', () => {
    const msg = new TextMessage({ role: 'user', content: 'Hello' });
    const result = msg.toDict();

    expect('meta' in result).toBe(false);
  });
});

// ============================================================
// additional_kwargs / response_metadata preservation
// ============================================================

describe('TestAdditionalKwargsPreservation', () => {
  // --- _parseMeta helper ---

  it('test_parse_meta_none', () => {
    expect(_parseMeta(null)).toEqual({});
  });

  it('test_parse_meta_empty_string', () => {
    expect(_parseMeta('')).toEqual({});
  });

  it('test_parse_meta_json_string', () => {
    expect(_parseMeta('{"step":1}')).toEqual({ step: 1 });
  });

  it('test_parse_meta_empty_json_string', () => {
    expect(_parseMeta('{}')).toEqual({});
  });

  it('test_parse_meta_dict', () => {
    expect(_parseMeta({ step: 1 })).toEqual({ step: 1 });
  });

  it('test_parse_meta_non_json_string', () => {
    expect(_parseMeta('not json')).toEqual({});
  });

  it('test_parse_meta_json_array_string', () => {
    // JSON array is valid JSON but not a dict -- should return {}.
    expect(_parseMeta('[1, 2, 3]')).toEqual({});
  });

  // --- _buildMeta helper ---

  it('test_build_meta_none_caller_no_kwargs', () => {
    expect(_buildMeta()).toBeNull();
  });

  it('test_build_meta_caller_only', () => {
    // Caller meta without LangChain fields is re-serialized unchanged.
    const result = _buildMeta('{"step":1}');
    expect(JSON.parse(result as string)).toEqual({ step: 1 });
  });

  it('test_build_meta_with_additional_kwargs', () => {
    const result = _buildMeta('{"step":1}', { reasoning_content: 'thinking' });
    const parsed = JSON.parse(result as string);
    expect(parsed['step']).toBe(1);
    expect(parsed['_lc_additional_kwargs']).toEqual({ reasoning_content: 'thinking' });
  });

  it('test_build_meta_with_response_metadata', () => {
    const result = _buildMeta(null, undefined, { model_name: 'deepseek-v3.2' });
    const parsed = JSON.parse(result as string);
    expect(parsed['_lc_response_metadata']).toEqual({ model_name: 'deepseek-v3.2' });
  });

  it('test_build_meta_with_extra', () => {
    const result = _buildMeta(null, undefined, undefined, { _lc_content: 'some text' });
    const parsed = JSON.parse(result as string);
    expect(parsed['_lc_content']).toBe('some text');
  });

  it('test_build_meta_empty_additional_kwargs_not_stored', () => {
    // Empty dict additional_kwargs should not be stored (falsy).
    const result = _buildMeta('{"step":1}', {});
    const parsed = JSON.parse(result as string);
    expect('_lc_additional_kwargs' in parsed).toBe(false);
  });

  // --- AIMessage round-trip ---

  it('test_ai_message_round_trip_additional_kwargs', () => {
    // AIMessage with reasoning_content survives a full round-trip.
    const original = new AIMessage({
      content: 'Hello',
      additional_kwargs: { reasoning_content: 'user is greeting' },
    });
    const memMsg = langgraphToMemoryMessage(original, undefined, undefined, '{"step":1}');

    const msgInfo = messageInfo({
      id: '1',
      sessionId: 's1',
      seq: 0,
      role: 'assistant',
      parts: [{ type: 'text', text: 'Hello' }],
      meta: memMsg.meta as any,
    });
    const restored = memoryToLanggraphMessage(msgInfo);

    expect(restored.content).toBe('Hello');
    expect(restored.additional_kwargs).toEqual({ reasoning_content: 'user is greeting' });
  });

  it('test_ai_message_round_trip_response_metadata', () => {
    // AIMessage response_metadata (model_name, finish_reason) survives round-trip.
    const original = new AIMessage({
      content: 'Answer',
      response_metadata: { model_name: 'deepseek-v3.2', finish_reason: 'stop' },
    });
    const memMsg = langgraphToMemoryMessage(original);

    const msgInfo = messageInfo({
      id: '1',
      sessionId: 's1',
      seq: 0,
      role: 'assistant',
      parts: [{ type: 'text', text: 'Answer' }],
      meta: memMsg.meta as any,
    });
    const restored = memoryToLanggraphMessage(msgInfo);

    expect(restored.response_metadata).toEqual({
      model_name: 'deepseek-v3.2',
      finish_reason: 'stop',
    });
  });

  it('test_ai_message_with_tool_calls_preserves_content', () => {
    // AIMessage with both text and tool_calls preserves content in _lc_content.
    const original = new AIMessage({
      content: 'Let me check the weather',
      tool_calls: [{ id: 'tc1', name: 'get_weather', args: { city: 'Tokyo' } }],
      additional_kwargs: { reasoning_content: 'user wants weather' },
    });
    const memMsg = langgraphToMemoryMessage(original, undefined, undefined, '{"step":2}');

    // Verify content stored in meta
    const parsed = JSON.parse(memMsg.meta as string);
    expect(parsed['_lc_content']).toBe('Let me check the weather');

    // Simulate backend round-trip
    const msgInfo = messageInfo({
      id: '2',
      sessionId: 's1',
      seq: 1,
      role: 'tool',
      parts: [
        {
          type: 'tool_call',
          tool_call: {
            id: 'tc1',
            name: 'get_weather',
            arguments: JSON.stringify({ city: 'Tokyo' }),
          },
        },
      ],
      meta: memMsg.meta as any,
    });
    const restored = memoryToLanggraphMessage(msgInfo);

    expect(restored.content).toBe('Let me check the weather');
    expect(restored.additional_kwargs).toEqual({ reasoning_content: 'user wants weather' });
    expect((restored as AIMessage).tool_calls![0]!.name).toBe('get_weather');
  });

  it('test_ai_message_with_tool_calls_no_content', () => {
    // AIMessage with tool_calls but empty content -- _lc_content not stored.
    const original = new AIMessage({
      content: '',
      tool_calls: [{ id: 'tc1', name: 'search', args: { q: 'test' } }],
    });
    const memMsg = langgraphToMemoryMessage(original);

    // No content, no additional_kwargs, no response_metadata, no caller meta
    // -> _buildMeta returns null (nothing to store) -- correct behavior
    expect(memMsg.meta).toBeNull();
  });

  // --- Other message types round-trip ---

  it('test_human_message_round_trip_additional_kwargs', () => {
    const original = new HumanMessage({
      content: 'Question',
      additional_kwargs: { custom: 'data' },
    });
    const memMsg = langgraphToMemoryMessage(original);

    const msgInfo = messageInfo({
      id: '1',
      sessionId: 's1',
      seq: 0,
      role: 'user',
      parts: [{ type: 'text', text: 'Question' }],
      meta: memMsg.meta as any,
    });
    const restored = memoryToLanggraphMessage(msgInfo);

    expect(restored.content).toBe('Question');
    expect(restored.additional_kwargs).toEqual({ custom: 'data' });
  });

  it('test_system_message_round_trip_additional_kwargs', () => {
    const original = new SystemMessage({
      content: 'You are helpful',
      additional_kwargs: { key: 'val' },
    });
    const memMsg = langgraphToMemoryMessage(original);

    const msgInfo = messageInfo({
      id: '1',
      sessionId: 's1',
      seq: 0,
      role: 'system',
      parts: [{ type: 'text', text: 'You are helpful' }],
      meta: memMsg.meta as any,
    });
    const restored = memoryToLanggraphMessage(msgInfo);

    expect(restored.content).toBe('You are helpful');
    expect(restored.additional_kwargs).toEqual({ key: 'val' });
  });

  it('test_tool_message_round_trip_additional_kwargs', () => {
    const original = new ToolMessage({
      content: 'Result data',
      tool_call_id: 'tc1',
      additional_kwargs: { name: 'get_weather' },
    });
    const memMsg = langgraphToMemoryMessage(original);

    const msgInfo = messageInfo({
      id: '1',
      sessionId: 's1',
      seq: 0,
      role: 'tool',
      parts: [
        {
          type: 'tool_result',
          tool_result: { tool_call_id: 'tc1', content: 'Result data' },
        },
      ],
      meta: memMsg.meta as any,
    });
    const restored = memoryToLanggraphMessage(msgInfo);

    expect(restored.content).toBe('Result data');
    expect((restored as ToolMessage).tool_call_id).toBe('tc1');
    expect(restored.additional_kwargs).toEqual({ name: 'get_weather' });
  });

  // --- Backward compatibility ---

  it('test_old_message_without_lc_keys', () => {
    // Old messages without _lc_* keys restore with empty additional_kwargs.
    const msgInfo = messageInfo({
      id: '1',
      sessionId: 's1',
      seq: 0,
      role: 'assistant',
      parts: [{ type: 'text', text: 'old message' }],
      meta: '{"step":1,"source":"loop"}',
    });
    const restored = memoryToLanggraphMessage(msgInfo);

    expect(restored.content).toBe('old message');
    expect(restored.additional_kwargs).toEqual({});
    expect(restored.response_metadata).toEqual({});
  });

  it('test_old_message_meta_none', () => {
    // Message with meta=None restores with empty additional_kwargs.
    const msgInfo = messageInfo({
      id: '1',
      sessionId: 's1',
      seq: 0,
      role: 'user',
      parts: [{ type: 'text', text: 'no meta' }],
      meta: null,
    });
    const restored = memoryToLanggraphMessage(msgInfo);

    expect(restored.additional_kwargs).toEqual({});
  });

  it('test_old_message_meta_non_json', () => {
    // Message with non-JSON meta string does not crash.
    const msgInfo = messageInfo({
      id: '1',
      sessionId: 's1',
      seq: 0,
      role: 'user',
      parts: [{ type: 'text', text: 'bad meta' }],
      meta: 'not a json string',
    });
    const restored = memoryToLanggraphMessage(msgInfo);

    expect(restored.additional_kwargs).toEqual({});
  });

  // --- Backend returning meta as dict ---

  it('test_meta_returned_as_dict', () => {
    // Backend may return meta as dict -- should work.
    const msgInfo = messageInfo({
      id: '1',
      sessionId: 's1',
      seq: 0,
      role: 'assistant',
      parts: [{ type: 'text', text: 'dict meta' }],
      meta: { step: 1, _lc_additional_kwargs: { reasoning_content: 'from dict' } },
    });
    const restored = memoryToLanggraphMessage(msgInfo);

    expect(restored.content).toBe('dict meta');
    expect(restored.additional_kwargs).toEqual({ reasoning_content: 'from dict' });
  });

  // --- Saver checkpoint_meta coexistence ---

  it('test_saver_checkpoint_meta_coexists_with_lc_keys', () => {
    // Saver's checkpoint_meta keys and _lc_* keys coexist in the same JSON.
    const checkpointMeta = JSON.stringify({
      step: 3,
      source: 'loop',
      checkpoint_id: 'cp-abc',
      checkpoint_ts: '2026-01-01T00:00:00Z',
    });
    const aiMsg = new AIMessage({
      content: 'Response',
      additional_kwargs: { reasoning_content: 'thinking' },
    });
    const memMsg = langgraphToMemoryMessage(aiMsg, undefined, undefined, checkpointMeta);

    const parsed = JSON.parse(memMsg.meta as string);
    // Saver keys preserved
    expect(parsed['step']).toBe(3);
    expect(parsed['source']).toBe('loop');
    expect(parsed['checkpoint_id']).toBe('cp-abc');
    // LangChain keys added
    expect(parsed['_lc_additional_kwargs']).toEqual({ reasoning_content: 'thinking' });
  });

  it('test_saver_reads_checkpoint_meta_from_merged', () => {
    // Saver's reading logic (step/source) works on merged meta.
    const checkpointMeta = JSON.stringify({
      step: 5,
      source: 'update',
      checkpoint_id: 'cp-xyz',
      checkpoint_ts: '2026-01-01T12:00:00Z',
    });
    const aiMsg = new AIMessage({
      content: 'Hi',
      additional_kwargs: { reasoning_content: 'reasoning' },
      response_metadata: { model_name: 'test-model' },
    });
    const memMsg = langgraphToMemoryMessage(aiMsg, undefined, undefined, checkpointMeta);

    // Simulate saver's getTuple() reading logic
    const meta = JSON.parse(memMsg.meta as string);
    expect(meta['step'] ?? 0).toBe(5);
    expect(meta['source'] ?? 'loop').toBe('update');
    expect(meta['checkpoint_id']).toBe('cp-xyz');
    expect(meta['checkpoint_ts']).toBe('2026-01-01T12:00:00Z');
  });

  // --- Empty additional_kwargs not stored ---

  it('test_empty_additional_kwargs_not_stored', () => {
    // Messages with empty additional_kwargs should not add _lc_additional_kwargs.
    const aiMsg = new AIMessage({ content: 'Hello' }); // no additional_kwargs
    const memMsg = langgraphToMemoryMessage(aiMsg, undefined, undefined, '{"step":1}');

    const parsed = JSON.parse(memMsg.meta as string);
    expect('_lc_additional_kwargs' in parsed).toBe(false);
    expect('_lc_response_metadata' in parsed).toBe(false);
  });

  // --- No caller_meta with additional_kwargs ---

  it('test_no_caller_meta_with_additional_kwargs', () => {
    // When caller_meta is None but message has additional_kwargs, meta is created.
    const aiMsg = new AIMessage({
      content: 'Hello',
      additional_kwargs: { reasoning_content: 'standalone' },
    });
    const memMsg = langgraphToMemoryMessage(aiMsg, undefined, undefined, null);

    expect(memMsg.meta).not.toBeNull();
    const parsed = JSON.parse(memMsg.meta as string);
    expect(parsed['_lc_additional_kwargs']).toEqual({ reasoning_content: 'standalone' });
  });
});

// ============================================================
// is_empty() methods of the runtime config models
// ============================================================

describe('TestConfigIsEmptyMethods', () => {
  it('test_custom_jwt_auth_config_is_empty', () => {
    const config = new CustomJWTAuthConfig();
    expect(config.isEmpty()).toBe(true);

    const configWithUrl = new CustomJWTAuthConfig({ discoveryUrl: 'https://example.com' });
    expect(configWithUrl.isEmpty()).toBe(false);

    const configWithAudience = new CustomJWTAuthConfig({ allowedAudience: ['aud1'] });
    expect(configWithAudience.isEmpty()).toBe(false);
  });

  it('test_auth_config_is_empty', () => {
    const config = new AuthConfig();
    expect(config.isEmpty()).toBe(true);

    const configWithJwt = new AuthConfig({
      customJwt: new CustomJWTAuthConfig({ discoveryUrl: 'https://example.com' }),
    });
    expect(configWithJwt.isEmpty()).toBe(false);

    const configWithKey = new AuthConfig({
      keyAuth: new APIKeyAuthConfig({ apiKeys: [new APIKeyPair({ apiKey: 'key1' })] }),
    });
    expect(configWithKey.isEmpty()).toBe(false);
  });

  it('test_inbound_identity_config_to_dict_excludes_empty', () => {
    const config = new InboundIdentityConfig({
      authorizerType: 'IAM',
      authorizerConfiguration: new AuthConfig(),
    });

    const result = config.toDict();

    expect(result['authorizer_type']).toBe('IAM');
    expect('authorizer_configuration' in result).toBe(false);
  });

  it('test_inbound_identity_config_to_dict_includes_non_empty', () => {
    const config = new InboundIdentityConfig({
      authorizerType: 'CUSTOM_JWT',
      authorizerConfiguration: new AuthConfig({
        customJwt: new CustomJWTAuthConfig({ discoveryUrl: 'https://example.com' }),
      }),
    });

    const result = config.toDict();

    expect(result['authorizer_type']).toBe('CUSTOM_JWT');
    expect('authorizer_configuration' in result).toBe(true);
    expect('custom_jwt' in (result['authorizer_configuration'] as Record<string, any>)).toBe(true);
  });
});

