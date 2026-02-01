import { Hono } from 'hono';
import type { Variables } from '../types';
import { workspaceMiddleware } from './middleware';
import { jsonOk, jsonError } from './helpers';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { generateChartsWithAI, chatToModifyChart } from '../services/chartAiService';

// Schemas
const generateSchema = z.object({
  dataSourceId: z.string().min(1),
  projectId: z.string().min(1),
  prompt: z.string().min(1).max(2000),
  chartCount: z.number().min(1).max(10).optional().default(1),
});

const chatSchema = z.object({
  chartId: z.string().min(1),
  message: z.string().min(1).max(1000),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant', 'system']),
        content: z.string(),
      })
    )
    .optional(),
});

export const chartAiRoute = new Hono<{ Variables: Variables }>();

// Apply workspace middleware to all routes
chartAiRoute.use('*', workspaceMiddleware);

/**
 * Generate charts using AI
 * POST /api/chart-ai/generate
 */
chartAiRoute.post('/generate', zValidator('json', generateSchema), async (c) => {
  const user = c.get('user');
  if (!user) {
    return jsonError(c, 'UNAUTHORIZED', 'Login required', 401);
  }

  const workspace = c.get('workspace')!;
  if (!workspace) {
    return jsonError(c, 'WORKSPACE_NOT_FOUND', 'Workspace not found', 404);
  }

  try {
    const payload = c.req.valid('json');

    // Get data source content (with workspace context)
    const dataSourceUrl = new URL(`/api/data-sources/${payload.dataSourceId}`, c.req.url);
    const dataSourceResponse = await fetch(
      new Request(dataSourceUrl, {
        method: 'GET',
        headers: {
          ...Object.fromEntries(c.req.raw.headers),
          'X-Workspace-Id': workspace.id,
        },
      })
    );

    if (!dataSourceResponse.ok) {
      return jsonError(c, 'DATASOURCE_NOT_FOUND', 'Data source not found', 404);
    }

    const dataSourceResult: { success: boolean; data: any } = await dataSourceResponse.json();
    if (!dataSourceResult.success || !dataSourceResult.data) {
      return jsonError(c, 'DATASOURCE_FETCH_FAILED', 'Failed to fetch data source', 500);
    }

    const dataSource = dataSourceResult.data;

    // Generate charts
    const draft = await generateChartsWithAI(c.get('db'), c.env as any, {
      dataSourceId: payload.dataSourceId,
      dataSourceContent: dataSource.content,
      projectId: payload.projectId,
      workspaceId: workspace.id,
      prompt: payload.prompt,
      chartCount: payload.chartCount || 1,
    });

    return jsonOk(c, draft, 201);
  } catch (error) {
    console.error('AI generation failed:', error);
    return jsonError(
      c,
      'GENERATION_FAILED',
      error instanceof Error ? error.message : 'Failed to generate charts',
      500
    );
  }
});

/**
 * Chat with AI to modify chart
 * POST /api/chart-ai/chat
 */
chartAiRoute.post('/chat', zValidator('json', chatSchema), async (c) => {
  const user = c.get('user');
  if (!user) {
    return jsonError(c, 'UNAUTHORIZED', 'Login required', 401);
  }

  const workspace = c.get('workspace')!;
  if (!workspace) {
    return jsonError(c, 'WORKSPACE_NOT_FOUND', 'Workspace not found', 404);
  }

  try {
    const payload = c.req.valid('json');

    const draft = await chatToModifyChart(c.get('db'), c.env as any, {
      chartId: payload.chartId,
      message: payload.message,
      history: payload.history,
      workspaceId: workspace.id,
    });

    return jsonOk(c, draft, 201);
  } catch (error) {
    console.error('AI chat failed:', error);
    return jsonError(
      c,
      'CHAT_FAILED',
      error instanceof Error ? error.message : 'Failed to process chat request',
      500
    );
  }
});