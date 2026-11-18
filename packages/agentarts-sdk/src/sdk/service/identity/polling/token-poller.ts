/**
 * Token polling implementations for OAuth2 user-federation flows.
 */

import { getLogger } from '../../../utils/logging.js';

/** Status of an OAuth2 token polling attempt. */
export enum PollingStatus {
  /** The user has not yet completed authorization; polling should continue. */
  IN_PROGRESS = 'IN_PROGRESS',
  /** The authorization session has failed; polling should stop immediately. */
  FAILED = 'FAILED',
}

/** Result of a single token polling attempt. */
export class PollingResult {
  status: PollingStatus;
  accessToken: string | null;

  constructor(init?: Partial<PollingResult>) {
    this.status = init?.status ?? PollingStatus.IN_PROGRESS;
    this.accessToken = init?.accessToken ?? null;
  }
}

/** Raised when polling exceeds the maximum timeout duration. */
export class PollingTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

/** Abstract base class for token polling implementations. */
export abstract class TokenPoller {
  /**
   * Poll for a token and return it when available.
   *
   * @throws {PollingTimeoutError} If polling exceeds the maximum timeout duration.
   */
  abstract pollForToken(): Promise<string>;
}

export const DEFAULT_POLLING_INTERVAL_SECONDS = 5;
export const DEFAULT_POLLING_TIMEOUT_SECONDS = 300;

/** Default implementation of token polling. */
export class DefaultApiTokenPoller extends TokenPoller {
  readonly authUrl: string;
  readonly pollingFunc: () => PollingResult | Promise<PollingResult>;
  private readonly logger = getLogger('token_poller');

  /**
   * @param authUrl The URL where the user performs authorization.
   * @param func A callable that returns a PollingResult indicating the current
   *   status and, on success, the access token.
   */
  constructor(authUrl: string, func: () => PollingResult | Promise<PollingResult>) {
    super();
    this.authUrl = authUrl;
    this.pollingFunc = func;
  }

  async pollForToken(): Promise<string> {
    const startTime = Date.now();
    while (Date.now() - startTime < DEFAULT_POLLING_TIMEOUT_SECONDS * 1000) {
      await sleep(DEFAULT_POLLING_INTERVAL_SECONDS * 1000);

      this.logger.info(`Polling for token for authorization url: ${this.authUrl}`);
      const result = await this.pollingFunc();

      if (result.accessToken !== null && result.accessToken !== undefined) {
        this.logger.info('Token is ready');
        return result.accessToken;
      }

      if (result.status === PollingStatus.FAILED) {
        this.logger.error(`Authorization session failed for url: ${this.authUrl}`);
        throw new Error(
          'Authorization session failed. ' +
            'The user may have denied access or the session expired.',
        );
      }
    }

    throw new PollingTimeoutError(
      `Polling timed out after ${DEFAULT_POLLING_TIMEOUT_SECONDS} seconds. ` +
        'User may not have completed authorization.',
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}
