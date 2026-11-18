/**
 * Tests for `Browser` (browser client).
 *
 * Ported 1:1 from `tests/unit/sdk/tools/test_browser_client.py`.
 *
 * Python patches the HTTP client classes (`ControlBrowserHttpClient`,
 * `DataBrowserHttpClient`) and `os.environ`; the Node.js port spies on the
 * corresponding methods and stubs `HUAWEICLOUD_SDK_BROWSER_API_KEY` through
 * `vi.stubEnv`. `browser_session` maps to `browserSession` /
 * `BrowserSession.enter()/exit()` / `withBrowserSession`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ControlBrowserHttpClient,
  DataBrowserHttpClient,
} from 'agentarts-sdk/sdk/service/tools-http';
import {
  Browser,
  DEFAULT_SESSION_TIMEOUT,
  browserSession,
  withBrowserSession,
} from 'agentarts-sdk/sdk/tools/browser';

const UUID = '9ca9f2a6-18e4-4777-b23b-8c21e978a1ad';
const ENV_BROWSER_API_KEY = 'HUAWEICLOUD_SDK_BROWSER_API_KEY';
const API_KEY = 'test-key';

let client: Browser;

beforeEach(() => {
  // Unit tests must never reach the network (PORTING.md §10).
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('unexpected fetch call'))),
  );
  vi.stubEnv(ENV_BROWSER_API_KEY, API_KEY);
  client = new Browser('test-region');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

/**
 * Start a session through the real client while stubbing the data plane call
 * (Python's `_start_session()` helper).
 */
async function startSession(): Promise<void> {
  vi.spyOn(DataBrowserHttpClient.prototype, 'startSession').mockResolvedValue({
    browser_name: 'my-browser',
    session_id: 's-1',
    streams: {
      automation_stream: { stream_endpoint: 'wss://auto.example.com' },
      live_view_stream: { stream_endpoint: 'wss://live.example.com' },
    },
  });

  await client.startSession('my-browser', 'my-session', 's-1');
}

/** Spy on the data plane `invoke` and return a canned response. */
function spyDataPlaneInvoke(result: Record<string, any> = { ok: true }) {
  return vi.spyOn(DataBrowserHttpClient.prototype, 'invoke').mockResolvedValue(result);
}

type DataPlaneInvokeSpy = ReturnType<typeof spyDataPlaneInvoke>;

/** Assert the data plane `invoke` call for the session started by the helper. */
function expectInvoke(
  spy: DataPlaneInvokeSpy,
  type: string,
  action: Record<string, any>,
): void {
  expect(spy).toHaveBeenCalledTimes(1);
  expect(spy).toHaveBeenCalledWith('my-browser', 's-1', type, action, API_KEY);
}

