/**
 * AI Tool Handlers for Frontend
 *
 * This module contains handlers for AI tool calls that need to be executed
 * on the frontend side. It works in conjunction with the backend tool registry.
 */

import type { DraftAction } from '../../../types';
import type { ApiClient } from './types';
import type { TFunction } from '../../i18n/types';
import { dateStringToMs, formatTaskDate as formatTaskDateUtil, toDateString } from '../../utils/date';

// Context passed to tool handlers
export interface ToolHandlerContext {
  api: ApiClient;
  activeProjectId: string;
  generateId: () => string;
  pushProcessingStep?: (step: string) => void;
  t: TFunction;
}

// Result of tool execution
export interface ToolExecutionResult {
  output: string;
  draftActions?: DraftAction[];
  draftReason?: string;
  shouldRetry?: boolean;
  retryReason?: string;
  suggestions?: string[];
}

// Map of tool names to their handlers
type ToolHandlerFunction = (
  args: Record<string, unknown>,
  context: ToolHandlerContext
) => Promise<ToolExecutionResult> | ToolExecutionResult;

// Helper to format task dates consistently using shared utility
const formatTaskDate = (ts: string | null | undefined, t: TFunction) => {
  const formatted = formatTaskDateUtil(ts);
  return formatted === 'N/A' ? t('common.na') : formatted;
};

// Helper to extract string parameter safely
const getStringParam = (args: Record<string, unknown>, key: string): string | undefined =>
  typeof args[key] === 'string' ? args[key] : undefined;

// Helper to extract boolean parameter safely
const getBoolParam = (args: Record<string, unknown>, key: string): boolean | undefined =>
  typeof args[key] === 'boolean' ? args[key] : undefined;

// Helper to extract finite number parameter safely (accepts number-like strings)
const getNumberParam = (args: Record<string, unknown>, key: string): number | undefined => {
  const value = args[key];
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) return numeric;
  }
  return undefined;
};

const getDateParam = (args: Record<string, unknown>, key: string): string | undefined => {
  const value = args[key];
  if (value === 0) return undefined;
  return typeof value === 'string' ? toDateString(value) : undefined;
};

const DAY_MS = 86_400_000;

const parseReasonDate = (reason?: string): string | undefined => {
  if (!reason) return undefined;
  const trimmed = reason.trim();
  if (!trimmed) return undefined;

  const isoChange = trimmed.match(/(?:改为|调整为|设为|to|after|->)\s*(\d{4})-(\d{1,2})-(\d{1,2})/i);
  if (isoChange) {
    const year = Number(isoChange[1]);
    const month = Number(isoChange[2]);
    const day = Number(isoChange[3]);
    if (year && month && day) return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
  }

  const cnChange = trimmed.match(/(?:改为|调整为|设为)\s*(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (cnChange) {
    const year = Number(cnChange[1]);
    const month = Number(cnChange[2]);
    const day = Number(cnChange[3]);
    if (year && month && day) return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
  }

  const enChange = trimmed.match(/(?:to|after|->)\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:,)?\s+(\d{4})/i);
  if (enChange) {
    const monthToken = enChange[1]?.toLowerCase();
    if (!monthToken) return undefined;
    const monthMap: Record<string, number> = {
      jan: 1, january: 1,
      feb: 2, february: 2,
      mar: 3, march: 3,
      apr: 4, april: 4,
      may: 5,
      jun: 6, june: 6,
      jul: 7, july: 7,
      aug: 8, august: 8,
      sep: 9, sept: 9, september: 9,
      oct: 10, october: 10,
      nov: 11, november: 11,
      dec: 12, december: 12,
    };
    const month = monthMap[monthToken];
    const day = Number(enChange[2]);
    const year = Number(enChange[3]);
    if (!month) return undefined;
    if (year && day) return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
  }

  const isoMatches = [...trimmed.matchAll(/(\d{4})-(\d{1,2})-(\d{1,2})/g)];
  if (isoMatches.length > 0) {
    const last = isoMatches[isoMatches.length - 1];
    if (!last) return undefined;
    const year = Number(last[1]);
    const month = Number(last[2]);
    const day = Number(last[3]);
    if (year && month && day) return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
  }

  const cnMatches = [...trimmed.matchAll(/(\d{4})年(\d{1,2})月(\d{1,2})日/g)];
  if (cnMatches.length > 0) {
    const last = cnMatches[cnMatches.length - 1];
    if (!last) return undefined;
    const year = Number(last[1]);
    const month = Number(last[2]);
    const day = Number(last[3]);
    if (year && month && day) return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
  }

  const enMatches = [...trimmed.matchAll(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:,)?\s+(\d{4})\b/gi)];
  if (enMatches.length > 0) {
    const last = enMatches[enMatches.length - 1];
    if (!last) return undefined;
    const monthToken = String(last[1]).toLowerCase();
    const monthMap: Record<string, number> = {
      jan: 1, january: 1,
      feb: 2, february: 2,
      mar: 3, march: 3,
      apr: 4, april: 4,
      may: 5,
      jun: 6, june: 6,
      jul: 7, july: 7,
      aug: 8, august: 8,
      sep: 9, sept: 9, september: 9,
      oct: 10, october: 10,
      nov: 11, november: 11,
      dec: 12, december: 12,
    };
    const month = monthMap[monthToken];
    const day = Number(last[2]);
    const year = Number(last[3]);
    if (!month) return undefined;
    if (year && day) return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
  }

  return undefined;
};

