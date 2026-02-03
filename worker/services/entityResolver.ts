/**
 * Intelligent Entity Resolver - High Confidence Matching
 *
 * Multi-strategy entity resolution for AI-generated actions
 * Provides robust fallback matching when AI provides incomplete/incorrect IDs
 *
 * Matching priority (for tasks):
 * 1. Full UUID (36 chars) - confidence 1.0
 * 2. WBS Code - confidence 0.95 (more reliable than truncated ID)
 * 3. Truncated ID (8 chars) - confidence 0.9
 * 4. Title exact match - confidence 0.9
 * 5. Fuzzy title match - confidence 0.7
 */

import { eq, and, sql } from 'drizzle-orm';
import type { TaskRecord, ProjectRecord } from './types';

export type EntityType = 'task' | 'project';

// Constants for entity resolution
const UUID_PREFIX_LENGTH = 8;
const FUZZY_SIMILARITY_THRESHOLD = 0.75;
const EXACT_MATCH_CONFIDENCE = 1.0;
const TRUNCATED_ID_CONFIDENCE = 0.9;
const TRUNCATED_ID_WITH_TITLE_CONFIDENCE = 0.85;
const WBS_CONFIDENCE = 0.95;
const TITLE_EXACT_CONFIDENCE = 0.9;
const TITLE_EXACT_WITH_ASSIGNEE_CONFIDENCE = 0.85;
const FUZZY_MATCH_CONFIDENCE = 0.7;
const TASK_FUZZY_SEARCH_LIMIT = 50;
const PROJECT_FUZZY_SEARCH_LIMIT = 50;

// Match tracking for observability
interface MatchAttempt {
  strategy: string;
  success: boolean;
  confidence?: number;
  reason?: string;
}

export interface EntityReference {
  entityType: EntityType;
  action: 'create' | 'update' | 'delete';
  entityId?: string;
  after?: Record<string, unknown>;
  fallbackRef?: {
    title?: string;
    wbs?: string;
    projectId?: string;
    assignee?: string;
  };
}

export interface ResolutionResult<T = TaskRecord | ProjectRecord> {
  success: boolean;
  entity?: T;
  entityId?: string;
  method?: string;
  confidence: number;
  warnings?: string[];
  error?: string;
}

/**
 * Log match attempts to observability logs
 */
async function logMatchAttempts(
  db: ReturnType<typeof import('../db').getDb>,
  attempts: MatchAttempt[],
  entityType: EntityType
): Promise<void> {
  try {
    const { observabilityLogs } = await import('../db/schema');
    const { generateId, now } = await import('./utils');

    await db.insert(observabilityLogs).values({
      id: generateId(),
      kind: 'entity_resolution',
      createdAt: now(),
      payload: {
        entityType,
        attempts,
        timestamp: now(),
      } as Record<string, unknown>,
    });
  } catch (error) {
    // Fail silently - logging shouldn't break resolution
    console.error('[entityResolver] Failed to log match attempts:', error);
  }
}

const normalize = (s: string | undefined | null): string =>
  s?.toLowerCase().trim().replace(/\s+/g, ' ') ?? '';

/**
 * Calculate string similarity using edit distance (Levenshtein)
 * Returns 0-1 score where 1 = exact match
 */
const similarity = (s1: string, s2: string): number => {
  if (s1 === s2) return 1;
  if (!s1 || !s2) return 0;

  // Initialize DP table
  const dp: number[][] = Array.from({ length: s2.length + 1 },
    () => Array.from({ length: s1.length + 1 }, () => 0)
  );

  // Base cases
  for (let i = 0; i <= s2.length; i++) dp[i]![0] = i;
  for (let j = 0; j <= s1.length; j++) dp[0]![j] = j;

  // Fill DP table
  for (let i = 1; i <= s2.length; i++) {
    for (let j = 1; j <= s1.length; j++) {
      if (s2[i - 1] === s1[j - 1]) {
        dp[i]![j] = dp[i - 1]![j - 1]!;
      } else {
        dp[i]![j] = 1 + Math.min(
          dp[i - 1]![j]!,
          dp[i]![j - 1]!,
          dp[i - 1]![j - 1]!
        );
      }
    }
  }

  const maxLen = Math.max(s1.length, s2.length);
  return maxLen > 0 ? 1 - dp[s2.length]![s1.length]! / maxLen : 0;
};

/**
 * Resolve a task reference using cascading strategies
 */
