import { and, eq, gte, like, lte, or, sql } from 'drizzle-orm';
import type { SQLWrapper } from 'drizzle-orm';
import { projects, tasks } from '../db/schema';
import { toTaskRecord } from './serializers';
import { clampNumber, generateId, now } from './utils';
import type { Priority, TaskRecord, TaskStatus } from './types';
import { seedTasks } from '../db/seed';

export type TaskFilters = {
  projectId?: string;
  status?: TaskStatus;
  priority?: Priority;
  assignee?: string;
  isMilestone?: boolean;
  q?: string;
  startDateFrom?: number;
  startDateTo?: number;
  dueDateFrom?: number;
  dueDateTo?: number;
  page?: number;
  pageSize?: number;
};

const buildWhere = (filters: TaskFilters) => {
  const clauses: SQLWrapper[] = [];
  if (filters.projectId) clauses.push(eq(tasks.projectId, filters.projectId));
  if (filters.status) clauses.push(eq(tasks.status, filters.status));
  if (filters.priority) clauses.push(eq(tasks.priority, filters.priority));
  if (filters.assignee) clauses.push(eq(tasks.assignee, filters.assignee));
  if (filters.isMilestone !== undefined) clauses.push(eq(tasks.isMilestone, filters.isMilestone));
  if (filters.startDateFrom !== undefined) clauses.push(gte(tasks.startDate, filters.startDateFrom));
  if (filters.startDateTo !== undefined) clauses.push(lte(tasks.startDate, filters.startDateTo));
  if (filters.dueDateFrom !== undefined) clauses.push(gte(tasks.dueDate, filters.dueDateFrom));
  if (filters.dueDateTo !== undefined) clauses.push(lte(tasks.dueDate, filters.dueDateTo));
  if (filters.q) {
    const query = `%${filters.q}%`;
    clauses.push(
      or(
        like(tasks.title, query),
        like(sql`coalesce(${tasks.description}, '')`, query)
      )
    );
  }
  if (clauses.length === 0) return undefined;
  return and(...clauses);
};

