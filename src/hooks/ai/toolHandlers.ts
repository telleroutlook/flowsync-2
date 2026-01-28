/**
 * AI Tool Handlers for Frontend
 *
 * This module contains handlers for AI tool calls that need to be executed
 * on the frontend side. It works in conjunction with the backend tool registry.
 */

import type { DraftAction } from '../../../types';
import type { ApiClient } from './types';
import type { TFunction } from '../../i18n/types';

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

// Helper to format task dates consistently
const formatTaskDate = (ts: number | null | undefined, t: TFunction) => {
  if (!ts) return t('common.na');
  return new Date(ts).toISOString().split('T')[0];
};

// Helper to extract string parameter safely
const getStringParam = (args: Record<string, unknown>, key: string): string | undefined =>
  typeof args[key] === 'string' ? args[key] : undefined;

// Helper to extract boolean parameter safely
const getBoolParam = (args: Record<string, unknown>, key: string): boolean | undefined =>
  typeof args[key] === 'boolean' ? args[key] : undefined;

// Helper to extract number parameter safely
const getNumberParam = (args: Record<string, unknown>, key: string): number | undefined =>
  typeof args[key] === 'number' ? args[key] : undefined;

const toolHandlers: Record<string, ToolHandlerFunction> = {
  // Read-only tools
  listProjects: async (_args, { api, pushProcessingStep, t }) => {
    pushProcessingStep?.(t('processing.reading_project_list'));
    const list = await api.listProjects();
    const output = t('tool.projects_list', {
      count: list.length,
      items: list.map(p => `${p.name} (${p.id})`).join(', ')
    });
    return { output };
  },

  getProject: async (args, { api, pushProcessingStep, t }) => {
    const id = getStringParam(args, 'id');
    if (!id) {
      return { output: t('tool.error.invalid_project_id') };
    }
    pushProcessingStep?.(t('processing.reading_project_details'));
    const project = await api.getProject(id);
    return { output: t('tool.project_details', { name: project.name, id: project.id }) };
  },

  listTasks: async (args, { api, pushProcessingStep, t }) => {
    pushProcessingStep?.(t('processing.reading_task_list'));
    const result = await api.listTasks({
      projectId: getStringParam(args, 'projectId'),
      status: getStringParam(args, 'status'),
      priority: getStringParam(args, 'priority'),
      assignee: getStringParam(args, 'assignee'),
      isMilestone: getBoolParam(args, 'isMilestone'),
      q: getStringParam(args, 'q'),
      startDateFrom: getNumberParam(args, 'startDateFrom'),
      startDateTo: getNumberParam(args, 'startDateTo'),
      dueDateFrom: getNumberParam(args, 'dueDateFrom'),
      dueDateTo: getNumberParam(args, 'dueDateTo'),
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
    return toolHandlers.listTasks(args, context);
  },

  getTask: async (args, { api, pushProcessingStep, t }) => {
    const id = getStringParam(args, 'id');
    if (!id) {
      return { output: t('tool.error.invalid_task_id') };
    }
    pushProcessingStep?.(t('processing.reading_task_details'));
    const task = await api.getTask(id);
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
  createProject: (args, { activeProjectId, generateId }) => {
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

  updateProject: (args, { generateId }) => {
    const draftActions: DraftAction[] = [{
      id: generateId(),
      entityType: 'project',
      action: 'update',
      entityId: getStringParam(args, 'id'),
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

  deleteProject: (args, { generateId }) => {
    const draftActions: DraftAction[] = [{
      id: generateId(),
      entityType: 'project',
      action: 'delete',
      entityId: getStringParam(args, 'id'),
    }];
    return {
      output: '',
      draftActions,
      draftReason: getStringParam(args, 'reason'),
    };
  },

  createTask: (args, { activeProjectId, generateId }) => {
    const draftActions: DraftAction[] = [{
      id: generateId(),
      entityType: 'task',
      action: 'create',
      after: {
        projectId: (args.projectId as string) || activeProjectId,
        title: args.title,
        description: args.description,
        status: args.status,
        priority: args.priority,
        wbs: args.wbs,
        startDate: args.startDate,
        dueDate: args.dueDate,
        completion: args.completion,
        assignee: args.assignee,
        isMilestone: args.isMilestone,
        predecessors: args.predecessors,
      },
    }];
    return {
      output: '',
      draftActions,
      draftReason: getStringParam(args, 'reason'),
    };
  },

  updateTask: (args, { generateId }) => {
    const draftActions: DraftAction[] = [{
      id: generateId(),
      entityType: 'task',
      action: 'update',
      entityId: getStringParam(args, 'id'),
      after: {
        title: args.title,
        description: args.description,
        status: args.status,
        priority: args.priority,
        wbs: args.wbs,
        startDate: args.startDate,
        dueDate: args.dueDate,
        completion: args.completion,
        assignee: args.assignee,
        isMilestone: args.isMilestone,
        predecessors: args.predecessors,
      },
    }];
    return {
      output: '',
      draftActions,
      draftReason: getStringParam(args, 'reason'),
    };
  },

  deleteTask: (args, { generateId }) => {
    const draftActions: DraftAction[] = [{
      id: generateId(),
      entityType: 'task',
      action: 'delete',
      entityId: getStringParam(args, 'id'),
    }];
    return {
      output: '',
      draftActions,
      draftReason: getStringParam(args, 'reason'),
    };
  },

  // planChanges is special - handles multiple actions at once
  planChanges: (args, { activeProjectId, generateId, t }) => {
    if (!Array.isArray(args.actions)) {
      return { output: t('tool.error.invalid_actions') };
    }

    const draftActions: DraftAction[] = args.actions
      .map((action: any) => {
        if (!action || typeof action !== 'object') {
          return null;
        }

        const processedAfter = { ...(action.after || {}) };
        if (action.entityType === 'task' && action.action === 'create' && !processedAfter.projectId) {
          processedAfter.projectId = activeProjectId;
        }

        return {
          id: action.id || generateId(),
          entityType: action.entityType,
          action: action.action,
          entityId: action.entityId,
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

    return {
      output: '',
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

  suggestActions: (args, { t }) => {
    if (!Array.isArray(args.suggestions)) {
      return { output: '' };
    }
    const suggestions = args.suggestions.filter((s): s is string => typeof s === 'string');
    return {
      output: '',
      suggestions,
    };
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
