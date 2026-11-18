/**
 * Async HTTP client service for Huawei Memory API interactions.
 *
 * Mirrors `agentarts/sdk/service/memory_service_async.py`. All request
 * parameters, headers and signing logic are identical to
 * {@link MemoryHttpService}; the async variant keeps its own authentication
 * strategy classes and an explicit (lazily created) HTTP client whose lifecycle
 * is controlled by `close()`.
 */

import { getLogger } from '../utils/logging.js';
import { buildUserAgent } from '../utils/user-agent.js';

import {
  AuthenticationStrategy,
  ControlPlaneAuthenticationStrategy,
  DataPlaneAuthenticationStrategy,
  MemoryHttpService,
  createHttpDispatcher,
  sendHttpRequest,
} from './memory-service.js';
import type { MemoryHttpServiceOptions } from './memory-service.js';

const logger = getLogger('sdk.service.memory_service_async');

/** Data plane authentication strategy for the async client. */
export class AsyncDataPlaneAuthenticationStrategy extends DataPlaneAuthenticationStrategy {
  override async signRequest(
    _method: string,
    _url: string,
    headers: Record<string, string>,
    _body?: string | null,
    _params?: Record<string, any> | null,
  ): Promise<Record<string, string>> {
    // Data plane does not require signing.
    return headers;
  }
}

/** Control plane authentication strategy for the async client. */
export class AsyncControlPlaneAuthenticationStrategy extends ControlPlaneAuthenticationStrategy {}

/** Options accepted by {@link AsyncMemoryHttpClient}. */
export interface AsyncMemoryHttpClientOptions {
  /** Request timeout in seconds. */
  timeout?: number;
  verifySsl?: boolean | string;
}

/** Options accepted by {@link AsyncMemoryHttpClient.request}. */
export interface AsyncMemoryHttpClientRequestOptions {
  headers?: Record<string, string> | null;
  body?: string | null;
  params?: Record<string, any> | null;
}

/**
 * Minimal async HTTP client used by {@link AsyncMemoryHttpService}.
 *
 * Mirrors the lazily created `httpx.AsyncClient` of the Python implementation:
 * it owns the default `User-Agent` header and the TLS dispatcher, both released
 * by `close()`.
 */
export class AsyncMemoryHttpClient {
  readonly headers: Record<string, string>;

  private _timeout: number;
  private _verifySsl: boolean | string;
  private _dispatcher?: any;

  constructor(options: AsyncMemoryHttpClientOptions = {}) {
    this.headers = { 'User-Agent': buildUserAgent('') };
    this._timeout = options.timeout ?? 30;
    this._verifySsl = options.verifySsl ?? true;
  }

  /** Send a request through this client. */
  async request(
    method: string,
    url: string,
    options: AsyncMemoryHttpClientRequestOptions = {},
  ): Promise<Response> {
    const headers = { ...this.headers, ...(options.headers ?? {}) };
    if (this._dispatcher === undefined) {
      this._dispatcher = createHttpDispatcher(this._verifySsl);
    }
    return sendHttpRequest(method, url, {
      headers,
      body: options.body ?? null,
      params: options.params ?? null,
      timeoutSeconds: this._timeout,
      dispatcher: this._dispatcher,
    });
  }

  /** Close the client and release its dispatcher. */
  async close(): Promise<void> {
    if (this._dispatcher) {
      const dispatcher = this._dispatcher;
      this._dispatcher = undefined;
      if (typeof dispatcher.close === 'function') {
        await dispatcher.close().catch(() => undefined);
      }
    }
  }
}

/**
 * Async HTTP client for Huawei Memory API operations.
 *
 * All request parameters, headers and signing logic are identical to
 * {@link MemoryHttpService}.
 */
export class AsyncMemoryHttpService extends MemoryHttpService {
  private _asyncClient: AsyncMemoryHttpClient | null;

  constructor(
    first?: MemoryHttpServiceOptions | string | null,
    endpoint?: string | null,
    endpointType = 'control',
    timeout = 30,
    apiKey?: string | null,
    verifySsl: boolean | string = true,
    enableSigning: boolean | null = null,
  ) {
    super(first, endpoint, endpointType, timeout, apiKey, verifySsl, enableSigning);
    this._asyncClient = null;
  }

  protected override _createAuthenticationStrategy(
    endpointType: string,
  ): AuthenticationStrategy {
    if (endpointType === 'data') {
      return new AsyncDataPlaneAuthenticationStrategy(this._apiKey ?? null);
    }
    return new AsyncControlPlaneAuthenticationStrategy();
  }

  /** Get or create the async HTTP client. */
  async _getClient(): Promise<AsyncMemoryHttpClient> {
    if (this._asyncClient === null) {
      this._asyncClient = new AsyncMemoryHttpClient({
        timeout: this.timeout,
        verifySsl: this.verifySsl,
      });
    }
    return this._asyncClient;
  }

  protected override async _send(
    method: string,
    url: string,
    headers: Record<string, string>,
    body: string | null,
    params: Record<string, any> | null,
  ): Promise<Response> {
    const client = await this._getClient();
    return client.request(method, url, { headers, body, params });
  }

  /** Close the async HTTP client and release resources. */
  override async close(): Promise<void> {
    await this._ready.catch(() => undefined);
    if (this._asyncClient !== null) {
      await this._asyncClient.close();
      this._asyncClient = null;
      logger.info('AsyncMemoryHttpService client closed');
    }
  }
}
