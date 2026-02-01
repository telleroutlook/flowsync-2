import { eq, and } from 'drizzle-orm';
import type { DrizzleDB } from '../db';
import { chartConfigs, chartProjects, chartAuditLogs } from '../db/schema';
import { generateId, now } from './utils';

/**
 * Record audit log for chart operations
 */
async function recordChartAudit(
  db: DrizzleDB,
  entry: {
    workspaceId: string;
    entityType: 'chart_project' | 'chart_config' | 'data_source';
    entityId: string;
    action: 'create' | 'update' | 'delete' | 'export' | 'validate';
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    actor: 'user' | 'ai' | 'system';
    reason?: string | null;
    projectId?: string | null;
    draftId?: string | null;
  }
): Promise<void> {
  await db.insert(chartAuditLogs).values({
    id: generateId(),
    workspaceId: entry.workspaceId,
    entityType: entry.entityType,
    entityId: entry.entityId,
    action: entry.action,
    before: entry.before ?? null,
    after: entry.after ?? null,
    actor: entry.actor,
    reason: entry.reason ?? null,
    timestamp: now(),
    projectId: entry.projectId ?? null,
    draftId: entry.draftId ?? null,
  });
}

/**
 * Supported chart types
 */
export const CHART_TYPES = [
  'line',
  'bar',
  'pie',
  'scatter',
  'map',
  'radar',
  'gauge',
  'funnel',
  'heatmap',
  'treemap',
  'sankey',
  'graph',
] as const;

export type ChartType = typeof CHART_TYPES[number];

/**
 * Create chart configuration with audit logging
 */
export async function createChart(
  db: DrizzleDB,
  data: {
    projectId: string;
    workspaceId: string;
    dataSourceId?: string;
    title: string;
    description?: string;
    chartType: ChartType;
    echartsConfig: Record<string, unknown>;
    generatedBy: 'ai' | 'user';
    generationPrompt?: string;
    actor?: 'user' | 'ai' | 'system';
  }
) {
  const timestamp = now();
  const actor = data.actor || data.generatedBy;

  const record = {
    id: generateId(),
    projectId: data.projectId,
    dataSourceId: data.dataSourceId || null,
    title: data.title,
    description: data.description || null,
    chartType: data.chartType,
    echartsConfig: data.echartsConfig,
    validationStatus: 'pending' as const,
    validationErrors: [],
    generatedBy: data.generatedBy,
    generationPrompt: data.generationPrompt || null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const result = await db.insert(chartConfigs).values(record).returning();
  if (!result[0]) {
    throw new Error('Failed to create chart');
  }

  // Record audit log
  await recordChartAudit(db, {
    workspaceId: data.workspaceId,
    entityType: 'chart_config',
    entityId: result[0].id,
    action: 'create',
    after: result[0],
    actor,
    projectId: data.projectId,
  });

  return result[0];
}

/**
 * Get chart by ID with workspace validation
 */
export async function getChartById(
  db: DrizzleDB,
  id: string,
  workspaceId?: string
): Promise<typeof chartConfigs.$inferSelect | null> {
  const condition = workspaceId
    ? and(eq(chartConfigs.id, id), eq(chartProjects.workspaceId, workspaceId))
    : eq(chartConfigs.id, id);

  const result = await db
    .select()
    .from(chartConfigs)
    .innerJoin(chartProjects, eq(chartConfigs.projectId, chartProjects.id))
    .where(condition)
    .limit(1);

  return result[0]?.chart_configs || null;
}

/**
 * List charts by project with workspace validation
 */
export async function listChartsByProject(
  db: DrizzleDB,
  projectId: string,
  workspaceId?: string
): Promise<typeof chartConfigs.$inferSelect[]> {
  const condition = workspaceId
    ? and(eq(chartConfigs.projectId, projectId), eq(chartProjects.workspaceId, workspaceId))
    : eq(chartConfigs.projectId, projectId);

  const result = db
    .select()
    .from(chartConfigs)
    .innerJoin(chartProjects, eq(chartConfigs.projectId, chartProjects.id))
    .where(condition)
    .orderBy(chartConfigs.createdAt);

  return result.then(rows => rows.map(r => r.chart_configs));
}

/**
 * Update chart configuration with workspace validation and audit logging
 */
export async function updateChart(
  db: DrizzleDB,
  id: string,
  data: {
    workspaceId: string;
    projectId: string;
    title?: string;
    description?: string;
    echartsConfig?: Record<string, unknown>;
    actor?: 'user' | 'ai' | 'system';
  }
): Promise<typeof chartConfigs.$inferSelect | null> {
  // First verify chart exists and belongs to workspace
  const existing = await getChartById(db, id, data.workspaceId);
  if (!existing) return null;

  const timestamp = now();
  const actor = data.actor || 'user';

  const updateData: Record<string, unknown> = {
    updatedAt: timestamp,
  };

  if (data.title !== undefined) {
    updateData.title = data.title;
  }
  if (data.description !== undefined) {
    updateData.description = data.description;
  }
  if (data.echartsConfig !== undefined) {
    updateData.echartsConfig = data.echartsConfig;
    updateData.validationStatus = 'pending';
  }

  const result = await db
    .update(chartConfigs)
    .set(updateData)
    .where(eq(chartConfigs.id, id))
    .returning();

  if (!result[0]) return null;

  // Record audit log
  await recordChartAudit(db, {
    workspaceId: data.workspaceId,
    entityType: 'chart_config',
    entityId: id,
    action: 'update',
    before: existing,
    after: result[0],
    actor,
    projectId: data.projectId,
  });

  return result[0];
}

/**
 * Delete chart with workspace validation and audit logging
 */
export async function deleteChart(
  db: DrizzleDB,
  id: string,
  data: {
    workspaceId: string;
    projectId: string;
    actor?: 'user' | 'ai' | 'system';
  }
): Promise<boolean> {
  // For workspace validation, check if chart belongs to workspace project
  const chart = await getChartById(db, id, data.workspaceId);
  if (!chart) return false;

  const actor = data.actor || 'user';

  const result = await db
    .delete(chartConfigs)
    .where(eq(chartConfigs.id, id))
    .returning();

  if (result.length > 0) {
    // Record audit log
    await recordChartAudit(db, {
      workspaceId: data.workspaceId,
      entityType: 'chart_config',
      entityId: id,
      action: 'delete',
      before: chart,
      actor,
      projectId: data.projectId,
    });
  }

  return result.length > 0;
}

/**
 * Validate chart configuration
 * For now, this is a placeholder. Later, integrate with echarts-tool
 */
export async function validateChartConfig(
  db: DrizzleDB,
  id: string
): Promise<{
  valid: boolean;
  errors: Array<{ message: string; path?: string }>;
}> {
  const chart = await getChartById(db, id);
  if (!chart) {
    throw new Error('Chart not found');
  }

  // Basic validation
  const errors: Array<{ message: string; path?: string }> = [];
  const config = chart.echartsConfig;

  // Check required fields
  if (!config.title) {
    errors.push({ message: 'Missing required field: title', path: 'title' });
  }
  if (!config.series || !Array.isArray(config.series) || config.series.length === 0) {
    errors.push({ message: 'Missing or invalid series field', path: 'series' });
  }

  const valid = errors.length === 0;

  // Update validation status
  await db
    .update(chartConfigs)
    .set({
      validationStatus: valid ? 'valid' : 'invalid',
      validationErrors: errors,
    })
    .where(eq(chartConfigs.id, id));

  return { valid, errors };
}
