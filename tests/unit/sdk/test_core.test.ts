/**
 * Tests for the SDK top-level exports.
 *
 * Ported 1:1 from `tests/unit/sdk/test_core.py`.
 *
 * `import agentarts.sdk` / `from agentarts.sdk import X` become
 * `import * as sdk from 'agentarts-sdk'`, which re-exports `sdk/index.ts`
 * (the port of `agentarts/sdk/__init__.py`) plus the version metadata
 * (`__version__` / `__author__`, kept in `version.ts`).
 */

import { describe, expect, it } from 'vitest';

import * as sdk from 'agentarts-sdk';

describe('test_core', () => {
  it('test_import_sdk', () => {
    // THEN: the SDK namespace exposes version metadata
    expect('__version__' in sdk).toBe(true);
    expect('__author__' in sdk).toBe(true);
    expect(sdk.__version__).toBeDefined();
    expect(sdk.__author__).toBeDefined();
  });

  it('test_import_memory_client', () => {
    expect(sdk.MemoryClient).toBeDefined();
  });

  it('test_import_code_interpreter', () => {
    expect(sdk.CodeInterpreter).toBeDefined();
  });

  it('test_import_browser', () => {
    expect(sdk.Browser).toBeDefined();
  });

  it('test_import_identity_client', () => {
    expect(sdk.IdentityClient).toBeDefined();
  });
});
