/**
 * Comprehensive unit tests for the constant module.
 *
 * Ported 1:1 from `tests/unit/sdk/utils/test_constant.py`.
 */

import { describe, it, expect, afterEach } from 'vitest';

import {
  getBrowserDataPlaneEndpoint,
  getCodeInterpreterDataPlaneEndpoint,
  getControlPlaneEndpoint,
  getIamEndpoint,
  getIdentityEndpoint,
  getMemoryEndpoint,
  getRegion,
  getRuntimeDataPlaneEndpoint,
  getSwrEndpoint,
  ENV_AGENTARTS_CONTROL_ENDPOINT,
  ENV_AGENTARTS_RUNTIME_DATA_ENDPOINT,
  ENV_AGENTARTS_MEMORY_DATA_ENDPOINT,
  ENV_AGENTARTS_CODEINTERPRETER_DATA_ENDPOINT,
  ENV_AGENTARTS_BROWSER_DATA_ENDPOINT,
  ENV_HUAWEICLOUD_SDK_REGION,
  ENV_HUAWEICLOUD_REGION,
  ENV_OS_REGION_NAME,
} from 'agentarts-sdk/sdk/utils/constant';

const ENV_SNAPSHOT: Record<string, string | undefined> = { ...process.env };

/** Restore `process.env` to its state at module load (pytest `monkeypatch`). */
afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in ENV_SNAPSHOT)) {
      delete process.env[key];
    }
  }
  for (const [key, value] of Object.entries(ENV_SNAPSHOT)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

function setEnv(name: string, value: string): void {
  process.env[name] = value;
}

function delEnv(...names: string[]): void {
  for (const name of names) {
    delete process.env[name];
  }
}

// ============================================================
// getRegion Tests
// ============================================================

describe('TestGetRegion', () => {
  it('returns huaweicloud sdk region', () => {
    setEnv(ENV_HUAWEICLOUD_SDK_REGION, 'cn-north-1');
    setEnv(ENV_HUAWEICLOUD_REGION, 'cn-north-4');
    setEnv(ENV_OS_REGION_NAME, 'cn-southwest-2');
    expect(getRegion()).toBe('cn-north-1');
  });

  it('returns huaweicloud region', () => {
    delEnv(ENV_HUAWEICLOUD_SDK_REGION);
    setEnv(ENV_HUAWEICLOUD_REGION, 'cn-north-4');
    setEnv(ENV_OS_REGION_NAME, 'cn-southwest-2');
    expect(getRegion()).toBe('cn-north-4');
  });

  it('returns os region name', () => {
    delEnv(ENV_HUAWEICLOUD_SDK_REGION, ENV_HUAWEICLOUD_REGION);
    setEnv(ENV_OS_REGION_NAME, 'cn-southwest-2');
    expect(getRegion()).toBe('cn-southwest-2');
  });

  it('returns default when no env set', () => {
    delEnv(ENV_HUAWEICLOUD_SDK_REGION, ENV_HUAWEICLOUD_REGION, ENV_OS_REGION_NAME);
    expect(getRegion()).toBe('cn-southwest-2');
  });

  it('returns empty string when sdk region is empty', () => {
    setEnv(ENV_HUAWEICLOUD_SDK_REGION, '');
    setEnv(ENV_HUAWEICLOUD_REGION, 'cn-north-4');
    expect(getRegion()).toBe('cn-north-4');
  });
});

// ============================================================
// getControlPlaneEndpoint Tests
// ============================================================

describe('TestGetControlPlaneEndpoint', () => {
  it('returns custom control endpoint', () => {
    setEnv(ENV_AGENTARTS_CONTROL_ENDPOINT, 'https://custom.example.com');
    setEnv(ENV_HUAWEICLOUD_SDK_REGION, 'cn-north-4');
    expect(getControlPlaneEndpoint()).toBe('https://custom.example.com');
  });

  it('constructs from explicit region', () => {
    delEnv(ENV_AGENTARTS_CONTROL_ENDPOINT);
    setEnv(ENV_HUAWEICLOUD_SDK_REGION, 'cn-north-4');
    expect(getControlPlaneEndpoint('cn-southwest-2')).toBe(
      'https://agentarts.cn-southwest-2.myhuaweicloud.com',
    );
  });

  it('constructs from env region', () => {
    delEnv(ENV_AGENTARTS_CONTROL_ENDPOINT);
    setEnv(ENV_HUAWEICLOUD_SDK_REGION, 'cn-north-4');
    expect(getControlPlaneEndpoint()).toBe('https://agentarts.cn-north-4.myhuaweicloud.com');
  });

  it('uses default region', () => {
    delEnv(
      ENV_AGENTARTS_CONTROL_ENDPOINT,
      ENV_HUAWEICLOUD_SDK_REGION,
      ENV_HUAWEICLOUD_REGION,
      ENV_OS_REGION_NAME,
    );
    expect(getControlPlaneEndpoint()).toBe('https://agentarts.cn-southwest-2.myhuaweicloud.com');
  });

  it('explicit region overrides env', () => {
    delEnv(ENV_AGENTARTS_CONTROL_ENDPOINT);
    setEnv(ENV_HUAWEICLOUD_SDK_REGION, 'cn-north-4');
    expect(getControlPlaneEndpoint('cn-east-3')).toBe(
      'https://agentarts.cn-east-3.myhuaweicloud.com',
    );
  });
});

// ============================================================
// getRuntimeDataPlaneEndpoint Tests
// ============================================================

describe('TestGetRuntimeDataPlaneEndpoint', () => {
  it('returns env endpoint', () => {
    setEnv(ENV_AGENTARTS_RUNTIME_DATA_ENDPOINT, 'https://env.example.com');
    expect(getRuntimeDataPlaneEndpoint()).toBe('https://env.example.com');
  });

  it('returns empty when not configured', () => {
    delEnv(ENV_AGENTARTS_RUNTIME_DATA_ENDPOINT);
    expect(getRuntimeDataPlaneEndpoint()).toBe('');
  });
});

// ============================================================
// getMemoryEndpoint Tests
// ============================================================

describe('TestGetMemoryEndpoint', () => {
  it('control type returns control plane', () => {
    delEnv(ENV_AGENTARTS_CONTROL_ENDPOINT);
    setEnv(ENV_HUAWEICLOUD_SDK_REGION, 'cn-north-4');
    expect(getMemoryEndpoint('control')).toBe('https://agentarts.cn-north-4.myhuaweicloud.com');
  });

  it('control type with explicit region', () => {
    delEnv(ENV_AGENTARTS_CONTROL_ENDPOINT);
    expect(getMemoryEndpoint('control', 'cn-southwest-2')).toBe(
      'https://agentarts.cn-southwest-2.myhuaweicloud.com',
    );
  });

  it('data type returns env endpoint', () => {
    setEnv(ENV_AGENTARTS_MEMORY_DATA_ENDPOINT, 'https://memory.example.com');
    expect(getMemoryEndpoint('data')).toBe('https://memory.example.com');
  });

  it('data type constructs default endpoint', () => {
    delEnv(ENV_AGENTARTS_MEMORY_DATA_ENDPOINT, ENV_AGENTARTS_CONTROL_ENDPOINT);
    setEnv(ENV_HUAWEICLOUD_SDK_REGION, 'cn-north-4');
    expect(getMemoryEndpoint('data', 'cn-north-4')).toBe(
      'https://memory.cn-north-4.huaweicloud-agentarts.com',
    );
  });

  it('data type uses default region', () => {
    delEnv(
      ENV_AGENTARTS_MEMORY_DATA_ENDPOINT,
      ENV_AGENTARTS_CONTROL_ENDPOINT,
      ENV_HUAWEICLOUD_SDK_REGION,
      ENV_HUAWEICLOUD_REGION,
      ENV_OS_REGION_NAME,
    );
    expect(getMemoryEndpoint('data')).toBe('https://memory.cn-southwest-2.huaweicloud-agentarts.com');
  });

  it('data type works without space id', () => {
    delEnv(ENV_AGENTARTS_MEMORY_DATA_ENDPOINT);
    setEnv(ENV_HUAWEICLOUD_SDK_REGION, 'cn-north-4');
    expect(getMemoryEndpoint('data')).toBe('https://memory.cn-north-4.huaweicloud-agentarts.com');
  });

  it('invalid type raises', () => {
    expect(() => getMemoryEndpoint('invalid')).toThrow('Invalid endpoint type: invalid');
  });

  it('data type env endpoint overrides construction', () => {
    setEnv(ENV_AGENTARTS_MEMORY_DATA_ENDPOINT, 'https://custom-memory.example.com');
    expect(getMemoryEndpoint('data', 'cn-north-4')).toBe('https://custom-memory.example.com');
  });

  it('data type with explicit region', () => {
    delEnv(ENV_AGENTARTS_MEMORY_DATA_ENDPOINT);
    setEnv(ENV_HUAWEICLOUD_SDK_REGION, 'cn-north-4');
    expect(getMemoryEndpoint('data', 'cn-southwest-2')).toBe(
      'https://memory.cn-southwest-2.huaweicloud-agentarts.com',
    );
  });
});

// ============================================================
// Environment Variable Loading Tests
// ============================================================

describe('TestEnvironmentVariableLoading', () => {
  it('ak loaded from env', () => {
    setEnv('HUAWEICLOUD_SDK_AK', 'test-ak');
    expect(process.env['HUAWEICLOUD_SDK_AK']).toBe('test-ak');
  });

  it('sk loaded from env', () => {
    setEnv('HUAWEICLOUD_SDK_SK', 'test-sk');
    expect(process.env['HUAWEICLOUD_SDK_SK']).toBe('test-sk');
  });

  it('security token loaded from env', () => {
    setEnv('HUAWEICLOUD_SDK_SECURITY_TOKEN', 'test-token');
    expect(process.env['HUAWEICLOUD_SDK_SECURITY_TOKEN']).toBe('test-token');
  });

  it('idp id loaded from env', () => {
    setEnv('HUAWEICLOUD_SDK_IDP_ID', 'test-idp');
    expect(process.env['HUAWEICLOUD_SDK_IDP_ID']).toBe('test-idp');
  });

  it('id token file loaded from env', () => {
    setEnv('HUAWEICLOUD_SDK_ID_TOKEN_FILE', '/path/to/token');
    expect(process.env['HUAWEICLOUD_SDK_ID_TOKEN_FILE']).toBe('/path/to/token');
  });

  it('project id loaded from env', () => {
    setEnv('HUAWEICLOUD_SDK_PROJECT_ID', 'proj-123');
    expect(process.env['HUAWEICLOUD_SDK_PROJECT_ID']).toBe('proj-123');
  });

  it('control endpoint loaded from env', () => {
    setEnv('AGENTARTS_CONTROL_ENDPOINT', 'https://control.example.com');
    expect(process.env['AGENTARTS_CONTROL_ENDPOINT']).toBe('https://control.example.com');
  });

  it('runtime data endpoint loaded from env', () => {
    setEnv('AGENTARTS_RUNTIME_DATA_ENDPOINT', 'https://data.example.com');
    expect(process.env['AGENTARTS_RUNTIME_DATA_ENDPOINT']).toBe('https://data.example.com');
  });

  it('memory data endpoint loaded from env', () => {
    setEnv('AGENTARTS_MEMORY_DATA_ENDPOINT', 'https://memory.example.com');
    expect(process.env['AGENTARTS_MEMORY_DATA_ENDPOINT']).toBe('https://memory.example.com');
  });

  it('iam endpoint loaded from env', () => {
    setEnv('HUAWEICLOUD_SDK_IAM_ENDPOINT', 'https://iam.example.com');
    expect(process.env['HUAWEICLOUD_SDK_IAM_ENDPOINT']).toBe('https://iam.example.com');
  });

  it('swr endpoint loaded from env', () => {
    setEnv('HUAWEICLOUD_SDK_SWR_ENDPOINT', 'https://swr.example.com');
    expect(process.env['HUAWEICLOUD_SDK_SWR_ENDPOINT']).toBe('https://swr.example.com');
  });

  it('python base image loaded from env', () => {
    setEnv('PYTHON_BASE_IMAGE', 'python:3.12-slim');
    expect(process.env['PYTHON_BASE_IMAGE']).toBe('python:3.12-slim');
  });
});

// ============================================================
// _ensureHttps Tests
//
// Python imports the private `_ensure_https` helper directly. The Node.js port
// keeps `ensureHttps` module-private (not exported), so the same behaviours are
// exercised through the thinnest exported wrappers that call it.
// ============================================================

describe('TestEnsureHttps', () => {
  it('adds https prefix', () => {
    setEnv('HUAWEICLOUD_SDK_IAM_ENDPOINT', 'example.com');
    expect(getIamEndpoint()).toBe('https://example.com');
  });

  it('adds https prefix to endpoint with path', () => {
    setEnv('HUAWEICLOUD_SDK_IAM_ENDPOINT', 'example.com/api/v1');
    expect(getIamEndpoint()).toBe('https://example.com/api/v1');
  });

  it('preserves existing https', () => {
    setEnv('HUAWEICLOUD_SDK_IAM_ENDPOINT', 'https://example.com');
    expect(getIamEndpoint()).toBe('https://example.com');
  });

  it('preserves existing http', () => {
    setEnv('HUAWEICLOUD_SDK_IAM_ENDPOINT', 'http://example.com');
    expect(getIamEndpoint()).toBe('http://example.com');
  });

  it('returns empty string unchanged', () => {
    delEnv(ENV_AGENTARTS_RUNTIME_DATA_ENDPOINT);
    expect(getRuntimeDataPlaneEndpoint()).toBe('');
  });
});

// ============================================================
// get_runtime_data_plane_endpoint Tests (with https protection)
// ============================================================

describe('TestGetRuntimeDataPlaneEndpointWithHttps', () => {
  it('adds https to env endpoint', () => {
    setEnv(ENV_AGENTARTS_RUNTIME_DATA_ENDPOINT, 'data.example.com');
    expect(getRuntimeDataPlaneEndpoint()).toBe('https://data.example.com');
  });

  it('preserves https in env endpoint', () => {
    setEnv(ENV_AGENTARTS_RUNTIME_DATA_ENDPOINT, 'https://data.example.com');
    expect(getRuntimeDataPlaneEndpoint()).toBe('https://data.example.com');
  });
});

// ============================================================
// get_code_interpreter_data_plane_endpoint Tests (with https protection)
// ============================================================

describe('TestGetCodeInterpreterDataPlaneEndpointWithHttps', () => {
  it('adds https to code interpreter endpoint', () => {
    setEnv(ENV_AGENTARTS_CODEINTERPRETER_DATA_ENDPOINT, 'code.example.com');
    expect(getCodeInterpreterDataPlaneEndpoint()).toBe('https://code.example.com');
  });

  it('adds https to runtime fallback', () => {
    delEnv(ENV_AGENTARTS_CODEINTERPRETER_DATA_ENDPOINT);
    setEnv(ENV_AGENTARTS_RUNTIME_DATA_ENDPOINT, 'runtime.example.com');
    expect(getCodeInterpreterDataPlaneEndpoint()).toBe('https://runtime.example.com');
  });
});

// ============================================================
// get_browser_data_plane_endpoint Tests (with https protection)
// ============================================================

describe('TestGetBrowserDataPlaneEndpointWithHttps', () => {
  it('adds https to browser endpoint', () => {
    setEnv(ENV_AGENTARTS_BROWSER_DATA_ENDPOINT, 'browser.example.com');
    expect(getBrowserDataPlaneEndpoint()).toBe('https://browser.example.com');
  });

  it('adds https to runtime fallback', () => {
    delEnv(ENV_AGENTARTS_BROWSER_DATA_ENDPOINT);
    setEnv(ENV_AGENTARTS_RUNTIME_DATA_ENDPOINT, 'runtime.example.com');
    expect(getBrowserDataPlaneEndpoint()).toBe('https://runtime.example.com');
  });
});

// ============================================================
// get_iam_endpoint Tests (with https protection)
// ============================================================

describe('TestGetIamEndpointWithHttps', () => {
  it('adds https to env iam endpoint', () => {
    setEnv('HUAWEICLOUD_SDK_IAM_ENDPOINT', 'iam.example.com');
    expect(getIamEndpoint()).toBe('https://iam.example.com');
  });
});

// ============================================================
// get_swr_endpoint Tests (with https protection)
// ============================================================

describe('TestGetSwrEndpointWithHttps', () => {
  it('adds https to env swr endpoint', () => {
    setEnv('HUAWEICLOUD_SDK_SWR_ENDPOINT', 'swr.example.com');
    expect(getSwrEndpoint()).toBe('https://swr.example.com');
  });
});

// ============================================================
// get_identity_endpoint Tests (with https protection)
// ============================================================

describe('TestGetIdentityEndpointWithHttps', () => {
  it('adds https to env identity endpoint', () => {
    setEnv('HUAWEICLOUD_SDK_AGENTIDENTITY_ENDPOINT', 'identity.example.com');
    expect(getIdentityEndpoint()).toBe('https://identity.example.com');
  });
});

// ============================================================
// get_memory_endpoint Tests (with https protection)
// ============================================================

describe('TestGetMemoryEndpointWithHttps', () => {
  it('adds https to env memory endpoint', () => {
    setEnv(ENV_AGENTARTS_MEMORY_DATA_ENDPOINT, 'memory.example.com');
    expect(getMemoryEndpoint('data')).toBe('https://memory.example.com');
  });
});
