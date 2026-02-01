import { eq, and } from 'drizzle-orm';
import type { DrizzleDB } from '../db';
import { dataSources } from '../db/schema';
import { generateId, now } from './utils';

/**
 * Supported file types
 */
const SUPPORTED_FILE_TYPES = ['csv', 'json', 'xlsx', 'xls', 'md'] as const;
type FileType = typeof SUPPORTED_FILE_TYPES[number];

/**
 * File size limit: 10MB
 */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Parse result structure
 */
export interface ParseResult {
  data: Record<string, unknown>[];
  metadata: {
    columns: string[];
    rowCount: number;
    sample: Record<string, unknown>[];
  };
}

/**
 * Detect file type from filename
 */
export function getFileType(filename: string): FileType | null {
  const ext = filename.toLowerCase().split('.').pop();
  if (ext && SUPPORTED_FILE_TYPES.includes(ext as FileType)) {
    return ext as FileType;
  }
  return null;
}

/**
 * Parse CSV file using papaparse
 */
async function parseCsv(file: File): Promise<ParseResult> {
  const Papa = await import('papaparse');

  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: (results) => {
        const data = results.data as Record<string, unknown>[];
        resolve({
          data,
          metadata: {
            columns: results.meta.fields || [],
            rowCount: data.length,
            sample: data.slice(0, 5),
          },
        });
      },
      error: (error) => reject(error),
    });
  });
}

/**
 * Parse JSON file
 */
async function parseJson(file: File): Promise<ParseResult> {
  const text = await file.text();
  const json = JSON.parse(text);

  let data: Record<string, unknown>[];

  if (Array.isArray(json)) {
    data = json;
  } else if (typeof json === 'object' && json !== null) {
    // Find array field
    const jsonObj = json as Record<string, unknown>;
    const arrayKey = Object.keys(jsonObj).find(key => {
      const value = jsonObj[key];
      return Array.isArray(value);
    });
    if (arrayKey) {
      data = jsonObj[arrayKey] as Record<string, unknown>[];
    } else {
      // Single object, wrap in array
      data = [jsonObj];
    }
  } else {
    throw new Error('Invalid JSON structure');
  }

  return {
    data,
    metadata: {
      columns: Object.keys(data[0] || {}),
      rowCount: data.length,
      sample: data.slice(0, 5),
    },
  };
}

/**
 * Parse Excel file using xlsx
 */
async function parseExcel(file: File): Promise<ParseResult> {
  const XLSX = await import('xlsx');

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });

  // Read first sheet
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('Excel file has no sheets');
  }
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
    throw new Error('Sheet not found');
  }

  // Convert to JSON
  const data = XLSX.utils.sheet_to_json(worksheet) as Record<string, unknown>[];

  return {
    data,
    metadata: {
      columns: Object.keys(data[0] || {}),
      rowCount: data.length,
      sample: data.slice(0, 5),
    },
  };
}

/**
 * Parse Markdown table
 */
async function parseMarkdown(file: File): Promise<ParseResult> {
  const text = await file.text();

  // Find Markdown tables
  const tableRegex = /\|[\s\S]*?\|/g;
  const matches = text.match(tableRegex);

  if (!matches || matches.length === 0) {
    throw new Error('No table found in Markdown file');
  }

  // Parse first table
  const lines = matches[0].split('\n').filter(line => line.trim());
  if (lines.length < 3) {
    throw new Error('Invalid table format: requires header, separator, and data rows');
  }

  const firstLine = lines[0];
  if (!firstLine) {
    throw new Error('Invalid table format: missing header row');
  }

  const headers = firstLine
    .split('|')
    .map(h => h.trim())
    .filter(h => h);

  // Skip separator line (index 1)
  const dataLines = lines.slice(2);
  const data = dataLines.map(line => {
    const values = line.split('|').map(v => v.trim()).filter(v => v);
    const row: Record<string, unknown> = {};
    headers.forEach((header, i) => {
      row[header] = values[i] || '';
    });
    return row;
  });

  return {
    data,
    metadata: {
      columns: headers,
      rowCount: data.length,
      sample: data.slice(0, 5),
    },
  };
}

