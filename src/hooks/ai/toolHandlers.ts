/**
 * AI Tool Handlers for Frontend
 *
 * This module contains handlers for AI tool calls that need to be executed
 * on the frontend side. It works in conjunction with the backend tool registry.
 */

import type { DraftAction } from '../../../types';
import type { ApiClient } from './types';
import type { TFunction } from '../../i18n/types';
import { formatTaskDate as formatTaskDateUtil } from '../../utils/date';

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
const formatTaskDate = (ts: number | null | undefined, t: TFunction) => {
  const formatted = formatTaskDateUtil(ts);
  return formatted === 'N/A' ? t('common.na') : formatted;
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
    const result = await api.listTasks({
      projectId: activeProjectId,
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
    pushProcessingStep?.(t('processing.reading_task_details'));
    const task = await api.getTask(id);
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

  createTask: (args, { activeProjectId, generateId, t }) => {
    const requestedProjectId = getStringParam(args, 'projectId');
    const corrected = !!activeProjectId && !!requestedProjectId && requestedProjectId !== activeProjectId;
    const draftActions: DraftAction[] = [{
      id: generateId(),
      entityType: 'task',
      action: 'create',
      after: {
        projectId: activeProjectId,
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
      output: corrected ? t('tool.warning.project_id_corrected') : '',
      draftActions,
      draftReason: getStringParam(args, 'reason'),
    };
  },

  updateTask: async (args, { api, activeProjectId, generateId, pushProcessingStep, t }) => {
    const taskId = getStringParam(args, 'id');
    if (!taskId) {
      return { output: t('tool.error.invalid_task_id') };
    }
    pushProcessingStep?.(t('processing.reading_task_details'));
    const task = await api.getTask(taskId);
    if (activeProjectId && task.projectId !== activeProjectId) {
      return { output: t('tool.error.task_not_in_active_project') };
    }
    const draftActions: DraftAction[] = [{
      id: generateId(),
      entityType: 'task',
      action: 'update',
      entityId: taskId,
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

  deleteTask: async (args, { api, activeProjectId, generateId, pushProcessingStep, t }) => {
    const taskId = getStringParam(args, 'id');
    if (!taskId) {
      return { output: t('tool.error.invalid_task_id') };
    }
    pushProcessingStep?.(t('processing.reading_task_details'));
    const task = await api.getTask(taskId);
    if (activeProjectId && task.projectId !== activeProjectId) {
      return { output: t('tool.error.task_not_in_active_project') };
    }
    const draftActions: DraftAction[] = [{
      id: generateId(),
      entityType: 'task',
      action: 'delete',
      entityId: taskId,
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

    type RawAction = {
      id?: string;
      entityType?: string;
      action?: string;
      entityId?: string;
      after?: Record<string, unknown>;
    };

    const newProjectIds = new Set<string>();
    for (const action of args.actions) {
      if (action && typeof action === 'object') {
        const rawAction = action as RawAction;
        if (rawAction.entityType === 'project' && rawAction.action === 'create') {
          const createdId = (rawAction.after?.id as string | undefined) ?? undefined;
          if (createdId) newProjectIds.add(createdId);
        }
      }
    }

    const allowedProjectIds = new Set<string>();
    if (activeProjectId) allowedProjectIds.add(activeProjectId);
    for (const projectId of newProjectIds) allowedProjectIds.add(projectId);

    let correctedProjectCount = 0;
    const draftActions: DraftAction[] = args.actions
      .map((action: unknown) => {
        if (!action || typeof action !== 'object') {
          return null;
        }
        const rawAction = action as RawAction;

        const processedAfter = { ...(rawAction.after || {}) };
        if (rawAction.entityType === 'task' && rawAction.action === 'create' && !processedAfter.projectId) {
          processedAfter.projectId = activeProjectId;
        }
        if (rawAction.entityType === 'task' && rawAction.action === 'create' && processedAfter.projectId) {
          const projectId = processedAfter.projectId as string;
          if (allowedProjectIds.size > 0 && !allowedProjectIds.has(projectId)) {
            processedAfter.projectId = activeProjectId;
            correctedProjectCount += 1;
          }
        }

        return {
          id: rawAction.id || generateId(),
          entityType: rawAction.entityType as DraftAction['entityType'],
          action: rawAction.action as DraftAction['action'],
          entityId: rawAction.entityId,
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

    const output = correctedProjectCount > 0
      ? t('tool.warning.project_id_corrected_count', { count: correctedProjectCount })
      : '';

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

  suggestActions: async (_args, { api, activeProjectId, t }) => {
    // Generate context-aware suggestions based on project state
    const suggestions: string[] = [];

    try {
      // Get current project state
      const tasksResult = await api.listTasks({
        projectId: activeProjectId,
        pageSize: 100,
      });

      const tasks = tasksResult.data;
      const now = Date.now();

      // Analyze project state and generate relevant suggestions
      const inProgressTasks = tasks.filter(t => t.status === 'IN_PROGRESS');
      const todoTasks = tasks.filter(t => t.status === 'TODO');
      const overdueTasks = tasks.filter(t => t.dueDate && t.dueDate < now && t.status !== 'DONE');
      const completedTasks = tasks.filter(t => t.status === 'DONE');
      const totalTasks = tasks.length;

      // Scenario 1: Project overview (first interaction or general query)
      if (totalTasks === 0) {
        suggestions.push(
          t('suggestions.create_first_task'),
          t('suggestions.import_tasks'),
        );
      }
      // Scenario 2: Many overdue tasks
      else if (overdueTasks.length >= 3) {
        suggestions.push(
          t('suggestions.review_overdue', { count: overdueTasks.length }),
          t('suggestions.reschedule_overdue'),
          t('suggestions.view_overdue_tasks'),
        );
      }
      // Scenario 3: No tasks in progress
      else if (inProgressTasks.length === 0 && todoTasks.length > 0) {
        suggestions.push(
          t('suggestions.start_next_task', { count: Math.min(3, todoTasks.length) }),
          t('suggestions.view_todo_tasks'),
        );
      }
      // Scenario 4: Many tasks in progress (suggest focusing or completing)
      else if (inProgressTasks.length >= 5) {
        suggestions.push(
          t('suggestions.review_progress', { count: inProgressTasks.length }),
          t('suggestions.update_task_status'),
          t('suggestions.view_gantt_chart'),
        );
      }
      // Scenario 5: Good progress (suggest completing or next steps)
      else if (completedTasks.length >= totalTasks * 0.5) {
        suggestions.push(
          t('suggestions.view_progress'),
          t('suggestions.export_report'),
          t('suggestions.create_next_milestone'),
        );
      }
      // Scenario 6: Default balanced suggestions
      else {
        suggestions.push(
          t('suggestions.view_kanban'),
          t('suggestions.create_task'),
          t('suggestions.analyze_timeline'),
        );
      }

      // Add project-specific suggestions if we have an active project
      if (activeProjectId && totalTasks > 0) {
        // Check for tasks approaching deadline
        const upcomingDeadlines = tasks.filter(t => {
          if (!t.dueDate || t.status === 'DONE') return false;
          const daysUntilDue = (t.dueDate - now) / (1000 * 60 * 60 * 24);
          return daysUntilDue >= 0 && daysUntilDue <= 7;
        });

        if (upcomingDeadlines.length > 0 && !suggestions.includes(t('suggestions.view_upcoming_deadlines'))) {
          suggestions.splice(1, 0, t('suggestions.view_upcoming_deadlines', { count: upcomingDeadlines.length }));
        }
      }

      // Limit to 3 suggestions
      return {
        output: t('tool.suggestions.generated', { count: Math.min(3, suggestions.length) }),
        suggestions: suggestions.slice(0, 3),
      };
    } catch (error) {
      // Fallback to generic suggestions if analysis fails
      return {
        output: t('tool.suggestions.fallback'),
        suggestions: [
          t('suggestions.view_kanban'),
          t('suggestions.create_task'),
          t('suggestions.list_projects'),
        ].slice(0, 3),
      };
    }
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
