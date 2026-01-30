import { observabilityLogs } from '../db/schema';
import { generateId, now } from './utils';

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
