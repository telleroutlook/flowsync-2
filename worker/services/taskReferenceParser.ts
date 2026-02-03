/**
 * Task Reference Parser - Dual Identifier Resolution
 *
 * Provides robust task resolution with dual identifier support (ID + WBS).
 * Implements cascading fallback strategy for high-confidence matching.
 *
 * Matching priority:
 * 1. Task ID (full or truncated) - confidence 1.0/0.9
 * 2. WBS Code - confidence 0.95
 * 3. Title exact match - confidence 0.9
 * 4. Fuzzy title match - confidence 0.7
 */

import { eq, and, sql } from 'drizzle-orm';
import type { tasks } from '../db/schema';

// Constants
const UUID_PREFIX_LENGTH = 8;
const FUZZY_SIMILARITY_THRESHOLD = 0.75;

// Confidence levels (aligned with entityResolver but optimized for dual ID)
export const CONFIDENCE = {
  FULL_ID: 1.0,
  WBS: 0.95,
  TRUNCATED_ID: 0.9,
  TITLE_EXACT: 0.9,
  FUZZY_MATCH: 0.7,
} as const;

/**
 * Task reference from AI response
 * Supports multiple identifier formats
 */
export interface TaskReference {
  id?: string;        // UUID (full or truncated)
  wbs?: string;       // WBS Code (e.g., "1.1", "2.3.1")
  title?: string;     // Task title (for fallback)
  projectId: string;  // Project ID (required for WBS/title matching)
}

/**
 * Resolution result with metadata
 */
export interface ResolvedTask {
  task: typeof tasks.$inferSelect;
  confidence: number;
  matchMethod: MatchMethod;
}

export type MatchMethod =
  | 'full_id'
  | 'truncated_id'
  | 'wbs'
  | 'title_exact'
  | 'title_fuzzy';

/**
 * Parse task reference from various formats
 * Handles: {id, wbs, title}, "uuid", "WBS:1.1", "Task 1.1"
 */
export function parseTaskReference(input: unknown): TaskReference {
  if (typeof input === 'string') {
    // Check if it looks like a UUID (contains letters and dashes)
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const truncatedIdPattern = /^[0-9a-f]{8,}$/i;

    if (uuidPattern.test(input) || truncatedIdPattern.test(input)) {
      return { id: input, projectId: '' };
    }

    // Try to extract WBS from string like "Task T1.2" or "T1.2" or "1.2"
    const wbsMatch = input.match(/(?:[TW])?(\d+(?:\.\d+)+)/);
    if (wbsMatch) {
      return { wbs: wbsMatch[1], projectId: '' };
    }

    // Treat as title fallback
    return { title: input, projectId: '' };
  }

  if (typeof input === 'object' && input !== null) {
    const ref = input as Record<string, unknown>;
    return {
      id: (ref.id as string) || undefined,
      wbs: (ref.wbs as string) || undefined,
      title: (ref.title as string) || undefined,
      projectId: (ref.projectId as string) || '',
    };
  }

  return { projectId: '' };
}

/**
 * Resolve task reference with cascading strategy
 * Priority: ID → WBS → Title → Fuzzy
 */
export async function resolveTaskReference(
  ref: TaskReference,
  db: ReturnType<typeof import('../db').getDb>,
  workspaceId: string
): Promise<ResolvedTask | null> {
  const { id, wbs, title, projectId } = ref;

  // Strategy 1: Full UUID match (36 characters)
  if (id && id.length === 36) {
    const result = await matchByFullId(id, db, workspaceId);
    if (result) return { ...result, matchMethod: 'full_id' };
  }

  // Strategy 2: WBS Code match (higher priority than truncated ID)
  if (wbs && projectId) {
    const result = await matchByWbs(wbs, projectId, db);
    if (result) return { ...result, matchMethod: 'wbs' };
  }

  // Strategy 3: Truncated ID match
  if (id && id.length >= UUID_PREFIX_LENGTH) {
    const result = await matchByTruncatedId(id, db, workspaceId, title);
    if (result) return { ...result, matchMethod: 'truncated_id' };
  }

  // Strategy 4: Title exact match
  if (title && projectId) {
    const result = await matchByTitle(title, projectId, db);
    if (result) return { ...result, matchMethod: 'title_exact' };
  }

  // Strategy 5: Fuzzy title match
  if (title && projectId) {
    const result = await matchByFuzzyTitle(title, projectId, db);
    if (result) return { ...result, matchMethod: 'title_fuzzy' };
  }

  return null;
}

// ============ Helper Functions ============

async function matchByFullId(
  id: string,
  db: ReturnType<typeof import('../db').getDb>,
  workspaceId: string
): Promise<{ task: typeof tasks.$inferSelect; confidence: number } | null> {
  const { tasks, projects } = await import('../db/schema');

  const rows = await db
    .select()
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .where(and(eq(tasks.id, id), eq(projects.workspaceId, workspaceId)))
    .limit(1);

  if (rows[0]?.tasks) {
    return { task: rows[0].tasks, confidence: CONFIDENCE.FULL_ID };
  }

  return null;
}

