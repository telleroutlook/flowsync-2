import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Variables, Bindings, DrizzleDB } from '../types';
import { authMiddleware } from './middleware';
import { chartAuditLogs } from '../db/schema';
import { eq, and, desc, gte, lte, sql } from 'drizzle-orm';

export const chartAuditRoute = new Hono<{ Variables: Variables; Bindings: Bindings }>();

// Apply authentication middleware
chartAuditRoute.use('*', authMiddleware);

/**
 * List audit logs with filters
 * GET /api/chart-audit
 */
chartAuditRoute.get('/', zValidator('query', z.object({
  projectId: z.string().optional(),
  workspaceId: z.string().optional(),
  entityType: z.enum(['chart_project', 'chart_config', 'data_source']).optional(),
  action: z.enum(['create', 'update', 'delete', 'export', 'validate']).optional(),
  actor: z.enum(['user', 'ai', 'system']).optional(),
  q: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().min(1).optional().default(1),
  pageSize: z.coerce.number().min(1).max(100).optional().default(20),
})), async (c) => {
  const db = c.get('db') as DrizzleDB;
  const workspace = c.get('workspace');
  const {
    projectId,
    entityType,
    action,
    actor,
    q,
    from,
    to,
    page,
    pageSize,
  } = c.req.valid('query');

  if (!workspace) {
    return c.json({
      success: false,
      error: {
        code: 'WORKSPACE_REQUIRED',
        message: 'Workspace context is required',
      },
    }, 400);
  }

  try {
    // Build conditions
    const conditions = [];

    // Always filter by workspace
    conditions.push(eq(chartAuditLogs.workspaceId, workspace.id));

    if (projectId) {
      conditions.push(eq(chartAuditLogs.projectId, projectId));
    }

    if (entityType) {
      conditions.push(eq(chartAuditLogs.entityType, entityType));
    }

    if (action) {
      conditions.push(eq(chartAuditLogs.action, action));
    }

    if (actor) {
      conditions.push(eq(chartAuditLogs.actor, actor));
    }

    if (from) {
      const fromTimestamp = parseInt(from, 10);
      conditions.push(gte(chartAuditLogs.timestamp, fromTimestamp));
    }

    if (to) {
      const toTimestamp = parseInt(to, 10);
      conditions.push(lte(chartAuditLogs.timestamp, toTimestamp));
    }

    // Search in reason field
    if (q) {
      conditions.push(sql`${chartAuditLogs.reason} LIKE ${`%${q}%`}`);
    }

    // Combine all conditions
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count
    const totalResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(chartAuditLogs)
      .where(whereClause);

    const total = totalResult[0]?.count || 0;

    // Fetch paginated logs
    const logs = await db
      .select()
      .from(chartAuditLogs)
      .where(whereClause)
      .orderBy(desc(chartAuditLogs.timestamp))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return c.json({
      success: true,
      data: {
        logs,
        total,
        page,
        pageSize,
      },
    });
  } catch (error) {
    console.error('Failed to fetch audit logs:', error);
    return c.json({
      success: false,
      error: {
        code: 'FETCH_FAILED',
        message: error instanceof Error ? error.message : 'Failed to fetch audit logs',
      },
    }, 500);
  }
});

/**
 * Get single audit log by ID
 * GET /api/chart-audit/:id
 */
chartAuditRoute.get('/:id', async (c) => {
  const db = c.get('db') as DrizzleDB;
  const workspace = c.get('workspace');
  const id = c.req.param('id');

  if (!workspace) {
    return c.json({
      success: false,
      error: {
        code: 'WORKSPACE_REQUIRED',
        message: 'Workspace context is required',
      },
    }, 400);
  }

  try {
    const logs = await db
      .select()
      .from(chartAuditLogs)
      .where(
        and(
          eq(chartAuditLogs.id, id),
          eq(chartAuditLogs.workspaceId, workspace.id)
        )
      )
      .limit(1);

    if (logs.length === 0) {
      return c.json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Audit log not found',
        },
      }, 404);
    }

    return c.json({
      success: true,
      data: logs[0],
    });
  } catch (error) {
    console.error('Failed to fetch audit log:', error);
    return c.json({
      success: false,
      error: {
        code: 'FETCH_FAILED',
        message: error instanceof Error ? error.message : 'Failed to fetch audit log',
      },
    }, 500);
  }
});
