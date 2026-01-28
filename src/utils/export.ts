import type { Task, Project } from '../../types';
import { TaskStatus, Priority } from '../../types';
import { generateId, getTaskStart, getTaskEnd, formatExportDate, parseDateFlexible } from './index';

export const clampCompletion = (value: number) => Math.min(100, Math.max(0, value));

export const formatExportTimestamp = (value?: number) => {
  if (value === undefined || value === null) return '';
  return new Date(value).toISOString();
};

export const makeSafeFileName = (value: string) => {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return cleaned || 'project';
};

export const formatCsvValue = (value: string, delimiter: string) => {
  const escaped = value.replace(/"/g, '""');
  if (escaped.includes('"') || escaped.includes('\n') || escaped.includes(delimiter)) {
    return `"${escaped}"`;
  }
  return escaped;
};

export const normalizeStatus = (value?: string): TaskStatus => {
  const normalized = (value || '').toUpperCase().replace(/[- ]/g, '_');
  switch (normalized) {
    case 'DONE':
      return TaskStatus.DONE;
    case 'IN_PROGRESS':
      return TaskStatus.IN_PROGRESS;
    default:
      return TaskStatus.TODO;
  }
};

export const normalizePriority = (value?: string): Priority => {
  const normalized = (value || '').toUpperCase();
  switch (normalized) {
    case 'HIGH':
      return Priority.HIGH;
    case 'MEDIUM':
      return Priority.MEDIUM;
    default:
      return Priority.LOW;
  }
};

export const parseBoolean = (value?: string) => {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === 'yes' || normalized === '1') return true;
  if (normalized === 'false' || normalized === 'no' || normalized === '0') return false;
  return undefined;
};

export const parseNumeric = (value: unknown) => {
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  if (typeof value === 'string') return parseDateFlexible(value);
  return undefined;
};

export const parseCompletion = (value: unknown) => {
  if (typeof value === 'number' && !Number.isNaN(value)) return clampCompletion(value);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const numeric = Number(trimmed);
    if (!Number.isNaN(numeric)) return clampCompletion(numeric);
  }
  return undefined;
};

export const parseDelimitedLine = (line: string, delimiter: string) => {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === delimiter && !inQuotes) {
      cells.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells.map(cell => cell.trim());
};

export const parseDelimitedContent = (content: string) => {
  const delimiter = content.includes('\t') ? '\t' : ',';
  const rows = content.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (rows.length === 0) return { headers: [], records: [] };
  const headers = parseDelimitedLine(rows[0], delimiter).map(h => h.trim().toLowerCase());
  const records = rows.slice(1).map(line => {
    const cells = parseDelimitedLine(line, delimiter);
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = cells[index] ?? '';
    });
    return record;
  });
  return { headers, records };
};

export const buildProjectLookup = (projects: Project[]) => {
  return projects.reduce<Record<string, Project>>((acc, project) => {
    acc[project.id] = project;
    return acc;
  }, {});
};

export const buildDisplayRows = (sourceTasks: Task[], exportProjects: Project[], activeProject: Project) => {
  const projectLookup = buildProjectLookup(exportProjects);
  return sourceTasks.map(task => {
    const project = projectLookup[task.projectId] || activeProject;
    return {
      project: project.name,
      id: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      assignee: task.assignee || '',
      wbs: task.wbs || '',
      startDate: formatExportDate(getTaskStart(task)),
      dueDate: formatExportDate(getTaskEnd(task)),
      completion: task.completion ?? 0,
      isMilestone: task.isMilestone ? 'yes' : 'no',
      predecessors: (task.predecessors || []).join(','),
      description: task.description || '',
      createdAt: formatExportDate(task.createdAt),
    };
  });
};

export const buildExportRows = (sourceTasks: Task[], exportProjects: Project[], activeProject: Project) => {
  const projectLookup = buildProjectLookup(exportProjects);
  const projectRows = exportProjects.map(project => ({
    rowType: 'project',
    projectId: project.id,
    project: project.name,
    projectDescription: project.description || '',
    projectIcon: project.icon || '',
    projectCreatedAt: formatExportTimestamp(project.createdAt),
    projectUpdatedAt: formatExportTimestamp(project.updatedAt),
    id: '',
    title: '',
    status: '',
    priority: '',
    assignee: '',
    wbs: '',
    startDate: '',
    dueDate: '',
    completion: '',
    isMilestone: '',
    predecessors: '',
    description: '',
    createdAt: '',
    updatedAt: '',
  }));
  const taskRows = sourceTasks.map(task => {
    const project = projectLookup[task.projectId] || activeProject;
    return {
      rowType: 'task',
      projectId: project.id,
      project: project.name,
      projectDescription: project.description || '',
      projectIcon: project.icon || '',
      projectCreatedAt: formatExportTimestamp(project.createdAt),
      projectUpdatedAt: formatExportTimestamp(project.updatedAt),
      id: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      assignee: task.assignee || '',
      wbs: task.wbs || '',
      startDate: formatExportTimestamp(task.startDate),
      dueDate: formatExportTimestamp(task.dueDate),
      completion: task.completion ?? 0,
      isMilestone: task.isMilestone ? 'true' : 'false',
      predecessors: (task.predecessors || []).join(','),
      description: task.description || '',
      createdAt: formatExportTimestamp(task.createdAt),
      updatedAt: formatExportTimestamp(task.updatedAt),
    };
  });
  return [...projectRows, ...taskRows];
};

export const EXPORT_HEADERS = [
  'rowType',
  'projectId',
  'project',
  'projectDescription',
  'projectIcon',
  'projectCreatedAt',
  'projectUpdatedAt',
  'id',
  'title',
  'status',
  'priority',
  'assignee',
  'wbs',
  'startDate',
  'dueDate',
  'completion',
  'isMilestone',
  'predecessors',
  'description',
  'createdAt',
  'updatedAt',
] as const;

export const DISPLAY_HEADERS = [
  'project',
  'id',
  'title',
  'status',
  'priority',
  'assignee',
  'wbs',
  'startDate',
  'dueDate',
  'completion',
  'isMilestone',
  'predecessors',
  'description',
  'createdAt',
] as const;