const shouldTrustReasonDate = (reason?: string): boolean => {
  if (!reason) return false;
  return /start\s*date|start|开始|起始|开工/.test(reason);
};

const normalizeStartDateFromReason = (
  startDate: string | undefined,
  reason?: string
): { value: string | undefined; corrected: boolean } => {
  if (!reason || startDate === undefined) return { value: startDate, corrected: false };
  if (!shouldTrustReasonDate(reason)) return { value: startDate, corrected: false };

  const reasonDate = parseReasonDate(reason);
  if (!reasonDate) return { value: startDate, corrected: false };
  if (Math.abs(dateStringToMs(reasonDate) - dateStringToMs(startDate)) <= DAY_MS) return { value: startDate, corrected: false };

  return { value: reasonDate, corrected: true };
};

const normalizeStatus = (value?: string): string | undefined => {
  if (!value) return undefined;
  const normalized = value.trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (normalized === 'TODO' || normalized === 'IN_PROGRESS' || normalized === 'DONE') {
    return normalized;
  }
  if (normalized === '待办') return 'TODO';
  if (normalized === '进行中') return 'IN_PROGRESS';
  if (normalized === '已完成' || normalized === '完成') return 'DONE';
  return undefined;
};

const normalizePriority = (value?: string): string | undefined => {
  if (!value) return undefined;
  const normalized = value.trim().toUpperCase();
  if (normalized === 'LOW' || normalized === 'MEDIUM' || normalized === 'HIGH') {
    return normalized;
  }
  if (normalized === '低') return 'LOW';
  if (normalized === '中') return 'MEDIUM';
  if (normalized === '高') return 'HIGH';
  return undefined;
};

/**
 * Builds a mapping of truncated IDs to full IDs for auto-fixing AI-generated IDs
 * AI models may truncate UUIDs to first 8 characters, so we need to fix them
 * @param api API client to fetch tasks
 * @param projectIds Project IDs to fetch tasks from
 * @returns Map of truncated (8 chars) and full IDs to full IDs
 */
const buildIdMap = async (
  api: ApiClient,
  projectIds: Set<string>
): Promise<Map<string, string>> => {
  const idMap = new Map<string, string>();

  for (const projectId of projectIds) {
    try {
      const tasks = await api.listTasks({ projectId });
      for (const task of tasks.data) {
        // Map both full ID and truncated ID (first 8 chars) to full ID
        idMap.set(task.id, task.id);
        if (task.id.length >= 8) {
          const truncated = task.id.substring(0, 8);
          idMap.set(truncated, task.id);
        }
      }
    } catch (error) {
      // Ignore fetch errors - we'll try to match IDs as-is
      console.error('[buildIdMap] Failed to fetch tasks for ID mapping:', error);
    }
  }

  return idMap;
};

