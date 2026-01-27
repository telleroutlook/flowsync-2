/**
 * Shared retry logic utilities
 * Used by apiService.ts and worker/db/pg.ts
 */

export const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  getRetryDelay?: (attempt: number, retryAfterHeader?: string | null) => number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 2,
  baseDelayMs: 300,
  maxDelayMs: 2000,
};

export const createRetryDelay = (config: RetryConfig = DEFAULT_RETRY_CONFIG) => {
  return (attempt: number, retryAfterHeader?: string | null): number => {
    if (retryAfterHeader) {
      const retryAfterSeconds = Number(retryAfterHeader);
      if (!Number.isNaN(retryAfterSeconds) && retryAfterSeconds > 0) {
        return Math.min(retryAfterSeconds * 1000, config.maxDelayMs);
      }
    }
    const jitter = Math.floor(Math.random() * 120);
    const delay = config.baseDelayMs * Math.pow(2, attempt) + jitter;
    return Math.min(delay, config.maxDelayMs);
  };
};

export const getRetryDelay = createRetryDelay();
