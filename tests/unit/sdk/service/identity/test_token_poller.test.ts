/**
 * Unit tests for the OAuth2 token poller.
 *
 * Ported 1:1 from `tests/unit/sdk/service/identity/test_token_poller.py`.
 *
 * Python patches `asyncio.sleep`; the port polls with `setTimeout`, so fake
 * timers are installed and the 5 s interval / 300 s timeout are advanced
 * virtually instead of waiting in real time.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_POLLING_INTERVAL_SECONDS,
  DEFAULT_POLLING_TIMEOUT_SECONDS,
  DefaultApiTokenPoller,
  PollingResult,
  PollingStatus,
  PollingTimeoutError,
} from 'agentarts-sdk/sdk/service/identity/polling/token-poller';

const AUTH_URL = 'https://example.com/auth';
const INTERVAL_MS = DEFAULT_POLLING_INTERVAL_SECONDS * 1000;
const TIMEOUT_MS = DEFAULT_POLLING_TIMEOUT_SECONDS * 1000;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('DefaultApiTokenPoller.pollForToken', () => {
  it('returns the token on success', async () => {
    const poller = new DefaultApiTokenPoller(
      AUTH_URL,
      () => new PollingResult({ accessToken: 'test-token-123' }),
    );

    const promise = poller.pollForToken();
    await vi.advanceTimersByTimeAsync(INTERVAL_MS);

    await expect(promise).resolves.toBe('test-token-123');
  });

  it('raises immediately on a failed status', async () => {
    const poller = new DefaultApiTokenPoller(
      AUTH_URL,
      () => new PollingResult({ status: PollingStatus.FAILED }),
    );

    const promise = poller.pollForToken();
    const assertion = expect(promise).rejects.toThrow('Authorization session failed');
    await vi.advanceTimersByTimeAsync(INTERVAL_MS);

    await assertion;
  });

  it('polls until the token becomes available', async () => {
    let callCount = 0;
    const poller = new DefaultApiTokenPoller(AUTH_URL, () => {
      callCount += 1;
      if (callCount < 3) {
        return new PollingResult({ status: PollingStatus.IN_PROGRESS });
      }
      return new PollingResult({ accessToken: 'delayed-token' });
    });

    const promise = poller.pollForToken();
    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 3);

    await expect(promise).resolves.toBe('delayed-token');
    expect(callCount).toBe(3);
  });

  it('fails fast after in progress then failed', async () => {
    let callCount = 0;
    const poller = new DefaultApiTokenPoller(AUTH_URL, () => {
      callCount += 1;
      if (callCount < 3) {
        return new PollingResult({ status: PollingStatus.IN_PROGRESS });
      }
      return new PollingResult({ status: PollingStatus.FAILED });
    });

    const promise = poller.pollForToken();
    const assertion = expect(promise).rejects.toThrow('Authorization session failed');
    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 3);

    await assertion;
    expect(callCount).toBe(3);
  });

  it('times out after the polling timeout', async () => {
    let callCount = 0;
    const poller = new DefaultApiTokenPoller(AUTH_URL, () => {
      callCount += 1;
      return new PollingResult({ status: PollingStatus.IN_PROGRESS });
    });

    const promise = poller.pollForToken();
    const typeAssertion = expect(promise).rejects.toBeInstanceOf(PollingTimeoutError);
    const messageAssertion = expect(promise).rejects.toThrow('Polling timed out');
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS);

    await typeAssertion;
    await messageAssertion;
    // The port sleeps before polling, so the timeout window holds exactly
    // `DEFAULT_POLLING_TIMEOUT_SECONDS / DEFAULT_POLLING_INTERVAL_SECONDS` polls.
    expect(callCount).toBe(DEFAULT_POLLING_TIMEOUT_SECONDS / DEFAULT_POLLING_INTERVAL_SECONDS);
  });
});

describe('PollingResult', () => {
  it('defaults to IN_PROGRESS with no token', () => {
    const result = new PollingResult();

    expect(result.status).toBe(PollingStatus.IN_PROGRESS);
    expect(result.accessToken).toBeNull();
  });

  it('keeps the default status when an access token is supplied', () => {
    const result = new PollingResult({ accessToken: 'token-abc' });

    expect(result.status).toBe(PollingStatus.IN_PROGRESS);
    expect(result.accessToken).toBe('token-abc');
  });

  it('can represent a FAILED status', () => {
    const result = new PollingResult({ status: PollingStatus.FAILED });

    expect(result.status).toBe(PollingStatus.FAILED);
    expect(result.accessToken).toBeNull();
  });

  it('is mutable (the Python dataclass was frozen)', () => {
    // Behaviour difference: Python declares `@dataclass(frozen=True)` and the
    // test expects `AttributeError`; the TS port keeps plain writable fields.
    const result = new PollingResult({ accessToken: 'token' });

    result.accessToken = 'new-token';

    expect(result.accessToken).toBe('new-token');
  });

  it('exposes the expected status values', () => {
    expect(PollingStatus.IN_PROGRESS).toBe('IN_PROGRESS');
    expect(PollingStatus.FAILED).toBe('FAILED');
    // A TS string enum member *is* its wire value (Python's `.value`).
    expect(String(PollingStatus.IN_PROGRESS)).toBe('IN_PROGRESS');
    expect(String(PollingStatus.FAILED)).toBe('FAILED');
  });
});
