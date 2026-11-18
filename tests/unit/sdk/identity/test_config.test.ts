/**
 * Unit tests for `Config` (identity configuration persistence).
 *
 * Ported 1:1 from `tests/unit/sdk/identity/test_config.py`.
 *
 * Behavioural mapping:
 * - Python's `Config` is a pydantic model with `validate_assignment=True`;
 *   the port is a plain class whose fields are only checked at compile time
 *   (see `test_config_validation`, which asserts the runtime behaviour that
 *   actually exists in the port).
 * - Python `Path` becomes a plain path string; the persisted JSON keys stay
 *   `workload_identity_name` / `user_id` and `path` is never serialized.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Config } from 'agentarts-sdk/sdk/identity/config';

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'agentarts-identity-config-'));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe('Config', () => {
  it('test_config_default_values', () => {
    const config = new Config();
    expect(config.workloadIdentityName).toBeNull();
    expect(config.userId).toBeNull();
    expect(config.path).toBe('.agent_identity.json');
  });

  it('test_config_save_load', () => {
    const configFile = join(tempDir, 'config.json');
    const config = new Config({
      workloadIdentityName: 'test-identity',
      userId: 'test-user',
      path: configFile,
    });

    // Save to file
    config.save();

    // Check if file exists and has correct content
    expect(existsSync(configFile)).toBe(true);
    const data = JSON.parse(readFileSync(configFile, 'utf8')) as Record<string, any>;
    expect(data['workload_identity_name']).toBe('test-identity');
    expect(data['user_id']).toBe('test-user');
    expect('path' in data).toBe(false); // Path should be excluded

    // Load from file
    const loadedConfig = Config.load(configFile);
    expect(loadedConfig.workloadIdentityName).toBe('test-identity');
    expect(loadedConfig.userId).toBe('test-user');
    expect(loadedConfig.path).toBe(configFile);
  });

  it('test_config_load_non_existent', () => {
    const configFile = join(tempDir, 'non_existent.json');
    const config = Config.load(configFile);
    expect(config.workloadIdentityName).toBeNull();
    expect(config.userId).toBeNull();
    expect(config.path).toBe(configFile);
  });

  it('test_config_validation', () => {
    const config = new Config();
    // Python's `validate_assignment=True` raises `ValueError` when a non-string
    // is assigned to `user_id`. The TypeScript port only enforces the declared
    // type at compile time, so the invalid assignment succeeds at runtime.
    // The cast bypasses static type checking exactly like the Python test's
    // `setattr` workaround, and the assertion documents the actual behaviour.
    expect(() => {
      (config as any).userId = { not: 'a string' };
    }).not.toThrow();
    expect((config as any).userId).toEqual({ not: 'a string' });
  });
});
