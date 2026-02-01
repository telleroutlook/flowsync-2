import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Variables, Bindings, DrizzleDB } from '../types';
import { authMiddleware } from './middleware';
import { generateJSONBundle, importJSONBundle, generatePPTXFromImages } from '../services/chartExportService';

export const chartExportsRoute = new Hono<{ Variables: Variables; Bindings: Bindings }>();

// Apply authentication middleware
chartExportsRoute.use('*', authMiddleware);

/**
 * Generate JSON Bundle
 * POST /api/chart-exports/json-bundle
 */
chartExportsRoute.post('/json-bundle', zValidator('json', z.object({
  projectId: z.string(),
})), async (c) => {
  const db = c.get('db') as DrizzleDB;
  const workspace = c.get('workspace');
  const { projectId } = c.req.valid('json');

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
    const bundle = await generateJSONBundle(db, projectId, workspace.id);

    // Return JSON bundle as downloadable file
    const filename = `charts-${bundle.projectName.replace(/[^a-z0-9]/gi, '-')}-${Date.now()}.json`;
    const json = JSON.stringify(bundle, null, 2);

    return new Response(json, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('JSON bundle generation failed:', error);
    return c.json({
      success: false,
      error: {
        code: 'EXPORT_FAILED',
        message: error instanceof Error ? error.message : 'Failed to generate JSON bundle',
      },
    }, 500);
  }
});

/**
 * Import JSON Bundle
 * POST /api/chart-imports/json-bundle
 */
chartExportsRoute.post('/json-bundle', zValidator('json', z.object({
  bundle: z.any(),
  projectName: z.string().optional(),
})), async (c) => {
  const db = c.get('db') as DrizzleDB;
  const workspace = c.get('workspace');
  const { bundle, projectName } = c.req.valid('json');

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
    const result = await importJSONBundle(db, bundle as any, workspace.id, projectName);

    return c.json({
      success: true,
      data: {
        imported: result.imported,
        errors: result.errors,
        projectId: result.projectId,
      },
    });
  } catch (error) {
    console.error('JSON bundle import failed:', error);
    return c.json({
      success: false,
      error: {
        code: 'IMPORT_FAILED',
        message: error instanceof Error ? error.message : 'Failed to import JSON bundle',
      },
    }, 500);
  }
});

/**
 * Generate PPTX
 * POST /api/chart-exports/pptx
 *
 * Accepts base64-encoded chart images from client and generates PPTX
 */
chartExportsRoute.post('/pptx', zValidator('json', z.object({
  images: z.array(z.object({
    chartId: z.string(),
    title: z.string(),
    description: z.string().optional(),
    imageBase64: z.string(),
  })),
  title: z.string().optional(),
})), async (c) => {
  const workspace = c.get('workspace');
  const { images, title } = c.req.valid('json');

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
    // Generate PPTX from images
    const pptxBlob = await generatePPTXFromImages(images, {
      title: title || 'Chart Export',
      author: 'ChartSync AI',
    });

    // Return PPTX file as downloadable
    const filename = `charts-${Date.now()}.pptx`;

    return new Response(pptxBlob, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('PPTX generation failed:', error);
    return c.json({
      success: false,
      error: {
        code: 'EXPORT_FAILED',
        message: error instanceof Error ? error.message : 'Failed to generate PPTX',
      },
    }, 500);
  }
});
