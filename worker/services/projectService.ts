import { and, eq, sql } from 'drizzle-orm';
import { projects, tasks } from '../db/schema';
import { toProjectRecord } from './serializers';
import { generateId, now, todayDateString } from './utils';
import type { ProjectRecord } from './types';
import { seedProjects } from '../db/seed';
import { retryOnce } from './dbHelpers';
import { LRUCache } from 'lru-cache';

export const listProjects = async (
  db: ReturnType<typeof import('../db').getDb>,
  workspaceId: string
): Promise<ProjectRecord[]> => {
  const cached = projectCache.get(workspaceId);
  if (cached && isCacheFresh(cached.at)) {
    return cached.data;
  }

  const rows = await retryOnce('projects_list_failed', () =>
    db
      .select()
      .from(projects)
      .where(eq(projects.workspaceId, workspaceId))
      .orderBy(projects.createdAt)
  ).catch((error) => {
    if (cached) {
      console.warn('projects_cache_fallback', { workspaceId });
      return cached.data;
    }
    if (workspaceId === 'public') {
      console.warn('projects_seed_fallback', { workspaceId });
      return seedProjects.map((project) => ({
        id: project.id,
        workspaceId: 'public',
        name: project.name,
        description: project.description ?? null,
        icon: project.icon ?? null,
        createdAt: todayDateString(),
        updatedAt: todayDateString(),
      }));
    }
    throw error;
  });

  const data = rows.map(toProjectRecord);
  projectCache.set(workspaceId, { data, at: now() });
  return data;
};

export const getProjectById = async (
  db: ReturnType<typeof import('../db').getDb>,
  id: string,
  workspaceId: string
): Promise<ProjectRecord | null> => {
  const rows = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.workspaceId, workspaceId)))
    .limit(1);
  const row = rows[0];
  return row ? toProjectRecord(row) : null;
};

export const createProject = async (
  db: ReturnType<typeof import('../db').getDb>,
  data: { id?: string; name: string; description?: string; icon?: string; createdAt?: string; updatedAt?: string; workspaceId: string }
): Promise<ProjectRecord> => {
  const timestamp = todayDateString();
  const createdAt = data.createdAt ?? timestamp;
  const updatedAt = data.updatedAt ?? createdAt;
  // Use || instead of ?? to handle empty string as missing ID
  const id = data.id || generateId();
  const record = {
    id,
    workspaceId: data.workspaceId,
    name: data.name,
    description: data.description ?? null,
    icon: data.icon ?? null,
    createdAt,
    updatedAt,
  };
  await db.insert(projects).values(record);
  projectCache.delete(data.workspaceId);
  return record;
};

export const updateProject = async (
  db: ReturnType<typeof import('../db').getDb>,
  id: string,
  data: { name?: string; description?: string; icon?: string; createdAt?: string; updatedAt?: string },
  workspaceId: string
): Promise<ProjectRecord | null> => {
  const existingRows = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.workspaceId, workspaceId)))
    .limit(1);
  const existing = existingRows[0];
  if (!existing) return null;

  const next = {
    name: data.name ?? existing.name,
    description: data.description ?? existing.description,
    icon: data.icon ?? existing.icon,
    createdAt: data.createdAt ?? existing.createdAt,
    updatedAt: data.updatedAt ?? todayDateString(),
  };

  await db.update(projects).set(next).where(eq(projects.id, id));
  projectCache.delete(workspaceId);
  return toProjectRecord({ ...existing, ...next });
};

export const deleteProject = async (
  db: ReturnType<typeof import('../db').getDb>,
  id: string,
  workspaceId: string
): Promise<{ project: ProjectRecord | null; deletedTasks: number }> => {
  const existingRows = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.workspaceId, workspaceId)))
    .limit(1);
  const existing = existingRows[0];
  if (!existing) return { project: null, deletedTasks: 0 };

  const taskCountResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(tasks)
    .where(eq(tasks.projectId, id));
  const taskCount = taskCountResult[0]?.count ?? 0;
  await db.delete(tasks).where(eq(tasks.projectId, id));
  await db.delete(projects).where(eq(projects.id, id));
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(projects)
    .where(eq(projects.workspaceId, workspaceId));
  const count = countResult[0]?.count ?? 0;
  if (count === 0) {
    await db.insert(projects).values({
      id: generateId(),
      workspaceId,
      name: 'New Project',
      description: 'Auto-created project',
      icon: '🧭',
      createdAt: todayDateString(),
      updatedAt: todayDateString(),
    });
  }
  projectCache.delete(workspaceId);

  return { project: toProjectRecord(existing), deletedTasks: taskCount };
};

const PROJECT_CACHE_TTL_MS = 30_000;

// Memory management: LRU cache prevents unbounded growth in long-running Workers
// Automatically evicts least-recently-used entries when max size is reached
const projectCache = new LRUCache<string, { data: ProjectRecord[]; at: number }>({
  max: 100, // Maximum number of workspace entries to cache (lower than tasks since fewer projects)
  ttl: PROJECT_CACHE_TTL_MS, // Time-to-live in milliseconds
  updateAgeOnGet: true, // Refresh entry age on access (true LRU behavior)
});

const isCacheFresh = (timestamp: number) => now() - timestamp < PROJECT_CACHE_TTL_MS;
