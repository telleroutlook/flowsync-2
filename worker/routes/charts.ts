import { Hono } from 'hono';
import type { Variables } from '../types';
import { workspaceMiddleware } from './middleware';
import { jsonOk, jsonError } from './helpers';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import {
  createChart,
  getChartById,
  listChartsByProject,
  updateChart,
  deleteChart,
  validateChartConfig,
  CHART_TYPES,
} from '../services/chartService';

// Schemas
const createChartSchema = z.object({
  projectId: z.string().min(1),
  dataSourceId: z.string().optional(),
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  chartType: z.enum(CHART_TYPES),
  echartsConfig: z.record(z.unknown()),
  generatedBy: z.enum(['ai', 'user']).default('user'),
  generationPrompt: z.string().optional(),
});

const updateChartSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  echartsConfig: z.record(z.unknown()).optional(),
});

export const chartsRoute = new Hono<{ Variables: Variables }>();

// Apply workspace middleware to all routes
chartsRoute.use('*', workspaceMiddleware);

/**
 * Create chart configuration
 * POST /api/charts
 */
chartsRoute.post('/', zValidator('json', createChartSchema), async (c) => {
  const user = c.get('user');
  if (!user) {
    return jsonError(c, 'UNAUTHORIZED', 'Login required', 401);
  }

  const workspace = c.get('workspace')!;

  try {
    const payload = c.req.valid('json');
    const chart = await createChart(c.get('db'), {
      ...payload,
      workspaceId: workspace.id,
      actor: 'user',
    });
    return jsonOk(c, chart, 201);
  } catch (error) {
    return jsonError(
      c,
      'CREATE_FAILED',
      error instanceof Error ? error.message : 'Failed to create chart',
      500
    );
  }
});

/**
 * List charts by project
 * GET /api/charts/project/:projectId
 */
chartsRoute.get('/project/:projectId', async (c) => {
  const workspace = c.get('workspace')!;

  try {
    const projectId = c.req.param('projectId');
    const charts = await listChartsByProject(c.get('db'), projectId, workspace.id);
    return jsonOk(c, charts);
  } catch (error) {
    return jsonError(c, 'FETCH_FAILED', 'Failed to fetch charts', 500);
  }
});

/**
 * Get single chart
 * GET /api/charts/:id
 */
chartsRoute.get('/:id', async (c) => {
  const workspace = c.get('workspace')!;

  try {
    const id = c.req.param('id');
    const chart = await getChartById(c.get('db'), id, workspace.id);

    if (!chart) {
      return jsonError(c, 'NOT_FOUND', 'Chart not found', 404);
    }

    return jsonOk(c, chart);
  } catch (error) {
    return jsonError(c, 'FETCH_FAILED', 'Failed to fetch chart', 500);
  }
});

/**
 * Update chart configuration
 * PATCH /api/charts/:id
 */
chartsRoute.patch('/:id', zValidator('json', updateChartSchema), async (c) => {
  const user = c.get('user');
  if (!user) {
    return jsonError(c, 'UNAUTHORIZED', 'Login required', 401);
  }

  const workspace = c.get('workspace')!;

  try {
    const id = c.req.param('id');
    const payload = c.req.valid('json');

    // Get projectId from the chart first
    const existing = await getChartById(c.get('db'), id, workspace.id);
    if (!existing) {
      return jsonError(c, 'NOT_FOUND', 'Chart not found', 404);
    }

    const updated = await updateChart(c.get('db'), id, {
      ...payload,
      workspaceId: workspace.id,
      projectId: existing.projectId,
      actor: 'user',
    });

    if (!updated) {
      return jsonError(c, 'NOT_FOUND', 'Chart not found', 404);
    }

    return jsonOk(c, updated);
  } catch (error) {
    return jsonError(c, 'UPDATE_FAILED', 'Failed to update chart', 500);
  }
});

/**
 * Delete chart
 * DELETE /api/charts/:id
 */
chartsRoute.delete('/:id', async (c) => {
  const user = c.get('user');
  if (!user) {
    return jsonError(c, 'UNAUTHORIZED', 'Login required', 401);
  }

  const workspace = c.get('workspace')!;

  try {
    const id = c.req.param('id');

    // Get projectId from the chart first
    const existing = await getChartById(c.get('db'), id, workspace.id);
    if (!existing) {
      return jsonError(c, 'NOT_FOUND', 'Chart not found', 404);
    }

    const deleted = await deleteChart(c.get('db'), id, {
      workspaceId: workspace.id,
      projectId: existing.projectId,
      actor: 'user',
    });

    if (!deleted) {
      return jsonError(c, 'NOT_FOUND', 'Chart not found', 404);
    }

    return jsonOk(c, { deleted: true });
  } catch (error) {
    return jsonError(c, 'DELETE_FAILED', 'Failed to delete chart', 500);
  }
});

/**
 * Validate chart configuration
 * POST /api/charts/:id/validate
 */
chartsRoute.post('/:id/validate', async (c) => {
  try {
    const id = c.req.param('id');
    const result = await validateChartConfig(c.get('db'), id);
    return jsonOk(c, result);
  } catch (error) {
    return jsonError(
      c,
      'VALIDATION_FAILED',
      error instanceof Error ? error.message : 'Failed to validate chart',
      500
    );
  }
});