export async function resolveTask(
  db: ReturnType<typeof import('../db').getDb>,
  ref: EntityReference,
  workspaceId: string,
  activeProjectId?: string
): Promise<ResolutionResult<TaskRecord>> {
  console.log('resolveTask:start', {
    workspaceId,
    activeProjectId,
    ref: {
      entityId: ref.entityId,
      action: ref.action,
      entityType: ref.entityType,
      fallbackRef: ref.fallbackRef,
      after: ref.after ? {
        title: (ref.after as { title?: string }).title,
        wbs: (ref.after as { wbs?: string }).wbs,
        projectId: (ref.after as { projectId?: string }).projectId,
        assignee: (ref.after as { assignee?: string }).assignee,
      } : undefined,
    },
  });
  // Create actions don't need resolution
  if (ref.action === 'create') {
    return { success: true, confidence: 1.0 };
  }

  const warnings: string[] = [];
  const matchAttempts: MatchAttempt[] = [];
  const title = normalize(ref.fallbackRef?.title || (ref.after?.title as string));
  const wbs = ref.fallbackRef?.wbs || (ref.after?.wbs as string);
  const projectId = ref.fallbackRef?.projectId ||
                    (ref.after?.projectId as string) ||
                    activeProjectId;
  const assignee = ref.fallbackRef?.assignee || (ref.after?.assignee as string);

  // Strategy 1: Exact UUID match (36 characters)
  // If AI provides a complete UUID, we ONLY use exact match
  // This prevents matching to wrong tasks when the specified ID doesn't exist
  if (ref.entityId && ref.entityId.length === 36) {
    const { tasks, projects } = await import('../db/schema');
    const { toTaskRecord } = await import('./serializers');

    const rows = await db
      .select()
      .from(tasks)
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .where(
        and(
          eq(tasks.id, ref.entityId),
          eq(projects.workspaceId, workspaceId)
        )
      )
      .limit(1);

    if (rows[0]?.tasks) {
      matchAttempts.push({ strategy: 'exact_id', success: true, confidence: 1.0 });
      await logMatchAttempts(db, matchAttempts, 'task');
      return {
        success: true,
        entity: toTaskRecord(rows[0].tasks),
        entityId: rows[0].tasks.id,
        method: 'exact_id',
        confidence: 1.0,
      };
    }

    // Complete UUID provided but not found - fail fast
    // Do NOT try other strategies as they might match to wrong tasks
    matchAttempts.push({ strategy: 'exact_id', success: false, reason: 'ID not found' });
    await logMatchAttempts(db, matchAttempts, 'task');
    return {
      success: false,
      confidence: 0,
      error: `Task with ID ${ref.entityId} not found in workspace ${workspaceId}`,
      warnings,
    };
  }

  // Strategy 2: WBS code match (higher priority than truncated ID)
  // WBS is more reliable than truncated UUID as it's project-specific and shorter
  if (wbs && projectId) {
    matchAttempts.push({ strategy: 'wbs', success: false }); // Tentative
    const { tasks } = await import('../db/schema');
    const { toTaskRecord } = await import('./serializers');

    const rows = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.wbs, wbs), eq(tasks.projectId, projectId!)))
      .limit(1);

    if (rows[0]) {
      matchAttempts[matchAttempts.length - 1] = { strategy: 'wbs', success: true, confidence: WBS_CONFIDENCE };
      await logMatchAttempts(db, matchAttempts, 'task');
      return {
        success: true,
        entity: toTaskRecord(rows[0]),
        entityId: rows[0].id,
        method: 'wbs',
        confidence: WBS_CONFIDENCE,
      };
    }
  }

  // Strategy 2b: WBS match within workspace when projectId is missing
  if (wbs && !projectId) {
    matchAttempts.push({ strategy: 'wbs_workspace', success: false });
    const { tasks, projects } = await import('../db/schema');
    const { toTaskRecord } = await import('./serializers');

    const rows = await db
      .select()
      .from(tasks)
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .where(and(eq(tasks.wbs, wbs), eq(projects.workspaceId, workspaceId)))
      .limit(5);

    if (rows.length === 1 && rows[0]?.tasks) {
      matchAttempts[matchAttempts.length - 1] = { strategy: 'wbs_workspace', success: true, confidence: WBS_CONFIDENCE };
      await logMatchAttempts(db, matchAttempts, 'task');
      return {
        success: true,
        entity: toTaskRecord(rows[0].tasks),
        entityId: rows[0].tasks.id,
        method: 'wbs_workspace',
        confidence: WBS_CONFIDENCE,
        warnings: [`Matched by WBS ${wbs} in workspace`],
      };
    }

    if (rows.length > 1) {
      warnings.push(`WBS ${wbs} matches multiple tasks in workspace. Provide projectId to disambiguate.`);
    }
  }

  // Strategy 3: Truncated ID (first 8 characters)
  if (ref.entityId && ref.entityId.length >= UUID_PREFIX_LENGTH) {
    matchAttempts.push({ strategy: 'truncated_id', success: false });
    const { tasks, projects } = await import('../db/schema');
    const { toTaskRecord } = await import('./serializers');
    const prefix = ref.entityId.substring(0, UUID_PREFIX_LENGTH);

    const rows = await db
      .select()
      .from(tasks)
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .where(
        and(
          eq(projects.workspaceId, workspaceId),
          sql`LEFT(CAST(${tasks.id} AS TEXT), ${UUID_PREFIX_LENGTH}) = ${prefix}`
        )
      )
      .limit(10);

    if (rows.length === 1 && rows[0]?.tasks) {
      matchAttempts[matchAttempts.length - 1] = { strategy: 'truncated_id', success: true, confidence: TRUNCATED_ID_CONFIDENCE };
      await logMatchAttempts(db, matchAttempts, 'task');
      return {
        success: true,
        entity: toTaskRecord(rows[0].tasks),
        entityId: rows[0].tasks.id,
        method: 'truncated_id',
        confidence: TRUNCATED_ID_CONFIDENCE,
        warnings: [`Matched by prefix ${prefix}...`],
      };
    }

    if (rows.length > 1 && title) {
      const match = rows.find(
        r => r.tasks && normalize(r.tasks.title) === title
      );
      if (match?.tasks) {
        matchAttempts[matchAttempts.length - 1] = { strategy: 'truncated_id', success: true, confidence: TRUNCATED_ID_WITH_TITLE_CONFIDENCE };
        await logMatchAttempts(db, matchAttempts, 'task');
        return {
          success: true,
          entity: toTaskRecord(match.tasks),
          entityId: match.tasks.id,
          method: 'truncated_id',
          confidence: TRUNCATED_ID_WITH_TITLE_CONFIDENCE,
        };
      }
    }
  }

  // Strategy 4: Title + Project exact match
  if (title && projectId) {
    matchAttempts.push({ strategy: 'title_exact', success: false });
    const { tasks } = await import('../db/schema');
    const { toTaskRecord } = await import('./serializers');

    const rows = await db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.projectId, projectId),
          sql`LOWER(CAST(${tasks.title} AS TEXT)) = ${title}`
        )
      )
      .limit(10);

    if (rows.length === 1) {
      matchAttempts[matchAttempts.length - 1] = { strategy: 'title_exact', success: true, confidence: TITLE_EXACT_CONFIDENCE };
      await logMatchAttempts(db, matchAttempts, 'task');
      return {
        success: true,
        entity: toTaskRecord(rows[0]!),
        entityId: rows[0]!.id,
        method: 'title_exact',
        confidence: TITLE_EXACT_CONFIDENCE,
      };
    }

    if (rows.length > 1 && assignee) {
      const match = rows.find(r => r.assignee === assignee);
      if (match) {
        matchAttempts[matchAttempts.length - 1] = { strategy: 'title_exact', success: true, confidence: TITLE_EXACT_WITH_ASSIGNEE_CONFIDENCE };
        await logMatchAttempts(db, matchAttempts, 'task');
        return {
          success: true,
          entity: toTaskRecord(match),
          entityId: match.id,
          method: 'title_exact',
          confidence: TITLE_EXACT_WITH_ASSIGNEE_CONFIDENCE,
        };
      }
    }
  }

  // Strategy 5: Fuzzy title match
  if (title && projectId) {
    matchAttempts.push({ strategy: 'title_fuzzy', success: false });
    const { tasks } = await import('../db/schema');
    const { toTaskRecord } = await import('./serializers');

    const rows = await db
      .select()
      .from(tasks)
      .where(eq(tasks.projectId, projectId!))
      .limit(TASK_FUZZY_SEARCH_LIMIT);

    let bestMatch: typeof rows[0] | undefined;
    let bestSim = FUZZY_SIMILARITY_THRESHOLD;

    for (const r of rows) {
      const sim = similarity(title, normalize(r.title));
      if (sim > bestSim) {
        bestSim = sim;
        bestMatch = r;
      }
    }

    if (bestMatch) {
      matchAttempts[matchAttempts.length - 1] = { strategy: 'title_fuzzy', success: true, confidence: FUZZY_MATCH_CONFIDENCE };
      await logMatchAttempts(db, matchAttempts, 'task');
      return {
        success: true,
        entity: toTaskRecord(bestMatch),
        entityId: bestMatch.id,
        method: 'title_fuzzy',
        confidence: FUZZY_MATCH_CONFIDENCE,
        warnings: [
          `Matched "${bestMatch.title}" (${Math.round(bestSim * 100)}% similarity)`
        ],
      };
    }
  }

  // All strategies failed
  await logMatchAttempts(db, matchAttempts, 'task');
  console.warn('resolveTask:failed', {
    workspaceId,
    activeProjectId,
    entityId: ref.entityId,
    title,
    wbs,
    projectId,
    assignee,
    matchAttempts,
    warnings,
  });
  return {
    success: false,
    confidence: 0,
    error: 'Task not found',
    warnings,
  };
}

