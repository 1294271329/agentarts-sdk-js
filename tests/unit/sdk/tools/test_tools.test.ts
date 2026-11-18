/**
 * Tests for the tools module.
 *
 * Ported 1:1 from `tests/unit/sdk/tools/test_tools.py`.
 *
 * Python patches the HTTP client classes in the module under test so the
 * constructors hand back `MagicMock` instances. The Node.js clients perform no
 * I/O in their constructors, so the creation tests need no patching; the list
 * tests spy on the HTTP client methods instead (Python's
 * `mock_instance.list_*` return values are emulated that way).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Browser, CodeInterpreter } from 'agentarts-sdk/sdk/tools';
import {
  ControlBrowserHttpClient,
  ControlToolsHttpClient,
} from 'agentarts-sdk/sdk/service/tools-http';

beforeEach(() => {
  // Unit tests must never reach the network (PORTING.md §10): fail loudly if a
  // request path is left unmocked.
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('unexpected fetch call'))),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('tools module', () => {
  it('code interpreter import', () => {
    expect(CodeInterpreter).not.toBeNull();
    expect(CodeInterpreter).toBeDefined();
  });

  it('code interpreter create', () => {
    const interpreter = new CodeInterpreter('cn-north-4');

    expect(interpreter).not.toBeNull();
    expect(interpreter).toBeInstanceOf(CodeInterpreter);
  });

  it('code interpreter list', async () => {
    vi.spyOn(ControlToolsHttpClient.prototype, 'listCodeInterpreters').mockResolvedValue({
      code_interpreters: [],
      total: 0,
    });

    const interpreter = new CodeInterpreter('cn-north-4');
    const result = await interpreter.listCodeInterpreters();

    expect(result).not.toBeNull();
    expect(result).toEqual({ code_interpreters: [], total: 0 });
  });

  it('browser import', () => {
    expect(Browser).not.toBeNull();
    expect(Browser).toBeDefined();
  });

  it('browser create', () => {
    const browser = new Browser('cn-north-4');

    expect(browser).not.toBeNull();
    expect(browser).toBeInstanceOf(Browser);
  });

  it('browser list', async () => {
    vi.spyOn(ControlBrowserHttpClient.prototype, 'listBrowsers').mockResolvedValue({
      items: [],
      total_count: 0,
    });

    const browser = new Browser('cn-north-4');
    const result = await browser.listBrowsers();

    expect(result).not.toBeNull();
    expect(result).toEqual({ items: [], total_count: 0 });
  });
});
