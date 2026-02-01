import { eq } from 'drizzle-orm';
import type { DrizzleDB } from '../db';
import { chartConfigs, chartProjects } from '../db/schema';
import { generateId } from './utils';

/**
 * Chart Bundle Export Format
 */
export interface ChartBundle {
  version: string;
  exportedAt: number;
  projectName: string;
  projectDescription?: string;
  charts: Array<{
    id: string;
    title: string;
    description?: string;
    chartType: string;
    echartsConfig: Record<string, unknown>;
    generatedBy: 'ai' | 'user';
    generationPrompt?: string;
  }>;
  dataSources?: Array<{
    id: string;
    fileName: string;
    fileType: string;
    data: Record<string, unknown>[];
  }>;
}

/**
 * Generate JSON Bundle for export
 *
 * @param db - Database instance
 * @param projectId - Chart project ID
 * @param workspaceId - Workspace ID
 * @returns JSON bundle
 */
export async function generateJSONBundle(
  db: DrizzleDB,
  projectId: string,
  _workspaceId: string
): Promise<ChartBundle> {
  // Fetch project
  const projects = await db
    .select()
    .from(chartProjects)
    .where(eq(chartProjects.id, projectId))
    .limit(1);

  const project = projects[0];
  if (!project) {
    throw new Error('Chart project not found');
  }

  // Fetch charts
  const charts = await db
    .select()
    .from(chartConfigs)
    .where(eq(chartConfigs.projectId, projectId));

  // Build bundle
  const bundle: ChartBundle = {
    version: '1.0',
    exportedAt: Date.now(),
    projectName: project.name,
    projectDescription: project.description || undefined,
    charts: charts.map(chart => ({
      id: chart.id,
      title: chart.title,
      description: chart.description || undefined,
      chartType: chart.chartType,
      echartsConfig: chart.echartsConfig as Record<string, unknown>,
      generatedBy: chart.generatedBy as 'ai' | 'user',
      generationPrompt: chart.generationPrompt || undefined,
    })),
    // TODO: Add data sources if needed
    dataSources: [],
  };

  return bundle;
}

/**
 * Import JSON Bundle
 *
 * @param db - Database instance
 * @param bundle - JSON bundle to import
 * @param workspaceId - Workspace ID
 * @param projectName - Optional new project name
 * @returns Import result
 */
export async function importJSONBundle(
  db: DrizzleDB,
  bundle: ChartBundle,
  workspaceId: string,
  projectName?: string
): Promise<{
  imported: number;
  errors: string[];
  projectId: string;
}> {
  const errors: string[] = [];
  let imported = 0;

  try {
    // Create new project
    const newProject = await db
      .insert(chartProjects)
      .values({
        id: generateId(),
        workspaceId,
        name: projectName || `${bundle.projectName} (Imported)`,
        description: bundle.projectDescription || null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      .returning();

    if (!newProject[0]) {
      throw new Error('Failed to create project');
    }

    const projectId = newProject[0].id;

    // Import charts
    for (const chart of bundle.charts) {
      try {
        await db.insert(chartConfigs).values({
          id: generateId(),
          projectId,
          dataSourceId: null,
          title: chart.title,
          description: chart.description || null,
          chartType: chart.chartType,
          echartsConfig: chart.echartsConfig,
          validationStatus: 'pending',
          validationErrors: [],
          generatedBy: chart.generatedBy,
          generationPrompt: chart.generationPrompt || null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        imported++;
      } catch (error) {
        errors.push(`Failed to import chart "${chart.title}": ${error}`);
      }
    }

    return {
      imported,
      errors,
      projectId,
    };
  } catch (error) {
    throw new Error(`Import failed: ${error}`);
  }
}

/**
 * Generate PPTX from base64 images
 * This function creates a PowerPoint presentation from chart images
 *
 * @param images - Array of chart images with metadata
 * @param options - PPT generation options
 * @returns PPTX file as Blob
 */
export async function generatePPTXFromImages(
  _images: Array<{
    chartId: string;
    title: string;
    description?: string;
    imageBase64: string;
  }>,
  _options?: {
    title?: string;
    author?: string;
  }
): Promise<Blob> {
  // Note: This will be implemented with pptxgenjs
  // For now, return a placeholder implementation

  // In a real implementation, we would:
  // 1. Use pptxgenjs to create a presentation
  // 2. Add a title slide
  // 3. Add one slide per chart with the image
  // 4. Return the generated PPTX as a Blob

  throw new Error('PPTX generation not yet implemented - requires pptxgenjs integration');
}

/**
 * Helper function to convert base64 to Blob
 */
export function base64ToBlob(base64: string, type = 'application/octet-stream'): Blob {
  const byteCharacters = atob(base64.split(',')[1] || base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type });
}