/**
 * Fixes a potentially truncated task ID using the ID mapping
 * @param id The ID to fix (may be truncated)
 * @param idMap The ID mapping from buildIdMap
 * @returns The full ID if found, otherwise the original ID
 */
const fixTaskId = (id: string | undefined, idMap: Map<string, string>): string | undefined => {
  if (!id) return undefined;
  return idMap.get(id) || id;
};

/**
 * Fixes an array of potentially truncated predecessor IDs
 * @param predecessors The predecessors array to fix
 * @param idMap The ID mapping from buildIdMap
 * @returns Fixed array with full IDs
 */
const fixPredecessors = (
  predecessors: unknown,
  idMap: Map<string, string>
): string[] => {
  if (!Array.isArray(predecessors)) return [];

  const fixed: string[] = [];
  for (const pred of predecessors) {
    if (typeof pred === 'string') {
      // Try to map the predecessor ID
      fixed.push(idMap.get(pred) || pred);
    }
    // Skip non-string predecessors (safe filtering)
  }
  return fixed;
};

const toolHandlers: Record<string, ToolHandlerFunction> = {
  // Read-only tools
  listProjects: async (_args, { api, activeProjectId, pushProcessingStep, t }) => {
    pushProcessingStep?.(t('processing.reading_project_list'));
    const list = await api.listProjects();
    const filtered = activeProjectId ? list.filter((project) => project.id === activeProjectId) : list;
    const output = t('tool.projects_list', {
      count: filtered.length,
      items: filtered.map(p => `${p.name} (${p.id})`).join(', ')
    });
    return { output };
  },

  getProject: async (args, { api, activeProjectId, pushProcessingStep, t }) => {
    const id = getStringParam(args, 'id');
    if (!id) {
      return { output: t('tool.error.invalid_project_id') };
    }
    if (activeProjectId && id !== activeProjectId) {
      return { output: t('tool.error.project_not_active') };
    }
    pushProcessingStep?.(t('processing.reading_project_details'));
    const project = await api.getProject(id);
    return { output: t('tool.project_details', { name: project.name, id: project.id }) };
  },

  listTasks: async (args, { api, activeProjectId, pushProcessingStep, t }) => {
    pushProcessingStep?.(t('processing.reading_task_list'));
    const status = normalizeStatus(getStringParam(args, 'status'));
    const priority = normalizePriority(getStringParam(args, 'priority'));
    const result = await api.listTasks({
      projectId: activeProjectId,
      status,
      priority,
      assignee: getStringParam(args, 'assignee'),
      isMilestone: getBoolParam(args, 'isMilestone'),
      q: getStringParam(args, 'q'),
      startDateFrom: getDateParam(args, 'startDateFrom'),
      startDateTo: getDateParam(args, 'startDateTo'),
      dueDateFrom: getDateParam(args, 'dueDateFrom'),
      dueDateTo: getDateParam(args, 'dueDateTo'),
      page: getNumberParam(args, 'page'),
      pageSize: getNumberParam(args, 'pageSize'),
    });
    const sample = result.data.slice(0, 5).map(task => {
      return `${task.title} (${formatTaskDate(task.startDate, t)} - ${formatTaskDate(task.dueDate, t)})`;
    }).join(', ');
    const output = t('tool.tasks_list', {
      count: result.total,
      items: `${sample}${result.total > 5 ? '…' : ''}`,
    });
    return { output };
  },

  searchTasks: async (args, context) => {
    const handler = toolHandlers.listTasks;
    if (!handler) {
      return { output: context.t('tool.unknown', { name: 'searchTasks' }) };
    }
    return handler(args, context);
  },

  getTask: async (args, { api, activeProjectId, pushProcessingStep, t }) => {
    const id = getStringParam(args, 'id');
    if (!id) {
      return { output: t('tool.error.invalid_task_id') };
    }

    // Fix truncated task IDs (AI may send 8-char prefixes)
    let fixedTaskId = id;
    const projectIds = new Set<string>();
    if (activeProjectId) projectIds.add(activeProjectId);
    const idMap = await buildIdMap(api, projectIds);
    fixedTaskId = fixTaskId(id, idMap) || id;

    pushProcessingStep?.(t('processing.reading_task_details'));
    const task = await api.getTask(fixedTaskId);
    if (activeProjectId && task.projectId !== activeProjectId) {
      return { output: t('tool.error.task_not_in_active_project') };
    }
    const output = t('tool.task_details', {
      title: task.title,
      id: task.id,
      start: formatTaskDate(task.startDate, t),
      due: formatTaskDate(task.dueDate, t),
      status: task.status,
    });
    return { output };
  },

  // Write tools - return draft actions instead of executing directly
  createProject: (args, { generateId }) => {
    const draftActions: DraftAction[] = [{
      id: generateId(),
      entityType: 'project',
      action: 'create',
      after: {
        name: args.name,
        description: args.description,
        icon: args.icon,
      },
    }];
    return {
      output: '',
      draftActions,
      draftReason: getStringParam(args, 'reason'),
    };
  },

  updateProject: (args, { activeProjectId, generateId, t }) => {
    const projectId = getStringParam(args, 'id');
    if (!projectId) {
      return { output: t('tool.error.invalid_project_id') };
    }
    if (activeProjectId && projectId !== activeProjectId) {
      return { output: t('tool.error.project_not_active') };
    }
    const draftActions: DraftAction[] = [{
      id: generateId(),
      entityType: 'project',
      action: 'update',
      entityId: projectId,
      after: {
        name: args.name,
        description: args.description,
        icon: args.icon,
      },
    }];
    return {
      output: '',
      draftActions,
      draftReason: getStringParam(args, 'reason'),
    };
  },

  deleteProject: (args, { activeProjectId, generateId, t }) => {
    const projectId = getStringParam(args, 'id');
    if (!projectId) {
      return { output: t('tool.error.invalid_project_id') };
    }
    if (activeProjectId && projectId !== activeProjectId) {
      return { output: t('tool.error.project_not_active') };
    }
    const draftActions: DraftAction[] = [{
      id: generateId(),
      entityType: 'project',
      action: 'delete',
      entityId: projectId,
    }];
    return {
      output: '',
      draftActions,
      draftReason: getStringParam(args, 'reason'),
    };
  },

  createTask: async (args, { api, activeProjectId, generateId, t }) => {
    const requestedProjectId = getStringParam(args, 'projectId');
    const corrected = !!activeProjectId && !!requestedProjectId && requestedProjectId !== activeProjectId;
    const reason = getStringParam(args, 'reason');
    const normalizedStart = normalizeStartDateFromReason(getDateParam(args, 'startDate'), reason);
    const correctedStartDate = normalizedStart.corrected;

    // Build ID map to fix truncated predecessors
    const projectIds = new Set<string>();
    if (activeProjectId) projectIds.add(activeProjectId);
    const idMap = await buildIdMap(api, projectIds);

    // Fix predecessors array
    const fixedPredecessors = fixPredecessors(args.predecessors, idMap);
    const correctedPredecessors = args.predecessors != null &&
      JSON.stringify(fixedPredecessors) !== JSON.stringify(args.predecessors);

    const draftActions: DraftAction[] = [{
      id: generateId(),
      entityType: 'task',
      action: 'create',
      after: {
        projectId: activeProjectId,
        title: args.title,
        description: args.description,
        status: normalizeStatus(getStringParam(args, 'status')),
        priority: normalizePriority(getStringParam(args, 'priority')),
        wbs: args.wbs,
        startDate: normalizedStart.value,
        dueDate: getDateParam(args, 'dueDate'),
        completion: args.completion,
        assignee: args.assignee,
        isMilestone: args.isMilestone,
        predecessors: fixedPredecessors,
      },
    }];

    const outputParts: string[] = [];
    if (corrected) {
      outputParts.push(t('tool.warning.project_id_corrected'));
    }
    if (correctedPredecessors) {
      outputParts.push(t('tool.warning.predecessors_corrected'));
    }
    if (correctedStartDate) {
      outputParts.push(t('tool.warning.start_date_corrected'));
    }

    return {
      output: outputParts.join(' '),
      draftActions,
      draftReason: reason,
    };
  },

  updateTask: async (args, { api, activeProjectId, generateId, pushProcessingStep, t }) => {
    const taskId = getStringParam(args, 'id');
    const wbs = getStringParam(args, 'wbs'); // Get WBS parameter

    if (!taskId && !wbs) {
      return { output: t('tool.error.invalid_task_id') };
    }

    const reason = getStringParam(args, 'reason');
    const normalizedStart = normalizeStartDateFromReason(getDateParam(args, 'startDate'), reason);
    const correctedStartDate = normalizedStart.corrected;

    let fixedTaskId = taskId;
    let correctedTaskId = false;
    let correctedPredecessors = false;
    let fixedPredecessors: string[] = [];

    if (taskId) {
      // Build ID map to fix truncated IDs (both for taskId and predecessors)
      const projectIds = new Set<string>();
      if (activeProjectId) projectIds.add(activeProjectId);
      const idMap = await buildIdMap(api, projectIds);

      // Fix taskId (AI may have truncated it)
      fixedTaskId = fixTaskId(taskId, idMap) || taskId;
      correctedTaskId = fixedTaskId !== taskId;

      pushProcessingStep?.(t('processing.reading_task_details'));
      if (!fixedTaskId) {
        return { output: t('tool.error.invalid_task_id') };
      }
      const task = await api.getTask(fixedTaskId);
      if (activeProjectId && task.projectId !== activeProjectId) {
        return { output: t('tool.error.task_not_in_active_project') };
      }

      // Fix predecessors array
      fixedPredecessors = fixPredecessors(args.predecessors, idMap);
      correctedPredecessors = args.predecessors != null &&
        JSON.stringify(fixedPredecessors) !== JSON.stringify(args.predecessors);
    }

    if (!taskId) {
      fixedPredecessors = Array.isArray(args.predecessors) ? args.predecessors : [];
    }

    const draftActions: DraftAction[] = [{
      id: generateId(),
      entityType: 'task',
      action: 'update',
      entityId: fixedTaskId,
      after: {
        title: args.title,
        description: args.description,
        status: normalizeStatus(getStringParam(args, 'status')),
        priority: normalizePriority(getStringParam(args, 'priority')),
        wbs: args.wbs, // Preserve WBS for backend resolution
        startDate: normalizedStart.value,
        dueDate: getDateParam(args, 'dueDate'),
        completion: args.completion,
        assignee: args.assignee,
        isMilestone: args.isMilestone,
        predecessors: fixedPredecessors,
      },
    }];

    const outputParts: string[] = [];
    if (correctedTaskId) {
      outputParts.push(t('tool.warning.task_id_corrected'));
    }
    if (correctedPredecessors) {
      outputParts.push(t('tool.warning.predecessors_corrected'));
    }
    if (correctedStartDate) {
      outputParts.push(t('tool.warning.start_date_corrected'));
    }

    return {
      output: outputParts.join(' '),
      draftActions,
      draftReason: reason,
    };
  },

  deleteTask: async (args, { api, activeProjectId, generateId, pushProcessingStep, t }) => {
    const taskId = getStringParam(args, 'id');
    const wbs = getStringParam(args, 'wbs'); // Get WBS parameter

    if (!taskId && !wbs) {
      return { output: t('tool.error.invalid_task_id') };
    }

    let fixedTaskId = taskId;
    let correctedTaskId = false;

    if (taskId) {
      // Build ID map to fix truncated IDs
      const projectIds = new Set<string>();
      if (activeProjectId) projectIds.add(activeProjectId);
      const idMap = await buildIdMap(api, projectIds);

      // Fix taskId (AI may have truncated it)
      fixedTaskId = fixTaskId(taskId, idMap) || taskId;
      correctedTaskId = fixedTaskId !== taskId;

      pushProcessingStep?.(t('processing.reading_task_details'));
      if (!fixedTaskId) {
        return { output: t('tool.error.invalid_task_id') };
      }
      const task = await api.getTask(fixedTaskId);
      if (activeProjectId && task.projectId !== activeProjectId) {
        return { output: t('tool.error.task_not_in_active_project') };
      }
    }

    const draftActions: DraftAction[] = [{
      id: generateId(),
      entityType: 'task',
      action: 'delete',
      entityId: fixedTaskId,
      after: wbs ? { wbs } : undefined, // Store WBS for backend fallback
    }];

    return {
      output: correctedTaskId ? t('tool.warning.task_id_corrected') : '',
      draftActions,
      draftReason: getStringParam(args, 'reason'),
    };
  },

  // planChanges is special - handles multiple actions at once
  planChanges: async (args, { api, activeProjectId, generateId, t }) => {
    if (!Array.isArray(args.actions)) {
      return { output: t('tool.error.invalid_actions') };
    }

    const normalizeTitle = (value: unknown): string | null => {
      if (typeof value !== 'string') return null;
      const normalized = value.trim().toLowerCase().replace(/\s+/g, ' ');
      return normalized.length > 0 ? normalized : null;
    };

    type RawAction = {
      id?: string;
      entityType?: string;
      action?: string;
      entityId?: string;
      after?: Record<string, unknown>;
    };

    // Build a mapping of truncated IDs to full IDs for auto-fixing AI-generated IDs
    // AI models may truncate UUIDs to first 8 characters, so we need to fix them
    const idMap = new Map<string, string>();
    const projectIds = new Set<string>();
    const taskIndexByProject = new Map<string, {
      byTitle: Map<string, string[]>;
      byWbs: Map<string, string[]>;
    }>();

    // Collect all project IDs referenced in actions
    for (const action of args.actions) {
      if (action && typeof action === 'object') {
        const rawAction = action as RawAction;
        if (rawAction.entityType === 'project' && rawAction.action === 'create') {
          const createdId = (rawAction.after?.id as string | undefined) ?? undefined;
          if (createdId) {
            projectIds.add(createdId);
          }
        }
      }
    }

    // Fetch tasks from all relevant projects to build ID mapping
    if (activeProjectId) projectIds.add(activeProjectId);

    for (const projectId of projectIds) {
      try {
        const tasks = await api.listTasks({ projectId });
        const byTitle = new Map<string, string[]>();
        const byWbs = new Map<string, string[]>();
        for (const task of tasks.data) {
          // Map both full ID and truncated ID (first 8 chars) to full ID
          idMap.set(task.id, task.id);
          if (task.id.length >= 8) {
            const truncated = task.id.substring(0, 8);
            idMap.set(truncated, task.id);
          }
          const normalizedTitle = normalizeTitle(task.title);
          if (normalizedTitle) {
            const existing = byTitle.get(normalizedTitle) ?? [];
            existing.push(task.id);
            byTitle.set(normalizedTitle, existing);
          }
          if (task.wbs) {
            const existing = byWbs.get(task.wbs) ?? [];
            existing.push(task.id);
            byWbs.set(task.wbs, existing);
          }
        }
        taskIndexByProject.set(projectId, { byTitle, byWbs });
      } catch (error) {
        // Ignore fetch errors - we'll try to match IDs as-is
        console.error('[planChanges] Failed to fetch tasks for ID mapping:', error);
      }
    }

    // First pass: collect all new project IDs being created and find first one
    const newProjectIds = new Set<string>();
    let firstNewProjectId: string | null = null;
    for (const action of args.actions) {
      if (action && typeof action === 'object') {
        const rawAction = action as RawAction;
        if (rawAction.entityType === 'project' && rawAction.action === 'create') {
          const createdId = (rawAction.after?.id as string | undefined) ?? undefined;
          if (createdId) {
            newProjectIds.add(createdId);
            if (!firstNewProjectId) {
              firstNewProjectId = createdId;
            }
          }
        }
      }
    }

    // Allowed project IDs for task assignment
    const allowedProjectIds = new Set<string>();
    if (activeProjectId) allowedProjectIds.add(activeProjectId);
    for (const projectId of newProjectIds) allowedProjectIds.add(projectId);

    let correctedProjectCount = 0;
    let correctedEntityIdCount = 0;
    let resolvedEntityIdCount = 0;
    let ambiguousReferenceCount = 0;
    const draftActions: DraftAction[] = args.actions
      .map((action: unknown) => {
        if (!action || typeof action !== 'object') {
          return null;
        }
        const rawAction = action as RawAction;

        const processedAfter = { ...(rawAction.after || {}) };
        const shouldSeedProjectId = !rawAction.entityId
          && rawAction.entityType === 'task'
          && rawAction.action !== 'create'
          && !processedAfter.projectId
          && activeProjectId;
        if (shouldSeedProjectId) {
          processedAfter.projectId = activeProjectId;
        }

        // Smart projectId assignment for tasks
        if (rawAction.entityType === 'task' && rawAction.action === 'create') {
          if (!processedAfter.projectId) {
            // No projectId specified - use the first new project being created, or active project
            if (firstNewProjectId) {
              processedAfter.projectId = firstNewProjectId;
            } else if (activeProjectId) {
              processedAfter.projectId = activeProjectId;
            }
            // If still no projectId, it will be caught as a warning during planActions
          } else {
            // projectId was specified - validate it
            const projectId = processedAfter.projectId as string;
            if (allowedProjectIds.size > 0 && !allowedProjectIds.has(projectId)) {
              // Project ID not allowed - use first new project or active project
              processedAfter.projectId = firstNewProjectId ?? activeProjectId;
              correctedProjectCount += 1;
            }
          }
        }

        // Fix truncated entityId (AI may truncate UUIDs to 8 chars)
        let fixedEntityId = rawAction.entityId;
        if (fixedEntityId && idMap.has(fixedEntityId)) {
          const mappedId = idMap.get(fixedEntityId);
          if (mappedId && mappedId !== fixedEntityId) {
            fixedEntityId = mappedId;
            correctedEntityIdCount += 1;
          }
        }

        // Resolve missing task entityId by WBS/title within the active project
        if (!fixedEntityId && rawAction.entityType === 'task' && rawAction.action !== 'create') {
          const lookupProjectId = processedAfter.projectId as string | undefined;
          const index = lookupProjectId ? taskIndexByProject.get(lookupProjectId) : undefined;
          if (index) {
            let resolved = false;
            const wbs = typeof processedAfter.wbs === 'string' ? processedAfter.wbs : undefined;
            if (wbs) {
              const matches = index.byWbs.get(wbs);
              if (matches?.length === 1) {
                fixedEntityId = matches[0];
                resolvedEntityIdCount += 1;
                resolved = true;
              } else if (matches && matches.length > 1) {
                ambiguousReferenceCount += 1;
                resolved = true;
              }
            }
            if (!resolved) {
              const title = normalizeTitle(processedAfter.title);
              if (title) {
                const matches = index.byTitle.get(title);
                if (matches?.length === 1) {
                  fixedEntityId = matches[0];
                  resolvedEntityIdCount += 1;
                } else if (matches && matches.length > 1) {
                  ambiguousReferenceCount += 1;
                }
              }
            }
          }
        }

        // Fix truncated predecessors in after data
        if (processedAfter.predecessors && Array.isArray(processedAfter.predecessors)) {
          const fixedPredecessors: string[] = [];
          for (const pred of processedAfter.predecessors) {
            if (typeof pred === 'string') {
              if (idMap.has(pred)) {
                const mappedId = idMap.get(pred);
                if (mappedId) {
                  fixedPredecessors.push(mappedId);
                  continue;
                }
              }
              // Not in idMap, keep original
              fixedPredecessors.push(pred);
            }
            // Skip non-string predecessors
          }
          processedAfter.predecessors = fixedPredecessors;
        }

        return {
          id: rawAction.id || generateId(),
          entityType: rawAction.entityType as DraftAction['entityType'],
          action: rawAction.action as DraftAction['action'],
          entityId: fixedEntityId,
          after: processedAfter,
        };
      })
      .filter((a): a is NonNullable<typeof a> => a !== null);

    if (draftActions.length === 0) {
      return {
        output: t('tool.error.no_valid_actions'),
        shouldRetry: true,
        retryReason: t('tool.retry.no_valid_actions'),
      };
    }

    const outputParts: string[] = [];
    if (correctedProjectCount > 0) {
      outputParts.push(t('tool.warning.project_id_corrected_count', { count: correctedProjectCount }));
    }
    if (correctedEntityIdCount > 0) {
      outputParts.push(t('tool.warning.entity_id_corrected_count', { count: correctedEntityIdCount }));
    }
    if (resolvedEntityIdCount > 0) {
      outputParts.push(t('tool.warning.entity_id_resolved_count', { count: resolvedEntityIdCount }));
    }
    if (ambiguousReferenceCount > 0) {
      outputParts.push(t('tool.warning.entity_id_ambiguous_count', { count: ambiguousReferenceCount }));
    }
    const output = outputParts.join(' ');

    return {
      output,
      draftActions,
      draftReason: getStringParam(args, 'reason'),
    };
  },

  // Action tools
  applyChanges: async (args, { api, pushProcessingStep, t }) => {
    const draftId = getStringParam(args, 'draftId');
    if (!draftId) {
      return { output: t('tool.error.invalid_draft_id') };
    }
    pushProcessingStep?.(t('processing.applying_draft'));
    await api.applyDraft(draftId, 'user');
    return { output: t('tool.apply.success', { id: draftId }) };
  },
};