/**
 * Parse data file based on type
 */
export async function parseDataFile(file: File): Promise<ParseResult> {
  const fileType = getFileType(file.name);

  if (!fileType) {
    throw new Error(`Unsupported file type: ${file.name}`);
  }

  switch (fileType) {
    case 'csv':
      return parseCsv(file);
    case 'json':
      return parseJson(file);
    case 'xlsx':
    case 'xls':
      return parseExcel(file);
    case 'md':
      return parseMarkdown(file);
    default:
      throw new Error(`Unsupported file type: ${fileType}`);
  }
}

/**
 * Upload and parse data source
 */
export async function uploadAndParse(
  db: DrizzleDB,
  options: {
    file: File;
    projectId: string;
    workspaceId: string;
    uploadedBy: string;
  }
): Promise<typeof dataSources.$inferSelect> {
  const { file, projectId, workspaceId, uploadedBy } = options;

  // Check file type
  const fileType = getFileType(file.name);
  if (!fileType) {
    throw new Error(`Unsupported file type: ${file.name}`);
  }

  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('File size exceeds 10MB limit');
  }

  // Parse file
  let parseResult: ParseResult;
  try {
    parseResult = await parseDataFile(file);
  } catch (error) {
    // Create data source record (failed status)
    const dataSource = await createDataSource(db, {
      projectId,
      workspaceId,
      fileName: file.name,
      fileType,
      fileSize: file.size,
      content: null,
      parseStatus: 'failed',
      parseErrors: error instanceof Error ? error.message : 'Parse failed',
      uploadedBy,
    });

    return dataSource;
  }

  // Save data
  const dataSource = await createDataSource(db, {
    projectId,
    workspaceId,
    fileName: file.name,
    fileType,
    fileSize: file.size,
    content: parseResult,
    parseStatus: 'success',
    parseErrors: null,
    uploadedBy,
  });

  return dataSource;
}

/**
 * Create data source record in database
 */
async function createDataSource(
  db: DrizzleDB,
  data: {
    projectId: string;
    workspaceId: string;
    fileName: string;
    fileType: FileType;
    fileSize: number;
    content: ParseResult | null;
    parseStatus: 'success' | 'failed';
    parseErrors: string | null;
    uploadedBy: string;
  }
) {
  const timestamp = now();

  const record = {
    id: generateId(),
    projectId: data.projectId,
    workspaceId: data.workspaceId,
    fileName: data.fileName,
    fileType: data.fileType,
    fileSize: data.fileSize,
    content: (data.content || null) as Record<string, unknown> | null,
    r2Key: null,
    parseStatus: data.parseStatus,
    parseErrors: data.parseErrors,
    uploadedAt: timestamp,
    uploadedBy: data.uploadedBy,
  };

  const result = await db.insert(dataSources).values(record).returning();
  if (!result[0]) {
    throw new Error('Failed to create data source');
  }
  return result[0];
}

/**
 * Get data source by ID
 */
export async function getDataSourceById(
  db: DrizzleDB,
  id: string,
  workspaceId: string
): Promise<typeof dataSources.$inferSelect | null> {
  const result = await db
    .select()
    .from(dataSources)
    .where(and(eq(dataSources.id, id), eq(dataSources.workspaceId, workspaceId)))
    .limit(1);

  return result[0] || null;
}

/**
 * List data sources by project
 */
export async function listDataSourcesByProject(
  db: DrizzleDB,
  projectId: string,
  workspaceId: string
): Promise<typeof dataSources.$inferSelect[]> {
  return db
    .select()
    .from(dataSources)
    .where(and(eq(dataSources.projectId, projectId), eq(dataSources.workspaceId, workspaceId)))
    .orderBy(dataSources.uploadedAt);
}

/**
 * Delete data source
 */
export async function deleteDataSource(
  db: DrizzleDB,
  id: string,
  workspaceId: string
): Promise<boolean> {
  const result = await db
    .delete(dataSources)
    .where(and(eq(dataSources.id, id), eq(dataSources.workspaceId, workspaceId)))
    .returning();

  return result.length > 0;
}
