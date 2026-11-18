/**
 * Unit tests for common utility functions.
 *
 * Ported 1:1 from `tests/unit/sdk/utils/test_common.py`.
 */

import { describe, it, expect } from 'vitest';

import { generateRandomString } from 'agentarts-sdk/sdk/utils/common';

describe('TestCommonUtils', () => {
  it('generateRandomString with default length', () => {
    const result = generateRandomString();
    expect(typeof result).toBe('string');
    expect(result.length).toBe(4);
  });

  it('generateRandomString with custom length', () => {
    const length = 8;
    const result = generateRandomString(length);
    expect(typeof result).toBe('string');
    expect(result.length).toBe(length);
  });

  it('generateRandomString with minimum length', () => {
    const result = generateRandomString(4);
    expect(typeof result).toBe('string');
    expect(result.length).toBe(4);
  });

  it('generateRandomString with maximum length', () => {
    const result = generateRandomString(64);
    expect(typeof result).toBe('string');
    expect(result.length).toBe(64);
  });

  it('generateRandomString with invalid length', () => {
    expect(() => generateRandomString(3)).toThrow();
    expect(() => generateRandomString(65)).toThrow();
  });
});
