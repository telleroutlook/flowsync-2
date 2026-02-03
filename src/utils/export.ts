import type { Task, Project } from '../../types';
import { TaskStatus, Priority } from '../../types';
import { getTaskStart, getTaskEnd, formatExportDate, parseDateFlexible } from './index';

export type ExportRow = {
  rowType: 'project' | 'task';
  projectId: string;
  project: string;
  projectDescription: string;
  projectIcon: string;
  projectCreatedAt: string;
  projectUpdatedAt: string;
  id: string;
  title: string;
  status: string;
  priority: string;
  assignee: string;
  wbs: string;
  startDate: string;
  dueDate: string;
  completion: number | string;
  isMilestone: string;
  predecessors: string;
  description: string;
  createdAt: string;
  updatedAt: string;
};

export type DisplayRow = {
  project: string;
  id: string;
  title: string;
  status: string;
  priority: string;
  assignee: string;
  wbs: string;
  startDate: string;
  dueDate: string;
  completion: number | string;
  isMilestone: string;
  predecessors: string;
  description: string;
  createdAt: string;
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

export const clampCompletion = (value: number) => Math.min(100, Math.max(0, value));

export const formatExportTimestamp = (value?: string | null) => {
  if (!value) return '';
  return value;
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

export const triggerDownload = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const resolveProjectForTask = (
  task: Task,
  projects: Project[],
  activeProject?: Project
): Project | undefined => {
  const match = projects.find((project) => project.id === task.projectId);
  if (match) return match;
  if (activeProject && activeProject.id === task.projectId) return activeProject;
  return activeProject;
};

export const buildExportRows = (
  tasks: Task[],
  projects: Project[],
  activeProject?: Project
): ExportRow[] => {
  const projectRows: ExportRow[] = projects.map((project) => ({
    rowType: 'project',
    projectId: project.id,
    project: project.name,
    projectDescription: project.description ?? '',
    projectIcon: project.icon ?? '',
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

  const taskRows: ExportRow[] = tasks.map((task) => {
    const project = resolveProjectForTask(task, projects, activeProject);
    return {
      rowType: 'task',
      projectId: task.projectId,
      project: project?.name ?? '',
      projectDescription: project?.description ?? '',
      projectIcon: project?.icon ?? '',
      projectCreatedAt: formatExportTimestamp(project?.createdAt),
      projectUpdatedAt: formatExportTimestamp(project?.updatedAt),
      id: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      assignee: task.assignee ?? '',
      wbs: task.wbs ?? '',
      startDate: formatExportDate(getTaskStart(task)),
      dueDate: formatExportDate(getTaskEnd(task)),
      completion: task.completion ?? 0,
      isMilestone: String(task.isMilestone ?? false),
      predecessors: (task.predecessors ?? []).join(','),
      description: task.description ?? '',
      createdAt: formatExportTimestamp(task.createdAt),
      updatedAt: formatExportTimestamp(task.updatedAt),
    };
  });

  return [...projectRows, ...taskRows];
};

export const buildDisplayRows = (
  tasks: Task[],
  projects: Project[],
  activeProject?: Project
): DisplayRow[] => {
  return tasks.map((task) => {
    const project = resolveProjectForTask(task, projects, activeProject);
    return {
      project: project?.name ?? '',
      id: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      assignee: task.assignee ?? '',
      wbs: task.wbs ?? '',
      startDate: formatExportDate(getTaskStart(task)),
      dueDate: formatExportDate(getTaskEnd(task)),
      completion: task.completion ?? 0,
      isMilestone: String(task.isMilestone ?? false),
      predecessors: (task.predecessors ?? []).join(','),
      description: task.description ?? '',
      createdAt: formatExportTimestamp(task.createdAt),
    };
  });
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
  if (typeof value === 'number' && !Number.isNaN(value)) return parseDateFlexible(String(value));
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
  const firstRow = rows[0];
  if (!firstRow) return { headers: [], records: [] };
  const headers = parseDelimitedLine(firstRow, delimiter).map(h => h.trim().toLowerCase());
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
