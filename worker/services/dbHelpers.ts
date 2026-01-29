/**
 * Database helper utilities for error logging and retry logic.
 * Shared across multiple service files to avoid code duplication.
 */

/**
 * Logs database errors with structured metadata.
 * Extracts error name, message, and cause information for better debugging.
 *
 * @param label - A descriptive label identifying where the error occurred
 * @param error - The error object (can be Error instance or unknown type)
 */
export const logDbError = (label: string, error: unknown): void => {
  if (error instanceof Error) {
    const meta = {
      name: error.name,
      message: error.message,
      cause: error.cause instanceof Error ? error.cause.message : error.cause,
    };
    console.error(label, meta);
    return;
  }
  console.error(label, { message: String(error) });
};

/**
 * Retries a failed database operation once with a 50ms delay.
 * Logs the error before retrying for debugging purposes.
 *
 * @template T - The return type of the function being retried
 * @param label - A descriptive label for error logging
 * @param fn - The async function to retry
 * @returns Promise that resolves with the function's result
 * @throws The original error if the retry also fails
 */
export const retryOnce = async <T>(
  label: string,
  fn: () => Promise<T> | PromiseLike<T>
): Promise<T> => {
  try {
    return await fn();
  } catch (error) {
    logDbError(label, error);
    await new Promise((resolve) => setTimeout(resolve, 50));
    return await fn();
  }
};