async function matchByTruncatedId(
  id: string,
  db: ReturnType<typeof import('../db').getDb>,
  workspaceId: string,
  title?: string
): Promise<{ task: typeof tasks.$inferSelect; confidence: number } | null> {
  const { tasks, projects } = await import('../db/schema');
  const prefix = id.substring(0, UUID_PREFIX_LENGTH);

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
    return { task: rows[0].tasks, confidence: CONFIDENCE.TRUNCATED_ID };
  }

  // If multiple results, filter by title
  if (rows.length > 1 && title) {
    const normalizedTitle = title.toLowerCase().trim();
    const match = rows.find(
      (r) => r.tasks && r.tasks.title.toLowerCase().trim() === normalizedTitle
    );
    if (match?.tasks) {
      return { task: match.tasks, confidence: CONFIDENCE.TRUNCATED_ID };
    }
  }

  return null;
}

async function matchByWbs(
  wbs: string,
  projectId: string,
  db: ReturnType<typeof import('../db').getDb>
): Promise<{ task: typeof tasks.$inferSelect; confidence: number } | null> {
  const { tasks } = await import('../db/schema');

  const rows = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.wbs, wbs), eq(tasks.projectId, projectId)))
    .limit(1);

  if (rows[0]) {
    return { task: rows[0], confidence: CONFIDENCE.WBS };
  }

  return null;
}

async function matchByTitle(
  title: string,
  projectId: string,
  db: ReturnType<typeof import('../db').getDb>
): Promise<{ task: typeof tasks.$inferSelect; confidence: number } | null> {
  const { tasks } = await import('../db/schema');
  const normalizedTitle = title.toLowerCase().trim();

  const rows = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.projectId, projectId),
        sql`LOWER(CAST(${tasks.title} AS TEXT)) = ${normalizedTitle}`
      )
    )
    .limit(10);

  if (rows.length === 1) {
    return { task: rows[0]!, confidence: CONFIDENCE.TITLE_EXACT };
  }

  return null;
}

async function matchByFuzzyTitle(
  title: string,
  projectId: string,
  db: ReturnType<typeof import('../db').getDb>
): Promise<{ task: typeof tasks.$inferSelect; confidence: number } | null> {
  const { tasks } = await import('../db/schema');
  const normalizedTitle = title.toLowerCase().trim();

  const rows = await db
    .select()
    .from(tasks)
    .where(eq(tasks.projectId, projectId))
    .limit(50);

  let bestMatch: typeof rows[0] | undefined;
  let bestSim = FUZZY_SIMILARITY_THRESHOLD;

  for (const r of rows) {
    const sim = similarity(normalizedTitle, r.title.toLowerCase().trim());
    if (sim > bestSim) {
      bestSim = sim;
      bestMatch = r;
    }
  }

  if (bestMatch) {
    return { task: bestMatch, confidence: CONFIDENCE.FUZZY_MATCH };
  }

  return null;
}

/**
 * Calculate string similarity using Levenshtein distance
 */
function similarity(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  if (!s1 || !s2) return 0;

  const dp: number[][] = Array.from({ length: s2.length + 1 }, () =>
    Array.from({ length: s1.length + 1 }, () => 0)
  );

  for (let i = 0; i <= s2.length; i++) dp[i]![0] = i;
  for (let j = 0; j <= s1.length; j++) dp[0]![j] = j;

  for (let i = 1; i <= s2.length; i++) {
    for (let j = 1; j <= s1.length; j++) {
      if (s2[i - 1] === s1[j - 1]) {
        dp[i]![j] = dp[i - 1]![j - 1]!;
      } else {
        dp[i]![j] = 1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!);
      }
    }
  }

  const maxLen = Math.max(s1.length, s2.length);
  return maxLen > 0 ? 1 - dp[s2.length]![s1.length]! / maxLen : 0;
}

/**
 * Format task reference for AI tool calls
 * Ensures dual identifier format
 */
export function formatTaskReference(task: typeof tasks.$inferSelect): string {
  const parts: string[] = [];

  if (task.wbs) {
    parts.push(`WBS: ${task.wbs}`);
  }

  parts.push(`ID: ${task.id}`);

  return parts.join(', ');
}

/**
 * Create user-friendly error message
 */
export function createNotFoundError(ref: TaskReference): string {
  const methods: string[] = [];

  if (ref.id) {
    methods.push(`ID (${ref.id.length === 36 ? ref.id : `${ref.id}...`})`);
  }

  if (ref.wbs) {
    methods.push(`WBS (${ref.wbs})`);
  }

  if (ref.title) {
    methods.push(`title ("${ref.title}")`);
  }

  return `Task not found using: ${methods.join(', ')}. Please verify the task exists in this project.`;
}
