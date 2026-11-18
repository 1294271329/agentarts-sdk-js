/**
 * AgentArts Browser Module.
 *
 * Provides browser automation in sandboxed environments:
 * - Browser: standard sandbox browser client
 * - browserSession: context manager for browser sessions
 * - withBrowserSession: callback form of `browserSession` (Node.js idiom)
 * - BrowserSession: the session object returned by `browserSession`
 */

export {
  Browser,
  BrowserSession,
  browserSession,
  withBrowserSession,
  ACTION_TYPES,
  DEFAULT_SESSION_TIMEOUT,
} from './browser-client.js';
export type { BrowserSessionOptions } from './browser-client.js';
