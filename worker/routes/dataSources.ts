import { Hono } from 'hono';
import type { Variables } from '../types';
import { workspaceMiddleware } from './middleware';
import { jsonOk, jsonError } from './helpers';
import { uploadAndParse, getDataSourceById, listDataSourcesByProject, deleteDataSource } from '../services/dataSourceService';
import { checkRateLimit, getClientIp } from '../services/rateLimitService';

export const dataSourcesRoute = new Hono<{ Variables: Variables }>();

// Apply workspace middleware to all routes
dataSourcesRoute.use('*', workspaceMiddleware);

/**
 * Upload data source file with rate limiting
 * POST /api/data-sources/upload
 */
dataSourcesRoute.post('/upload', async (c) => {
  const workspace = c.get('workspace')!;
  const user = c.get('user');

  if (!user) {
    return jsonError(c, 'UNAUTHORIZED', 'Login required', 401);
  }

  // Check rate limit
  const clientIp = getClientIp(c.req.raw);
  const rateLimitResult = await checkRateLimit(c.get('db'), clientIp, 'UPLOAD');

  if (!rateLimitResult.allowed) {
    return jsonError(
      c,
      'RATE_LIMIT_EXCEEDED',
      `Too many upload attempts. Please try again after ${rateLimitResult.retryAfter} seconds.`,
      429,
      { retryAfter: rateLimitResult.retryAfter }
    );
  }

  try {
    // Parse form data
    const formData = await c.req.formData();
    const file = formData.get('file') as File | null;
    const projectId = formData.get('projectId') as string | null;

    if (!file) {
      return jsonError(c, 'INVALID_FILE', 'No file provided', 400);
    }

    if (!projectId) {
      return jsonError(c, 'INVALID_PROJECT', 'Project ID is required', 400);
    }

    // Upload and parse file
    const dataSource = await uploadAndParse(c.get('db'), {
      file,
      projectId,
      workspaceId: workspace.id,
      uploadedBy: user.id,
    });

    return jsonOk(c, dataSource, 201);
  } catch (error) {
    if (error instanceof Error) {
      return jsonError(c, 'UPLOAD_FAILED', error.message, 400);
    }
    return jsonError(c, 'UPLOAD_FAILED', 'Failed to upload file', 500);
  }
});

/**
 * Get data sources by project
 * GET /api/data-sources/project/:projectId
 */
dataSourcesRoute.get('/project/:projectId', async (c) => {
  const workspace = c.get('workspace')!;

  try {
    const projectId = c.req.param('projectId');
    const sources = await listDataSourcesByProject(c.get('db'), projectId, workspace.id);

    return jsonOk(c, sources);
  } catch (error) {
    return jsonError(c, 'FETCH_FAILED', 'Failed to fetch data sources', 500);
  }
});

/**
 * Get single data source
 * GET /api/data-sources/:id
 */
dataSourcesRoute.get('/:id', async (c) => {
  const workspace = c.get('workspace')!;

  try {
    const id = c.req.param('id');
    const source = await getDataSourceById(c.get('db'), id, workspace.id);

    if (!source) {
      return jsonError(c, 'NOT_FOUND', 'Data source not found', 404);
    }

    return jsonOk(c, source);
  } catch (error) {
    return jsonError(c, 'FETCH_FAILED', 'Failed to fetch data source', 500);
  }
});

/**
 * Delete data source
 * DELETE /api/data-sources/:id
 */
dataSourcesRoute.delete('/:id', async (c) => {
  const workspace = c.get('workspace')!;
  const user = c.get('user');

  if (!user) {
    return jsonError(c, 'UNAUTHORIZED', 'Login required', 401);
  }

  try {
    const id = c.req.param('id');
    const deleted = await deleteDataSource(c.get('db'), id, workspace.id);

    if (!deleted) {
      return jsonError(c, 'NOT_FOUND', 'Data source not found', 404);
    }

    return jsonOk(c, { deleted: true });
  } catch (error) {
    return jsonError(c, 'DELETE_FAILED', 'Failed to delete data source', 500);
  }
});
