/**
 * Unit tests for User-Agent construction utilities.
 *
 * Ported 1:1 from `tests/unit/sdk/utils/test_user_agent.py`.
 */

import { describe, it, expect } from 'vitest';

import {
  buildUserAgent,
  getOsMetadata,
  getSdkVersion,
} from 'agentarts-sdk/sdk/utils/user-agent';
import { SDK_PRODUCT, SDK_VERSION } from 'agentarts-sdk/version';

describe('TestUserAgent', () => {
  it('getSdkVersion is not placeholder', () => {
    // Version comes from the packaged SDK metadata module, not a 0.0.1 placeholder.
    expect(getSdkVersion()).not.toBe('0.0.1');
  });

  it('getSdkVersion returns the packaged version', () => {
    // Python resolves the version through importlib.metadata and falls back to
    // "0.1.0" when the package is not installed. The Node.js port reads the
    // packaged `SDK_VERSION` constant, so there is no metadata lookup that can
    // fail: the equivalent assertion is that the returned version is exactly
    // the packaged constant and is a non-empty dotted version string.
    expect(getSdkVersion()).toBe(SDK_VERSION);
    expect(getSdkVersion()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('getOsMetadata format', () => {
    const meta = getOsMetadata();
    expect(meta.startsWith('os/')).toBe(true);
    expect(meta.split('/').length - 1).toBe(2);
  });

  it('buildUserAgent without original', () => {
    expect(buildUserAgent()).toBe(`${getOsMetadata()} ${SDK_PRODUCT}/${getSdkVersion()}`);
  });

  it('buildUserAgent preserves original', () => {
    const original = 'python-requests/2.31.0';
    const ua = buildUserAgent(original);
    expect(ua).toBe(`${original} ${getOsMetadata()} ${SDK_PRODUCT}/${getSdkVersion()}`);
  });

  it('buildUserAgent ordering', () => {
    const ua = buildUserAgent('python-requests/2.31.0');
    expect(ua.startsWith('python-requests/2.31.0 os/')).toBe(true);
    expect(ua).toContain(` ${SDK_PRODUCT}/`);
    expect(ua.split(`${SDK_PRODUCT}/`).length - 1).toBe(1);
  });
});
