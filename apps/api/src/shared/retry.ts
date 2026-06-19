/** Resolve after `ms` milliseconds. The one place a bare setTimeout-promise lives. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Options for {@link withRetry}. */
export interface RetryOptions {
  /** Extra attempts after the first (so total tries = retries + 1). Default 2. */
  retries?: number;
  /** Base backoff in ms; the nth retry waits `baseMs * 2^(n-1)` (exponential). Default 250. */
  baseMs?: number;
  /** Called before each backoff wait with the upcoming attempt number (1-based) + the error. */
  onRetry?: (attempt: number, error: unknown) => void;
  /** Predicate — return false to stop retrying a given error (e.g. a 4xx). Default: always retry. */
  shouldRetry?: (error: unknown) => boolean;
}

/**
 * Run `fn`, retrying transient failures with exponential backoff (M8 — integration
 * I/O resilience). Returns `fn`'s value on the first success; rethrows the LAST error
 * once attempts are exhausted (so the caller's existing catch still fires — backoff
 * is added in front of the failure boundary, it doesn't swallow it). Deterministic
 * delays (`baseMs * 2^n`); pass a tiny `baseMs` in tests. `shouldRetry` lets a caller
 * fail fast on a permanent error rather than burn the budget on it.
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const retries = options.retries ?? 2;
  const baseMs = options.baseMs ?? 250;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const isLast = attempt === retries;
      if (isLast || (options.shouldRetry && !options.shouldRetry(error))) break;
      options.onRetry?.(attempt + 1, error);
      await sleep(baseMs * 2 ** attempt);
    }
  }
  throw lastError;
}