export const listTasks = async (
  db: ReturnType<typeof import('../db').getDb>,
  filters: TaskFilters,
  workspaceId: string
): Promise<{ data: TaskRecord[]; total: number; page: number; pageSize: number }> => {
  const cacheKey = buildTaskCacheKey(filters, workspaceId);
  const cached = taskCache.get(cacheKey);
  if (cached && isCacheFresh(cached.at)) {
    return cached.data;
  }

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 50));
  const whereClause = buildWhere(filters);
  const projectScoped = typeof filters.projectId === 'string' && filters.projectId.length > 0;
  const workspaceClause = eq(projects.workspaceId, workspaceId);
  const combinedClause = whereClause ? and(whereClause, workspaceClause) : workspaceClause;
  let seedFallback: { data: TaskRecord[]; total: number } | null = null;
  let projectValidated = false;

  if (projectScoped) {
    const projectRows = await retryOnce('tasks_project_validate_failed', () =>
      db
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.id, filters.projectId!), workspaceClause))
        .limit(1)
    ).catch((error) => {
      console.warn('tasks_project_validate_failed', {
        workspaceId,
        projectId: filters.projectId,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    });
    if (projectRows.length === 0) {
      return { data: [], total: 0, page, pageSize };
    }
    projectValidated = true;
  }

  let countValue: number | null = null;
  try {
    const [{ count }] = await retryOnce('tasks_count_failed', () => {
      if (projectValidated) {
        return db
          .select({ count: sql<number>`count(*)` })
          .from(tasks)
          .where(whereClause);
      }
      return db
        .select({ count: sql<number>`count(*)` })
        .from(tasks)
        .innerJoin(projects, eq(tasks.projectId, projects.id))
        .where(combinedClause);
    });
    countValue = count;
  } catch (error) {
    if (cached) {
      console.warn('tasks_cache_fallback', { workspaceId, cacheKey });
      countValue = cached.data.total;
    } else if (workspaceId === 'public') {
      seedFallback = buildSeedTaskList(filters);
      console.warn('tasks_seed_fallback', { workspaceId, cacheKey });
      countValue = seedFallback.total;
    } else {
      console.warn('tasks_count_fallback', {
        workspaceId,
        cacheKey,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const rows = await retryOnce('tasks_list_failed', async () => {
    const query = (projectValidated
      ? db
          .select()
          .from(tasks)
          .where(whereClause)
      : db
          .select()
          .from(tasks)
          .innerJoin(projects, eq(tasks.projectId, projects.id))
          .where(combinedClause))
      .orderBy(tasks.createdAt)
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    return await query;
  }).catch((error) => {
    if (cached) {
      console.warn('tasks_cache_fallback', { workspaceId, cacheKey });
      return cached.data.data;
    }
    if (workspaceId === 'public') {
      seedFallback = seedFallback ?? buildSeedTaskList(filters);
      console.warn('tasks_seed_fallback', { workspaceId, cacheKey });
      return seedFallback.data;
    }
    throw error;
  });

  if (countValue === null) {
    countValue = rows.length;
    console.warn('tasks_count_estimated', { workspaceId, cacheKey, total: countValue });
  }
  type TaskRow = typeof tasks.$inferSelect;
  type TaskJoinRow = { tasks: TaskRow; projects: typeof projects.$inferSelect };
  const toRecord = (row: TaskRow | TaskJoinRow | TaskRecord) =>
    ('tasks' in row ? toTaskRecord(row.tasks) : toTaskRecord(row));
  const data = { data: rows.map((row) => toRecord(row as TaskRow | TaskJoinRow | TaskRecord)), total: countValue, page, pageSize };
  taskCache.set(cacheKey, { data, at: now() });
  return data;
};

export const getTaskById = async (
  db: ReturnType<typeof import('../db').getDb>,
  id: string,
  workspaceId: string
): Promise<TaskRecord | null> => {
  const rows = await db
    .select()
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .where(and(eq(tasks.id, id), eq(projects.workspaceId, workspaceId)))
    .limit(1);
  const row = rows[0];
  return row ? toTaskRecord(row.tasks) : null;
};

export const createTask = async (
  db: ReturnType<typeof import('../db').getDb>,
  data: {
    id?: string;
    projectId: string;
    title: string;
    description?: string;
    status: TaskStatus;
    priority: Priority;
    wbs?: string;
    startDate?: number;
    dueDate?: number;
    completion?: number;
    assignee?: string;
    isMilestone?: boolean;
    predecessors?: string[];
    createdAt?: number;
    updatedAt?: number;
  },
  workspaceId: string
): Promise<TaskRecord | null> => {
  const projectRows = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, data.projectId), eq(projects.workspaceId, workspaceId)))
    .limit(1);
  if (projectRows.length === 0) return null;

  const timestamp = now();
  const createdAt = data.createdAt ?? timestamp;
  const updatedAt = data.updatedAt ?? timestamp;
  const record = {
    id: data.id ?? generateId(),
    projectId: data.projectId,
    title: data.title,
    description: data.description ?? null,
    status: data.status,
    priority: data.priority,
    wbs: data.wbs ?? null,
    createdAt,
    startDate: data.startDate ?? createdAt,
    dueDate: data.dueDate ?? null,
    completion: clampNumber(data.completion, 0, 100) ?? 0,
    assignee: data.assignee ?? null,
    isMilestone: data.isMilestone ?? false,
    predecessors: data.predecessors ?? [],
    updatedAt,
  };
  await db.insert(tasks).values(record);
  invalidateTaskCache(workspaceId, record.projectId);
  return toTaskRecord(record);
};

export const updateTask = async (
  db: ReturnType<typeof import('../db').getDb>,
  id: string,
  data: Partial<{
    title: string;
    description: string;
    status: TaskStatus;
    priority: Priority;
    wbs: string;
    startDate: number;
    dueDate: number;
    completion: number;
    assignee: string;
    isMilestone: boolean;
    predecessors: string[];
  }>,
  workspaceId: string
): Promise<TaskRecord | null> => {
  const existing = await getTaskById(db, id, workspaceId);
  if (!existing) return null;

  const next = {
    title: data.title ?? existing.title,
    description: data.description ?? existing.description,
    status: data.status ?? existing.status,
    priority: data.priority ?? existing.priority,
    wbs: data.wbs ?? existing.wbs,
    startDate: data.startDate ?? existing.startDate,
    dueDate: data.dueDate ?? existing.dueDate,
    completion: clampNumber(data.completion ?? existing.completion ?? undefined, 0, 100),
    assignee: data.assignee ?? existing.assignee,
    isMilestone: data.isMilestone === undefined ? existing.isMilestone : data.isMilestone,
    predecessors: data.predecessors ?? existing.predecessors,
    updatedAt: now(),
  };

  await db.update(tasks).set(next).where(eq(tasks.id, id));
  invalidateTaskCache(workspaceId, existing.projectId);
  return { ...existing, ...next };
};

export const deleteTask = async (
  db: ReturnType<typeof import('../db').getDb>,
  id: string,
  workspaceId: string
): Promise<TaskRecord | null> => {
  const existing = await getTaskById(db, id, workspaceId);
  if (!existing) return null;
  await db.delete(tasks).where(eq(tasks.id, id));
  invalidateTaskCache(workspaceId, existing.projectId);
  return existing;
};

const TASK_CACHE_TTL_MS = 15_000;
const taskCache = new Map<
  string,
  { data: { data: TaskRecord[]; total: number; page: number; pageSize: number }; at: number }
>();

const isCacheFresh = (timestamp: number) => now() - timestamp < TASK_CACHE_TTL_MS;

const logDbError = (label: string, error: unknown) => {
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

const retryOnce = async <T>(label: string, fn: () => PromiseLike<T>): Promise<T> => {
  try {
    return await fn();
  } catch (error) {
    logDbError(label, error);
    await new Promise((resolve) => setTimeout(resolve, 50));
    return await fn();
  }
};

const buildTaskCacheKey = (filters: TaskFilters, workspaceId: string) => {
  const entries = Object.entries(filters)
    .filter(([, value]) => value !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  const payload = Object.fromEntries(entries);
  return `${workspaceId}:${JSON.stringify(payload)}`;
};

const invalidateTaskCache = (workspaceId: string, projectId?: string) => {
  for (const key of taskCache.keys()) {
    if (!key.startsWith(`${workspaceId}:`)) continue;
    if (!projectId || key.includes(`\"projectId\":\"${projectId}\"`)) {
      taskCache.delete(key);
    }
  }
};

const buildSeedTaskList = (filters: TaskFilters) => {
  const mapped: TaskRecord[] = seedTasks.map((task) => ({
    id: task.id,
    projectId: task.projectId,
    title: task.title,
    description: task.description ?? null,
    status: task.status as TaskStatus,
    priority: task.priority as Priority,
    wbs: task.wbs ?? null,
    createdAt: task.createdAt,
    startDate: task.startDate ?? task.createdAt,
    dueDate: task.dueDate ?? null,
    completion: clampNumber(task.completion, 0, 100) ?? 0,
    assignee: task.assignee ?? null,
    isMilestone: task.isMilestone ?? false,
    predecessors: task.predecessors ?? [],
    updatedAt: task.createdAt,
  }));

  let filtered = mapped;
  if (filters.projectId) filtered = filtered.filter((task) => task.projectId === filters.projectId);
  if (filters.status) filtered = filtered.filter((task) => task.status === filters.status);
  if (filters.priority) filtered = filtered.filter((task) => task.priority === filters.priority);
  if (filters.assignee) filtered = filtered.filter((task) => task.assignee === filters.assignee);
  if (filters.isMilestone !== undefined) {
    filtered = filtered.filter((task) => task.isMilestone === filters.isMilestone);
  }
  if (filters.startDateFrom !== undefined) {
    filtered = filtered.filter((task) => task.startDate >= filters.startDateFrom!);
  }
  if (filters.startDateTo !== undefined) {
    filtered = filtered.filter((task) => task.startDate <= filters.startDateTo!);
  }
  if (filters.dueDateFrom !== undefined) {
    filtered = filtered.filter((task) => (task.dueDate ?? 0) >= filters.dueDateFrom!);
  }
  if (filters.dueDateTo !== undefined) {
    filtered = filtered.filter((task) => (task.dueDate ?? 0) <= filters.dueDateTo!);
  }
  if (filters.q) {
    const q = filters.q.toLowerCase();
    filtered = filtered.filter((task) => {
      const title = task.title.toLowerCase();
      const description = task.description?.toLowerCase() ?? '';
      return title.includes(q) || description.includes(q);
    });
  }

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 50));
  const start = (page - 1) * pageSize;
  const paged = filtered.slice(start, start + pageSize);

  return { data: paged, total: filtered.length, page, pageSize };
};