/**
 * Resolve a project reference using cascading strategies
 */
export async function resolveProject(
  db: ReturnType<typeof import('../db').getDb>,
  ref: EntityReference,
  workspaceId: string
): Promise<ResolutionResult<ProjectRecord>> {
  // Create actions don't need resolution
  if (ref.action === 'create') {
    return { success: true, confidence: 1.0 };
  }

  const name = normalize(ref.fallbackRef?.title || (ref.after?.name as string));

  // Strategy 1: Exact UUID match (36 characters)
  // If AI provides a complete UUID, we ONLY use exact match
  // This prevents matching to wrong projects when the specified ID doesn't exist
  if (ref.entityId && ref.entityId.length === 36) {
    const { projects } = await import('../db/schema');
    const { toProjectRecord } = await import('./serializers');

    const rows = await db
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.id, ref.entityId),
          eq(projects.workspaceId, workspaceId)
        )
      )
      .limit(1);

    if (rows[0]) {
      return {
        success: true,
        entity: toProjectRecord(rows[0]!),
        entityId: rows[0]!.id,
        method: 'exact_id',
        confidence: EXACT_MATCH_CONFIDENCE,
      };
    }

    // Complete UUID provided but not found - fail fast
    // Do NOT try other strategies as they might match to wrong projects
    return {
      success: false,
      confidence: 0,
      error: `Project with ID ${ref.entityId} not found in workspace ${workspaceId}`,
    };
  }

  // Strategy 2: Truncated ID (first 8 characters)
  if (ref.entityId && ref.entityId.length >= UUID_PREFIX_LENGTH) {
    const { projects } = await import('../db/schema');
    const { toProjectRecord } = await import('./serializers');
    const prefix = ref.entityId.substring(0, UUID_PREFIX_LENGTH);

    const rows = await db
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.workspaceId, workspaceId),
          sql`LEFT(CAST(${projects.id} AS TEXT), ${UUID_PREFIX_LENGTH}) = ${prefix}`
        )
      )
      .limit(10);

    if (rows.length === 1 && rows[0]) {
      return {
        success: true,
        entity: toProjectRecord(rows[0]),
        entityId: rows[0].id,
        method: 'truncated_id',
        confidence: TRUNCATED_ID_CONFIDENCE,
      };
    }

    if (rows.length > 1 && name) {
      const match = rows.find(r => normalize(r.name) === name);
      if (match) {
        return {
          success: true,
          entity: toProjectRecord(match),
          entityId: match.id,
          method: 'truncated_id',
          confidence: TRUNCATED_ID_WITH_TITLE_CONFIDENCE,
        };
      }
    }
  }

  // Strategy 3: Name exact match
  if (name) {
    const { projects } = await import('../db/schema');
    const { toProjectRecord } = await import('./serializers');

    const rows = await db
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.workspaceId, workspaceId),
          sql`LOWER(CAST(${projects.name} AS TEXT)) = ${name}`
        )
      )
      .limit(10);

    if (rows[0]) {
      return {
        success: true,
        entity: toProjectRecord(rows[0]),
        entityId: rows[0].id,
        method: 'name_exact',
        confidence: TITLE_EXACT_CONFIDENCE,
      };
    }
  }

  // Strategy 4: Fuzzy name match
  if (name) {
    const { projects } = await import('../db/schema');
    const { toProjectRecord } = await import('./serializers');

    const rows = await db
      .select()
      .from(projects)
      .where(eq(projects.workspaceId, workspaceId))
      .limit(PROJECT_FUZZY_SEARCH_LIMIT);

    let bestMatch: typeof rows[0] | undefined;
    let bestSim = FUZZY_SIMILARITY_THRESHOLD;

    for (const r of rows) {
      const sim = similarity(name, normalize(r.name));
      if (sim > bestSim) {
        bestSim = sim;
        bestMatch = r;
      }
    }

    if (bestMatch) {
      return {
        success: true,
        entity: toProjectRecord(bestMatch),
        entityId: bestMatch.id,
        method: 'name_fuzzy',
        confidence: FUZZY_MATCH_CONFIDENCE,
      };
    }
  }

  // All strategies failed
  return {
    success: false,
    confidence: 0,
    error: 'Project not found',
  };
}
