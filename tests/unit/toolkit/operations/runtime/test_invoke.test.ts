/**
 * Unit tests for the runtime invoke operation.
 *
 * Ported 1:1 from `tests/unit/toolkit/operations/runtime/test_invoke.py`.
 *
 * Mock strategy:
 * - `patch("…invoke.LocalRuntimeClient")` / `RuntimeClient` → `vi.spyOn` on the
 *   real classes' `invokeAgent` prototype method (the port constructs the client
 *   with an object literal, so the prototype method is the seam the Python mock
 *   replaces);
 * - `patch("…invoke._get_data_endpoint")` → `vi.stubEnv` on
 *   `AGENTARTS_RUNTIME_DATA_ENDPOINT`, which `_getDataEndpoint()` consults before
 *   the control plane (the helper is module-private, so it cannot be spied on);
 * - `monkeypatch.setenv("BEARER_TOKEN", …)` → `vi.stubEnv("BEARER_TOKEN", …)`;
 * - `monkeypatch.chdir(tmp_path)` → `process.cwd()` stubbed to a `mkdtemp()` dir.
 *
 * `_ensure_https` lives in `agentarts.sdk.utils.constant` in Python; the port
 * exposes it as `_ensureHttps` from this module.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  InvokeMode,
  _ensureHttps,
  _resolveAgentInfo,
  _validateAndNormalizeCustomPath,
  invokeAgent,
} from 'agentarts-sdk/toolkit/operations/runtime/invoke';
import {
  LocalRuntimeClient,
  RuntimeClient,
} from 'agentarts-sdk/sdk/service/runtime-client';

const CONFIG = `
default_agent: test-agent
agents:
  test-agent:
    base:
      name: test-agent
      region: cn-north-4
`;

const CONFIG_WITH_AGENT_ID = `
default_agent: test-agent
agents:
  test-agent:
    base:
      name: test-agent
      region: cn-north-4
    runtime:
      agent_id: agent-123
      identity_configuration:
        authorizer_type: IAM
`;

const CONFIG_CUSTOM_JWT = `
default_agent: test-agent
agents:
  test-agent:
    base:
      name: test-agent
      region: cn-north-4
    runtime:
      identity_configuration:
        authorizer_type: CUSTOM_JWT
`;

const PAYLOAD = '{"message": "hello"}';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'agentarts-invoke-'));
  // Python `monkeypatch.chdir(tmp_path)`: `_resolveAgentInfo()` looks the config
  // file up through `process.cwd()`, which is stubbed instead of changing the
  // real working directory (the vitest threads pool shares one process).
  vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('InvokeMode', () => {
  it('has a local mode', () => {
    expect(InvokeMode.LOCAL).toBe('local');
  });

  it('has a cloud mode', () => {
    expect(InvokeMode.CLOUD).toBe('cloud');
  });
});

describe('_ensureHttps', () => {
  it('adds the https:// prefix', () => {
    expect(_ensureHttps('example.com')).toBe('https://example.com');
  });

  it('preserves an existing https:// prefix', () => {
    expect(_ensureHttps('https://example.com')).toBe('https://example.com');
  });

  it('preserves an existing http:// prefix', () => {
    expect(_ensureHttps('http://example.com')).toBe('http://example.com');
  });

  it('returns an empty string unchanged', () => {
    expect(_ensureHttps('')).toBe('');
  });

  it('returns null unchanged', () => {
    expect(_ensureHttps(null)).toBeNull();
  });
});

describe('_resolveAgentInfo', () => {
  it('returns no agent but defaults the auth type to IAM when there is no config', () => {
    // With no config, name/region are null but auth_type defaults to IAM so
    // data-plane commands still sign with V11 (not an unsigned request).
    const [name, region, , authType] = _resolveAgentInfo(null, null);

    expect(name).toBeNull();
    expect(region).toBeNull();
    expect(authType).toBe('IAM');
  });

  it('defaults to IAM when the agent has no identity configuration', () => {
    writeFileSync(join(tmpDir, '.agentarts_config.yaml'), CONFIG);

    const [, , , authType] = _resolveAgentInfo(null, null);

    expect(authType).toBe('IAM');
  });

  it('defaults to IAM when the passed agent is not in the config', () => {
    const [, , , authType] = _resolveAgentInfo('some-agent', null);

    expect(authType).toBe('IAM');
  });

  it('resolves the agent info from the config', () => {
    writeFileSync(join(tmpDir, '.agentarts_config.yaml'), CONFIG_WITH_AGENT_ID);

    const [name, region, agentId, authType] = _resolveAgentInfo(null, null);

    expect(name).toBe('test-agent');
    expect(region).toBe('cn-north-4');
    expect(agentId).toBe('agent-123');
    expect(authType).toBe('IAM');
  });
});

describe('invokeAgent', () => {
  it('returns false for an invalid JSON payload', async () => {
    const result = await invokeAgent({ payload: 'not valid json' });

    expect(result).toBe(false);
  });

  it('invokes the local client in local mode', async () => {
    writeFileSync(join(tmpDir, '.agentarts_config.yaml'), CONFIG);
    const mockInvoke = vi
      .spyOn(LocalRuntimeClient.prototype, 'invokeAgent')
      .mockResolvedValue({ status: 'ok' });

    const result = await invokeAgent({ payload: PAYLOAD, mode: InvokeMode.LOCAL });

    expect(result).toBe(true);
    expect(mockInvoke).toHaveBeenCalled();
  });

  it('uses the bearer token from the environment', async () => {
    vi.stubEnv('BEARER_TOKEN', 'env-token');
    vi.stubEnv('AGENTARTS_RUNTIME_DATA_ENDPOINT', 'https://example.com');
    writeFileSync(join(tmpDir, '.agentarts_config.yaml'), CONFIG_CUSTOM_JWT);
    const mockInvoke = vi
      .spyOn(RuntimeClient.prototype, 'invokeAgent')
      .mockResolvedValue({ status: 'ok' });

    await invokeAgent({ payload: PAYLOAD, mode: InvokeMode.CLOUD });

    const options = mockInvoke.mock.calls[0]![3] as Record<string, any>;
    expect(options['bearerToken']).toBe('env-token');
  });

  it('lets the CLI bearer token override the environment', async () => {
    vi.stubEnv('BEARER_TOKEN', 'env-token');
    vi.stubEnv('AGENTARTS_RUNTIME_DATA_ENDPOINT', 'https://example.com');
    writeFileSync(join(tmpDir, '.agentarts_config.yaml'), CONFIG_CUSTOM_JWT);
    const mockInvoke = vi
      .spyOn(RuntimeClient.prototype, 'invokeAgent')
      .mockResolvedValue({ status: 'ok' });

    await invokeAgent({ payload: PAYLOAD, mode: InvokeMode.CLOUD, bearerToken: 'cli-token' });

    const options = mockInvoke.mock.calls[0]![3] as Record<string, any>;
    expect(options['bearerToken']).toBe('cli-token');
  });
});

describe('_validateAndNormalizeCustomPath', () => {
  it('returns null for a null input', () => {
    expect(_validateAndNormalizeCustomPath(null)).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(_validateAndNormalizeCustomPath('')).toBeNull();
  });

  it('returns null for whitespace only', () => {
    expect(_validateAndNormalizeCustomPath('   ')).toBeNull();
  });

  it('strips a leading slash', () => {
    expect(_validateAndNormalizeCustomPath('/stream')).toBe('stream');
  });

  it('strips a trailing slash', () => {
    expect(_validateAndNormalizeCustomPath('stream/')).toBe('stream');
  });

  it('strips both slashes', () => {
    expect(_validateAndNormalizeCustomPath('/stream/')).toBe('stream');
  });

  it('accepts a simple path', () => {
    expect(_validateAndNormalizeCustomPath('stream')).toBe('stream');
  });

  it('accepts a nested path', () => {
    expect(_validateAndNormalizeCustomPath('api/v2/stream')).toBe('api/v2/stream');
  });

  it('accepts hyphens', () => {
    expect(_validateAndNormalizeCustomPath('custom-endpoint')).toBe('custom-endpoint');
  });

  it('accepts underscores', () => {
    expect(_validateAndNormalizeCustomPath('custom_endpoint')).toBe('custom_endpoint');
  });

  it('accepts dots', () => {
    expect(_validateAndNormalizeCustomPath('api.v2.endpoint')).toBe('api.v2.endpoint');
  });

  it('accepts a complex path', () => {
    expect(_validateAndNormalizeCustomPath('api/v2/custom-endpoint_stream.json')).toBe(
      'api/v2/custom-endpoint_stream.json',
    );
  });

  it.each([
    ['stream!test', 'exclamation mark'],
    ['stream@test', 'at symbol'],
    ['stream#test', 'hash symbol'],
    ['stream$test', 'dollar symbol'],
    ['stream%test', 'percent symbol'],
    ['stream&test', 'ampersand'],
    ['stream*test', 'star'],
    ['stream(test)', 'parentheses'],
    ['stream test', 'space'],
  ])('rejects %j (%s)', (customPath) => {
    expect(() => _validateAndNormalizeCustomPath(customPath)).toThrow('Invalid custom path');
  });

  it.each([
    ['../etc/passwd', 'leading traversal'],
    ['api/../secret', 'traversal in the middle'],
    ['api/..../endpoint', 'complex traversal'],
  ])('rejects the path traversal %j (%s)', (customPath) => {
    expect(() => _validateAndNormalizeCustomPath(customPath)).toThrow('Path traversal');
  });
});

describe('invokeAgent with a custom path', () => {
  it('passes the custom path to the local client', async () => {
    writeFileSync(join(tmpDir, '.agentarts_config.yaml'), CONFIG);
    const mockInvoke = vi
      .spyOn(LocalRuntimeClient.prototype, 'invokeAgent')
      .mockResolvedValue({ status: 'ok' });

    await invokeAgent({ payload: PAYLOAD, mode: InvokeMode.LOCAL, customPath: 'stream' });

    const options = mockInvoke.mock.calls[0]![1] as Record<string, any>;
    expect(options['customPath']).toBe('stream');
  });

  it('raises for an invalid custom path', async () => {
    writeFileSync(join(tmpDir, '.agentarts_config.yaml'), CONFIG);

    await expect(
      invokeAgent({ payload: PAYLOAD, mode: InvokeMode.LOCAL, customPath: 'invalid!path' }),
    ).rejects.toThrow('Invalid custom path');
  });

  it('passes the custom path to the cloud client', async () => {
    vi.stubEnv('BEARER_TOKEN', 'test-token');
    vi.stubEnv('AGENTARTS_RUNTIME_DATA_ENDPOINT', 'https://example.com');
    writeFileSync(join(tmpDir, '.agentarts_config.yaml'), CONFIG_CUSTOM_JWT);
    const mockInvoke = vi
      .spyOn(RuntimeClient.prototype, 'invokeAgent')
      .mockResolvedValue({ status: 'ok' });

    await invokeAgent({ payload: PAYLOAD, mode: InvokeMode.CLOUD, customPath: 'api/v2/stream' });

    const options = mockInvoke.mock.calls[0]![3] as Record<string, any>;
    expect(options['customPath']).toBe('api/v2/stream');
  });
});
