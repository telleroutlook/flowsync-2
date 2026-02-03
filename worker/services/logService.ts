import { observabilityLogs } from '../db/schema';
import { generateId, now } from './utils';

/**
 * Debug logging that only outputs in development mode.
 * Helps prevent leaking sensitive information in production logs.
 *
 * @param label - Debug label for categorization
 * @param data - Data to log (will be JSON.stringify'd)
 */
export const debugLog = (label: string, data: unknown): void => {
  // Only log in development environment
  // In Cloudflare Workers, check for dev environment
  const isDev = typeof globalThis !== 'undefined' &&
    ((globalThis as { ENVIRONMENT?: string }).ENVIRONMENT === 'development') ||
    // Fallback: check if we're in a local dev server (not production)
    (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development');

  if (isDev) {
    let payload: string;
    if (typeof data === 'string') {
      payload = data;
    } else {
      try {
        payload = JSON.stringify(data, null, 2);
      } catch {
        payload = '[unserializable]';
      }
    }
    console.log(`[debug:${label}]`, payload);
  }
};

export const recordLog = async (
  db: ReturnType<typeof import('../db').getDb>,
  kind: 'ai_request' | 'ai_response' | 'tool_execution' | 'error' | 'draft_cleanup',
  payload: Record<string, unknown>
) => {
  try {
    await db.insert(observabilityLogs).values({
      id: generateId(),
      kind,
      payload,
      createdAt: now(),
    });
  } catch (error) {
    const requestId = typeof payload.requestId === 'string' ? payload.requestId : undefined;
    console.warn('[observability] log insert failed', {
      kind,
      requestId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