describe('TestBrowserClient', () => {
  // ── Control plane: Browser CRUD ───────────────────────────────────

  it('create browser', async () => {
    const createSpy = vi
      .spyOn(ControlBrowserHttpClient.prototype, 'createBrowser')
      .mockResolvedValue({ id: 'b-1', name: 'test' });

    const result = await client.createBrowser('test-browser', 'API_KEY', 'my-key');

    expect(result['id']).toBe('b-1');
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(createSpy).toHaveBeenCalledWith({
      name: 'test-browser',
      auth_type: 'API_KEY',
      api_key_name: 'my-key',
    });
  });

  it('create browser bad name', async () => {
    await expect(client.createBrowser('A', 'API_KEY', 'k')).rejects.toThrow();
  });

  it('create browser bad auth type', async () => {
    await expect(client.createBrowser('test-browser', 'X')).rejects.toThrow();
  });

  it('create browser api key needs name', async () => {
    await expect(client.createBrowser('test-browser', 'API_KEY')).rejects.toThrow();
  });

  it('list browsers', async () => {
    vi.spyOn(ControlBrowserHttpClient.prototype, 'listBrowsers').mockResolvedValue({
      items: [],
      total_count: 0,
    });

    const result = await client.listBrowsers();

    expect(result['total_count']).toBe(0);
    expect(result).toEqual({ items: [], total_count: 0 });
  });

  it('list browsers with filters', async () => {
    const listSpy = vi
      .spyOn(ControlBrowserHttpClient.prototype, 'listBrowsers')
      .mockResolvedValue({ items: [], total_count: 0 });

    await client.listBrowsers(null, 0, 5, 'updated_at', 'asc');

    const requestParams = listSpy.mock.calls[0][0];
    expect(requestParams['limit']).toBe(5);
    expect(requestParams['offset']).toBe(0);
    expect(requestParams['sort_key']).toBe('updated_at');
    expect(requestParams['sort_dir']).toBe('asc');
  });

  it('list browsers bad sort', async () => {
    await expect(client.listBrowsers(null, 0, 10, 'name')).rejects.toThrow();
  });

  it('get browser', async () => {
    vi.spyOn(ControlBrowserHttpClient.prototype, 'getBrowser').mockResolvedValue({ id: UUID });

    const result = await client.getBrowser(UUID);

    expect(result['id']).toBe(UUID);
  });

  it('get browser bad id', async () => {
    await expect(client.getBrowser('not-uuid')).rejects.toThrow();
  });

  it('update browser', async () => {
    const updateSpy = vi
      .spyOn(ControlBrowserHttpClient.prototype, 'updateBrowser')
      .mockResolvedValue({ id: UUID });

    const result = await client.updateBrowser(UUID, { logs: { enabled: false } });

    expect(result['id']).toBe(UUID);
    expect(updateSpy).toHaveBeenCalledWith(UUID, {
      observability: { logs: { enabled: false } },
    });
  });

  it('update browser bad id', async () => {
    await expect(client.updateBrowser('bad')).rejects.toThrow();
  });

  it('delete browser', async () => {
    vi.spyOn(ControlBrowserHttpClient.prototype, 'deleteBrowser').mockResolvedValue(undefined);

    expect(await client.deleteBrowser(UUID)).toBe(true);
  });

  // ── Control plane: Profile CRUD ───────────────────────────────────

  it('create profile', async () => {
    const createSpy = vi
      .spyOn(ControlBrowserHttpClient.prototype, 'createBrowserProfile')
      .mockResolvedValue({ id: 'p-1', name: 'test' });

    const result = await client.createBrowserProfile('test-profile');

    expect(result['id']).toBe('p-1');
    expect(createSpy).toHaveBeenCalledWith({ name: 'test-profile' });
  });

  it('create profile bad name', async () => {
    await expect(client.createBrowserProfile('A')).rejects.toThrow();
  });

  it('list profiles', async () => {
    vi.spyOn(ControlBrowserHttpClient.prototype, 'listBrowserProfiles').mockResolvedValue({
      items: [],
      total_count: 0,
    });

    const result = await client.listBrowserProfiles();

    expect(result['total_count']).toBe(0);
  });

  it('get profile', async () => {
    vi.spyOn(ControlBrowserHttpClient.prototype, 'getBrowserProfile').mockResolvedValue({
      id: UUID,
    });

    const result = await client.getBrowserProfile(UUID);

    expect(result['id']).toBe(UUID);
  });

  it('delete profile', async () => {
    vi.spyOn(ControlBrowserHttpClient.prototype, 'deleteBrowserProfile').mockResolvedValue(
      undefined,
    );

    expect(await client.deleteBrowserProfile(UUID)).toBe(true);
  });

  // ── Data plane: Session ───────────────────────────────────────────

  it('start session', async () => {
    await startSession();

    expect(client.sessionId).toBe('s-1');
    expect(client.browserName).toBe('my-browser');
    expect(client.automationEndpoint).toBe('wss://auto.example.com');
    expect(client.liveViewEndpoint).toBe('wss://live.example.com');
  });

  it('start session bad name', async () => {
    await expect(client.startSession('b', '!!', 's')).rejects.toThrow();
  });

  it('start session both domains', async () => {
    await expect(
      client.startSession('b', 'n', 's', null, null, ['a.com'], ['b.com']),
    ).rejects.toThrow();
  });

  it('stop session', async () => {
    await startSession();
    const stopSpy = vi
      .spyOn(DataBrowserHttpClient.prototype, 'stopSession')
      .mockResolvedValue({});

    await client.stopSession();

    expect(stopSpy).toHaveBeenCalledWith('my-browser', 's-1', API_KEY);
    expect(client.sessionId).toBeNull();
    expect(client.browserName).toBeNull();
  });

  it('stop session no op', async () => {
    expect(await client.stopSession()).toBe(true);
  });

  it('get session', async () => {
    await startSession();
    vi.spyOn(DataBrowserHttpClient.prototype, 'getSession').mockResolvedValue({
      session_id: 's-1',
    });

    const result = await client.getSession();

    expect(result['session_id']).toBe('s-1');
  });

  it('get session no session', async () => {
    await expect(client.getSession()).rejects.toThrow();
  });

  // ── Data plane: Operations ────────────────────────────────────────

  it('invoke', async () => {
    await startSession();
    const invokeSpy = spyDataPlaneInvoke();

    const result = await client.invoke('navigate', { url: 'https://x.com' });

    expect(result['ok']).toBe(true);
    expectInvoke(invokeSpy, 'navigate', { url: 'https://x.com' });
  });

  it('invoke bad type', async () => {
    (client as any)._sessionId = 's-1';
    (client as any)._browserName = 'b';

    await expect(client.invoke('unknown_action', {})).rejects.toThrow();
  });

  it('invoke no session', async () => {
    await expect(client.invoke('navigate', {})).rejects.toThrow();
  });

  it('save profile', async () => {
    await startSession();
    const saveSpy = vi
      .spyOn(DataBrowserHttpClient.prototype, 'saveProfile')
      .mockResolvedValue({ ok: true });

    const result = await client.saveProfile('p-1');

    expect(result['ok']).toBe(true);
    expect(saveSpy).toHaveBeenCalledWith('my-browser', 's-1', 'p-1', API_KEY);
  });

  it('update stream', async () => {
    await startSession();
    vi.spyOn(DataBrowserHttpClient.prototype, 'updateStream').mockResolvedValue({ ok: true });

    const result = await client.updateStream('enabled');

    expect(result['ok']).toBe(true);
  });

  it('update stream bad status', async () => {
    await startSession();

    await expect(client.updateStream('paused')).rejects.toThrow();
  });

  it('take control', async () => {
    await startSession();
    const updateSpy = vi
      .spyOn(DataBrowserHttpClient.prototype, 'updateStream')
      .mockResolvedValue({});

    await client.takeControl();

    expect(updateSpy.mock.calls[0][2]).toBe('disabled');
  });

  it('release control', async () => {
    await startSession();
    const updateSpy = vi
      .spyOn(DataBrowserHttpClient.prototype, 'updateStream')
      .mockResolvedValue({});

    await client.releaseControl();

    expect(updateSpy.mock.calls[0][2]).toBe('enabled');
  });

  // ── Data plane: Stream URLs ───────────────────────────────────────

  it('generate automation url', async () => {
    await startSession();
    vi.spyOn(DataBrowserHttpClient.prototype, 'buildWsHeaders').mockResolvedValue({
      'X-Auth': 'test',
    });

    const [url, headers] = await client.generateAutomationUrl();

    expect(url).toBe('wss://auto.example.com');
    expect(headers).toEqual({ 'X-Auth': 'test' });
  });

  it('generate live view url', async () => {
    await startSession();
    vi.spyOn(DataBrowserHttpClient.prototype, 'buildWsHeaders').mockResolvedValue({
      'X-Auth': 'test',
    });

    const [url, headers] = await client.generateLiveViewUrl();

    expect(url).toBe('wss://live.example.com');
    expect(headers).toEqual({ 'X-Auth': 'test' });
  });

  // ── Convenience methods ───────────────────────────────────────────

  it('left mouse click', async () => {
    await startSession();
    const invokeSpy = spyDataPlaneInvoke();

    await client.leftMouseClick(100, 200);

    expectInvoke(invokeSpy, 'mouse_click', {
      x: 100,
      y: 200,
      button: 'left',
      click_count: 1,
    });
  });

  it('navigate', async () => {
    await startSession();
    const invokeSpy = spyDataPlaneInvoke();

    await client.navigate('https://example.com');

    expect(invokeSpy.mock.calls[0][2]).toBe('navigate');
    expect(invokeSpy.mock.calls[0][3]['url']).toBe('https://example.com');
  });

  it('screenshot defaults', async () => {
    await startSession();
    const invokeSpy = spyDataPlaneInvoke();

    await client.screenshot();

    expect(invokeSpy.mock.calls[0][2]).toBe('screenshot');
    const action = invokeSpy.mock.calls[0][3];
    expect(action['format']).toBe('jpeg');
    expect(action['quality']).toBe(80);
    expect(action['full_page']).toBe(false);
  });

  it('screenshot rejects bad format', async () => {
    await startSession();

    await expect(client.screenshot('bmp')).rejects.toThrow();
  });

  it('screenshot rejects bad quality', async () => {
    await startSession();

    await expect(client.screenshot('jpeg', 0)).rejects.toThrow();
  });

  it('mouse drag rejects bad button', async () => {
    await startSession();

    await expect(client.mouseDrag(100, 100, 200, 200, 'bad')).rejects.toThrow();
  });

  it('key press rejects bad presses', async () => {
    await startSession();

    await expect(client.keyPress('Enter', 0)).rejects.toThrow();
  });

  it('key shortcut rejects empty', async () => {
    await startSession();

    await expect(client.keyShortcut([])).rejects.toThrow();
  });

  it('key shortcut rejects too many', async () => {
    await startSession();

    await expect(client.keyShortcut(['a', 'b', 'c', 'd', 'e', 'f'])).rejects.toThrow();
  });

  it('wait rejects bad duration', async () => {
    await startSession();

    await expect(client.wait(0.01)).rejects.toThrow();
  });

  it('mouse click', async () => {
    await startSession();
    const invokeSpy = spyDataPlaneInvoke();

    await client.mouseClick(100, 200);

    expectInvoke(invokeSpy, 'mouse_click', {
      x: 100,
      y: 200,
      button: 'left',
      click_count: 1,
    });
  });

  it('mouse click custom', async () => {
    await startSession();
    const invokeSpy = spyDataPlaneInvoke();

    await client.mouseClick(100, 200, 'right', 2);

    expectInvoke(invokeSpy, 'mouse_click', {
      x: 100,
      y: 200,
      button: 'right',
      click_count: 2,
    });
  });

  it('right mouse click', async () => {
    await startSession();
    const invokeSpy = spyDataPlaneInvoke();

    await client.rightMouseClick(100, 200);

    expectInvoke(invokeSpy, 'mouse_click', {
      x: 100,
      y: 200,
      button: 'right',
      click_count: 1,
    });
  });

  it('double mouse click', async () => {
    await startSession();
    const invokeSpy = spyDataPlaneInvoke();

    await client.doubleMouseClick(100, 200);

    expectInvoke(invokeSpy, 'mouse_click', {
      x: 100,
      y: 200,
      button: 'left',
      click_count: 2,
    });
  });

  it('mouse move', async () => {
    await startSession();
    const invokeSpy = spyDataPlaneInvoke();

    await client.mouseMove(100, 200);

    expectInvoke(invokeSpy, 'mouse_move', { x: 100, y: 200 });
  });

  it('mouse drag', async () => {
    await startSession();
    const invokeSpy = spyDataPlaneInvoke();

    await client.mouseDrag(0, 0, 100, 200);

    expectInvoke(invokeSpy, 'mouse_drag', {
      start_x: 0,
      start_y: 0,
      end_x: 100,
      end_y: 200,
      button: 'left',
    });
  });

  it('mouse scroll', async () => {
    await startSession();
    const invokeSpy = spyDataPlaneInvoke();

    await client.mouseScroll(500, 300, 0, -100);

    expectInvoke(invokeSpy, 'mouse_scroll', {
      x: 500,
      y: 300,
      delta_x: 0,
      delta_y: -100,
    });
  });

  it('mouse scroll no delta', async () => {
    await startSession();
    const invokeSpy = spyDataPlaneInvoke();

    await client.mouseScroll(500, 300);

    expectInvoke(invokeSpy, 'mouse_scroll', { x: 500, y: 300 });
  });

  it('key press', async () => {
    await startSession();
    const invokeSpy = spyDataPlaneInvoke();

    await client.keyPress('Enter');

    expectInvoke(invokeSpy, 'key_press', { key: 'Enter', presses: 1 });
  });

  it('key type', async () => {
    await startSession();
    const invokeSpy = spyDataPlaneInvoke();

    await client.keyType('Hello');

    expectInvoke(invokeSpy, 'key_type', { text: 'Hello' });
  });

  it('key shortcut', async () => {
    await startSession();
    const invokeSpy = spyDataPlaneInvoke();

    await client.keyShortcut(['Control', 'c']);

    expectInvoke(invokeSpy, 'key_shortcut', { keys: ['Control', 'c'] });
  });

  it('go back', async () => {
    await startSession();
    const invokeSpy = spyDataPlaneInvoke();

    await client.goBack();

    expectInvoke(invokeSpy, 'go_back', {});
  });

  it('go forward', async () => {
    await startSession();
    const invokeSpy = spyDataPlaneInvoke();

    await client.goForward();

    expectInvoke(invokeSpy, 'go_forward', {});
  });

  it('refresh', async () => {
    await startSession();
    const invokeSpy = spyDataPlaneInvoke();

    await client.refresh();

    expectInvoke(invokeSpy, 'refresh', {});
  });

  it('get page info', async () => {
    await startSession();
    const invokeSpy = spyDataPlaneInvoke();

    await client.getPageInfo();

    expectInvoke(invokeSpy, 'get_page_info', {});
  });

  it('wait', async () => {
    await startSession();
    const invokeSpy = spyDataPlaneInvoke();

    await client.wait(2.5);

    expectInvoke(invokeSpy, 'wait', { duration: 2.5 });
  });

  it('list tabs', async () => {
    await startSession();
    const invokeSpy = spyDataPlaneInvoke();

    await client.listTabs();

    expectInvoke(invokeSpy, 'list_tabs', {});
  });

  it('switch tab', async () => {
    await startSession();
    const invokeSpy = spyDataPlaneInvoke();

    await client.switchTab('tab-1');

    expectInvoke(invokeSpy, 'switch_tab', { tab_id: 'tab-1' });
  });

  it('close tab', async () => {
    await startSession();
    const invokeSpy = spyDataPlaneInvoke();

    await client.closeTab('tab-1');

    expectInvoke(invokeSpy, 'close_tab', { tab_id: 'tab-1' });
  });

  it('close tab no id', async () => {
    await startSession();
    const invokeSpy = spyDataPlaneInvoke();

    await client.closeTab();

    expectInvoke(invokeSpy, 'close_tab', {});
  });

  it('new tab', async () => {
    await startSession();
    const invokeSpy = spyDataPlaneInvoke();

    await client.newTab('https://example.com');

    expectInvoke(invokeSpy, 'new_tab', { url: 'https://example.com' });
  });

  it('new tab no url', async () => {
    await startSession();
    const invokeSpy = spyDataPlaneInvoke();

    await client.newTab();

    expectInvoke(invokeSpy, 'new_tab', {});
  });

  // ── browser_session ───────────────────────────────────────────────

  it('browser session', async () => {
    const startSpy = vi.spyOn(Browser.prototype, 'startSession').mockResolvedValue({});
    const stopSpy = vi.spyOn(Browser.prototype, 'stopSession').mockResolvedValue(true);

    const session = browserSession('cn-southwest-2', 'my-browser', 'my-session');
    for await (const browser of session) {
      expect(browser).toBe(session.client);
      expect(browser).toBeInstanceOf(Browser);
      expect(startSpy).toHaveBeenCalledTimes(1);
      expect(startSpy).toHaveBeenCalledWith(
        'my-browser',
        'my-session',
        null,
        null,
        null,
        null,
        null,
        null,
        DEFAULT_SESSION_TIMEOUT,
        null,
      );
      expect(stopSpy).not.toHaveBeenCalled();
    }

    expect(stopSpy).toHaveBeenCalledTimes(1);
    expect(stopSpy).toHaveBeenCalledWith(null);
  });

  it('browser session forwards start session options', async () => {
    const viewport = { width: 1440, height: 900 };
    const profileConfiguration = { profile_id: 'profile-1' };
    const proxyConfiguration = { server: 'http://proxy.example.com:8080' };
    const startSpy = vi.spyOn(Browser.prototype, 'startSession').mockResolvedValue({});
    const stopSpy = vi.spyOn(Browser.prototype, 'stopSession').mockResolvedValue(true);

    const session = browserSession(
      'cn-southwest-2',
      'my-browser',
      'my-session',
      'session-1',
      'API_KEY',
      'test-key',
      false,
      viewport,
      profileConfiguration,
      ['example.com'],
      null,
      proxyConfiguration,
      1800,
    );
    const browser = await session.enter();

    expect(browser).toBe(session.client);
    expect(startSpy).toHaveBeenCalledTimes(1);
    expect(startSpy).toHaveBeenCalledWith(
      'my-browser',
      'my-session',
      'session-1',
      viewport,
      profileConfiguration,
      ['example.com'],
      null,
      proxyConfiguration,
      1800,
      'test-key',
    );

    // Constructor options: region/api_key auth/verify_ssl are forwarded to the
    // control plane and data plane clients.
    const sessionClient = session.client as any;
    expect(sessionClient.controlPlaneClient.regionName).toBe('cn-southwest-2');
    expect(sessionClient.controlPlaneClient._config.verifySsl).toBe(false);
    expect(sessionClient._dataPlaneClient._config.verifySsl).toBe(false);
    expect(sessionClient._dataPlaneClient.openAkSk).toBe(false);

    await session.exit();

    expect(stopSpy).toHaveBeenCalledTimes(1);
    expect(stopSpy).toHaveBeenCalledWith('test-key');
  });

  it('withBrowserSession runs the callback and stops the session', async () => {
    const startSpy = vi.spyOn(Browser.prototype, 'startSession').mockResolvedValue({});
    const stopSpy = vi.spyOn(Browser.prototype, 'stopSession').mockResolvedValue(true);

    const result = await withBrowserSession(
      'cn-southwest-2',
      'my-browser',
      'my-session',
      async (browser) => {
        expect(browser).toBeInstanceOf(Browser);
        expect(startSpy).toHaveBeenCalledTimes(1);
        return 'done';
      },
    );

    expect(result).toBe('done');
    expect(stopSpy).toHaveBeenCalledTimes(1);

    // The session is stopped even when the callback throws.
    await expect(
      withBrowserSession('cn-southwest-2', 'my-browser', 'my-session', async () => {
        throw new Error('callback failed');
      }),
    ).rejects.toThrow('callback failed');
    expect(stopSpy).toHaveBeenCalledTimes(2);
  });
});