/**
 * Execute a tool call on the frontend
 */
export async function executeToolCall(
  toolName: string,
  args: Record<string, unknown>,
  context: ToolHandlerContext
): Promise<ToolExecutionResult> {
  const handler = toolHandlers[toolName];
  if (!handler) {
    return { output: context.t('tool.unknown', { name: toolName }) };
  }
  try {
    return await handler(args, context);
  } catch (error) {
    const serializedArgs = (() => {
      try {
        return JSON.stringify(args);
      } catch {
        return '[unserializable args]';
      }
    })();
    if (error instanceof Error) {
      console.error('[AI Tool Error]', {
        tool: toolName,
        args: serializedArgs,
        message: error.message,
        stack: error.stack,
      });
    } else {
      console.error('[AI Tool Error]', {
        tool: toolName,
        args: serializedArgs,
        error,
      });
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { output: context.t('tool.error.generic', { error: errorMessage }) };
  }
}

/**
 * Process all tool calls from an AI response
 */
export async function processToolCalls(
  toolCalls: Array<{ name: string; args: Record<string, unknown> }>,
  context: ToolHandlerContext
): Promise<{
  outputs: string[];
  draftActions: DraftAction[];
  draftReason: string | undefined;
  shouldRetry: boolean;
  retryReason: string;
  suggestions: string[];
}> {
  const outputs: string[] = [];
  const allDraftActions: DraftAction[] = [];
  const allSuggestions: string[] = [];
  let draftReason: string | undefined;
  let shouldRetry = false;
  let retryReason = '';

  for (const call of toolCalls) {
    const result = await executeToolCall(call.name, call.args, context);
    outputs.push(result.output);
    allDraftActions.push(...(result.draftActions || []));
    if (result.suggestions) {
      allSuggestions.push(...result.suggestions);
    }
    if (result.draftReason) {
      draftReason = result.draftReason;
    }
    if (result.shouldRetry) {
      shouldRetry = true;
      retryReason = result.retryReason || '';
    }
  }

  return {
    outputs,
    draftActions: allDraftActions,
    draftReason,
    shouldRetry,
    retryReason,
    suggestions: allSuggestions,
  };
}

export const READ_ONLY_TOOLS = new Set([
  'listProjects',
  'getProject',
  'listTasks',
  'searchTasks',
  'getTask',
]);
