/**
 * Unit tests for the common toolkit utilities.
 *
 * Ported 1:1 from `tests/unit/toolkit/utils/test_common.py`.
 *
 * Python returns `(is_valid, error)`; the TypeScript port returns the tuple
 * `[isValid, error]`.
 */

import { describe, it, expect } from 'vitest';

import { validateAgentName } from 'agentarts-sdk/toolkit/utils/common';

describe('validateAgentName', () => {
  it('accepts a simple name like "ab"', () => {
    const [isValid, error] = validateAgentName('ab');
    expect(isValid).toBe(true);
    expect(error).toBe('');
  });

  it('accepts a name with a hyphen', () => {
    const [isValid, error] = validateAgentName('my-agent');
    expect(isValid).toBe(true);
    expect(error).toBe('');
  });

  it('accepts a name with digits', () => {
    const [isValid, error] = validateAgentName('agent123');
    expect(isValid).toBe(true);
    expect(error).toBe('');
  });

  it('accepts a complex name', () => {
    const [isValid, error] = validateAgentName('my-agent-v2');
    expect(isValid).toBe(true);
    expect(error).toBe('');
  });

  it('accepts a name of the minimum length (2)', () => {
    const [isValid, error] = validateAgentName('ab');
    expect(isValid).toBe(true);
    expect(error).toBe('');
  });

  it('accepts a name of the maximum length (48)', () => {
    const longName = `a${'b'.repeat(46)}c`; // 1 + 46 + 1 = 48
    const [isValid, error] = validateAgentName(longName);
    expect(isValid).toBe(true);
    expect(error).toBe('');
  });

  it('rejects an empty name', () => {
    const [isValid, error] = validateAgentName('');
    expect(isValid).toBe(false);
    expect(error.toLowerCase()).toContain('required');
  });

  it('rejects a name shorter than 2 characters', () => {
    const [isValid, error] = validateAgentName('a');
    expect(isValid).toBe(false);
    expect(error).toContain('at least 2');
  });

  it('rejects a name longer than 48 characters', () => {
    const longName = `a${'b'.repeat(48)}c`; // 50 characters
    const [isValid, error] = validateAgentName(longName);
    expect(isValid).toBe(false);
    expect(error).toContain('at most 48');
  });

  it('rejects a name starting with a digit', () => {
    const [isValid, error] = validateAgentName('1agent');
    expect(isValid).toBe(false);
    expect(error).toContain('start with lowercase letter');
  });

  it('rejects a name starting with an uppercase letter', () => {
    const [isValid, error] = validateAgentName('Agent');
    expect(isValid).toBe(false);
    expect(error).toContain('start with lowercase letter');
  });

  it('rejects a name starting with a hyphen', () => {
    const [isValid, error] = validateAgentName('-agent');
    expect(isValid).toBe(false);
    expect(error).toContain('start with lowercase letter');
  });

  it('rejects a name ending with a hyphen', () => {
    const [isValid, error] = validateAgentName('agent-');
    expect(isValid).toBe(false);
    expect(error).toContain('end with lowercase letter or digit');
  });

  it('rejects a name containing uppercase letters', () => {
    const [isValid, error] = validateAgentName('my-Agent');
    expect(isValid).toBe(false);
    expect(error).toContain('lowercase letters, digits, and hyphens');
  });

  it('rejects a name containing an underscore', () => {
    const [isValid, error] = validateAgentName('my_agent');
    expect(isValid).toBe(false);
    expect(error).toContain('lowercase letters, digits, and hyphens');
  });

  it('rejects a name containing a space', () => {
    const [isValid, error] = validateAgentName('my agent');
    expect(isValid).toBe(false);
    expect(error).toContain('lowercase letters, digits, and hyphens');
  });

  it('rejects a name containing a special character', () => {
    const [isValid, error] = validateAgentName('my@agent');
    expect(isValid).toBe(false);
    expect(error).toContain('lowercase letters, digits, and hyphens');
  });

  it('accepts consecutive hyphens (the Python test documents this as valid)', () => {
    const [isValid, error] = validateAgentName('my--agent');
    expect(isValid).toBe(true);
    expect(error).toBe('');
  });

  it('accepts a single character between the first and last', () => {
    const [isValid, error] = validateAgentName('a-b');
    expect(isValid).toBe(true);
    expect(error).toBe('');
  });
});
