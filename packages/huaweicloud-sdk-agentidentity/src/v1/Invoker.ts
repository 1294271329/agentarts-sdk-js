/**
 * Retrying invoker for the AgentIdentity client.
 *
 * Mirrors `huaweicloudsdkcore.invoker.invoker.SyncInvoker` from the Python SDK:
 * an invoker wraps one prepared request and can be configured with
 * `withRetry()` before `invoke()` is awaited.
 */

/** Supported backoff strategies, mirroring `huaweicloudsdkcore.retry.backoff_strategy.BackoffStrategies`. */
export type BackoffStrategy = 'EQUAL_JITTER' | 'EXPONENTIAL';

/** Options accepted by {@link Invoker.withRetry}. */
export interface RetryOptions<T> {
  /**
   * Retry condition, retry when it returns `true`.
   *
   * Receives the response (when the call succeeded) or the error (when it failed).
   */
  retryCondition?: (resp?: T, err?: unknown) => boolean;
  /** Max retry times, the first call is not counted. Defaults to 3. */
  maxRetries?: number;
  /** Delay strategy between retries. Defaults to `EQUAL_JITTER`. */
  backoffStrategy?: BackoffStrategy;
}

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BACKOFF_STRATEGY: BackoffStrategy = 'EQUAL_JITTER';
/** Length of the exponential window for the first retry, doubled for every further retry. */
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 60 * 1000;

/**
 * Default retry condition: throttling (429), server errors (5xx) and network failures.
 *
 * Same policy as `IdentityClient._should_retry` in the Python port.
 */
function defaultRetryCondition(resp?: unknown, err?: unknown): boolean {
  if (err) {
    const statusCode = extractStatusCode(err);
    if (statusCode !== undefined) {
      return statusCode === 429 || statusCode >= 500;
    }
    // Connection / timeout / DNS failures of the underlying HTTP client.
    return true;
  }
  const statusCode = extractStatusCode(resp);
  return statusCode !== undefined && (statusCode === 429 || statusCode >= 500);
}

function extractStatusCode(value: unknown): number | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const candidate = value as Record<string, unknown>;
  for (const key of ['statusCode', 'httpStatusCode', 'status']) {
    const raw = candidate[key];
    if (typeof raw === 'number') {
      return raw;
    }
  }
  return undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wraps a single prepared request so that it can be retried.
 *
 * ```ts
 * const response = await client
 *   .createWorkloadIdentityInvoker(request)
 *   .withRetry({ maxRetries: 3, backoffStrategy: 'EQUAL_JITTER' })
 *   .invoke();
 * ```
 */
export class Invoker<T> {
  private readonly client: unknown;
  private readonly invocation: () => Promise<T>;
  private retryCondition?: (resp?: T, err?: unknown) => boolean;
  private maxRetries = 0;
  private backoffStrategy: BackoffStrategy = DEFAULT_BACKOFF_STRATEGY;

  constructor(client: unknown, invoke: () => Promise<T>) {
    this.client = client;
    this.invocation = invoke;
  }

  /** The client that owns the wrapped request. */
  public getClient(): unknown {
    return this.client;
  }

  /**
   * Retry on condition.
   *
   * @param options retry condition, max retry times and backoff strategy.
   */
  public withRetry(options: RetryOptions<T> = {}): this {
    this.retryCondition = options.retryCondition ?? defaultRetryCondition;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.backoffStrategy = options.backoffStrategy ?? DEFAULT_BACKOFF_STRATEGY;
    return this;
  }

  /** Executes the wrapped request, retrying as configured. */
  public async invoke(): Promise<T> {
    if (!this.retryCondition || this.maxRetries <= 0) {
      return this.invocation();
    }

    const retryCondition = this.retryCondition;
    let execTimes = 0;
    let response: T | undefined;
    let error: unknown;

    while (true) {
      try {
        response = await this.invocation();
        error = undefined;
      } catch (err) {
        error = err;
        response = undefined;
      }
      execTimes += 1;

      if (execTimes > this.maxRetries || !retryCondition(response, error)) {
        break;
      }

      const delayMs = this.calculateRetryDelayMillis(execTimes);
      if (delayMs > 0) {
        await sleep(delayMs);
      }
    }

    if (error !== undefined) {
      throw error;
    }
    return response as T;
  }

  /** Delay before the retry that follows the given (1-based) attempt. */
  private calculateRetryDelayMillis(retries: number): number {
    const exponential = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** (retries - 1));
    if (this.backoffStrategy === 'EXPONENTIAL') {
      return exponential;
    }
    // EQUAL_JITTER: a random delay inside the exponential window
    // (0-1000 ms for the first retry, doubling afterwards).
    return Math.floor(Math.random() * exponential);
  }
}
