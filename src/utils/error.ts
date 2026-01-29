/**
 * Centralized error types and utilities for consistent error handling
 */

export class AppError extends Error {
  code: string;
  statusCode?: number;
  retryable: boolean;
  context?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    statusCode?: number,
    retryable = false,
    context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.retryable = retryable;
    this.context = context;
  }
}

export class NetworkError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super('NETWORK_ERROR', message, undefined, true, context);
    this.name = 'NetworkError';
  }
}

export class ApiError extends AppError {
  constructor(message: string, statusCode?: number, code?: string, context?: Record<string, unknown>) {
    super(code || 'API_ERROR', message, statusCode, statusCode !== undefined && statusCode >= 500, context);
    this.name = 'ApiError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super('VALIDATION_ERROR', message, 400, false, context);
    this.name = 'ValidationError';
  }
}

export class TimeoutError extends AppError {
  constructor(message: string, timeoutMs?: number, context?: Record<string, unknown>) {
    super('TIMEOUT_ERROR', message, 408, true, { ...context, timeoutMs });
    this.name = 'TimeoutError';
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function isNetworkError(error: unknown): error is NetworkError {
  return error instanceof NetworkError;
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function isValidationError(error: unknown): error is ValidationError {
  return error instanceof ValidationError;
}

export function isTimeoutError(error: unknown): error is TimeoutError {
  return error instanceof TimeoutError;
}

export function isRetryable(error: unknown): boolean {
  if (isAppError(error)) {
    return error.retryable;
  }
  return false;
}

export function getErrorMessage(error: unknown, fallback = 'An error occurred'): string {
  if (isAppError(error)) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}

export function getErrorCode(error: unknown): string | undefined {
  if (isAppError(error)) {
    return error.code;
  }
  return undefined;
}

export function getErrorStatusCode(error: unknown): number | undefined {
  if (isAppError(error)) {
    return error.statusCode;
  }
  return undefined;
}

/**
 * Parse API error response into AppError
 */
export function parseApiError(data: unknown): AppError {
  if (data && typeof data === 'object' && 'error' in data) {
    const errorData = data.error as { code?: string; message?: string; status?: number };
    return new ApiError(
      errorData.message || 'Unknown API error',
      errorData.status,
      errorData.code
    );
  }
  return new ApiError('Unknown API error');
}

/**
 * Wrap an async function with error transformation
 */
export function withErrorHandling<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  errorHandler?: (error: unknown) => AppError
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      if (errorHandler) {
        throw errorHandler(error);
      }
      if (isAppError(error)) {
        throw error;
      }
      if (error instanceof Error) {
        throw new AppError('UNKNOWN_ERROR', error.message);
      }
      throw new AppError('UNKNOWN_ERROR', String(error));
    }
  }) as T;
}

/**
 * Retry logic for retryable operations
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 300
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries || !isRetryable(error)) {
        throw error;
      }
      const delay = baseDelayMs * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}
