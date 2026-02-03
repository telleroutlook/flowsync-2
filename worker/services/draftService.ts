import { eq, and, inArray } from 'drizzle-orm';
import { drafts, projects, tasks } from '../db/schema';
import { toProjectRecord, toTaskRecord } from './serializers';
import { applyTaskConstraints } from './constraintService';
import { recordAudit } from './auditService';
import { createProject, updateProject, deleteProject, getProjectById } from './projectService';
import { createTask, updateTask, deleteTask, getTaskById } from './taskService';
import { generateId, now } from './utils';
import type {
  DraftAction,
  DraftRecord,
  PlanResult,
  TaskRecord,
  ProjectRecord,
  TaskStatus,
  Priority,
  DraftStatus,
  ConflictInfo
} from './types';

const toTaskStatus = (value: unknown, fallback: TaskStatus): TaskStatus => {
  if (value === 'TODO' || value === 'IN_PROGRESS' || value === 'DONE') return value;
  return fallback;
};

const toPriority = (value: unknown, fallback: Priority): Priority => {
  if (value === 'LOW' || value === 'MEDIUM' || value === 'HIGH') return value;
  return fallback;
};

const toOptionalTaskStatus = (value: unknown): TaskStatus | undefined => {
  if (value === 'TODO' || value === 'IN_PROGRESS' || value === 'DONE') return value;
  return undefined;
};

const toOptionalPriority = (value: unknown): Priority | undefined => {
  if (value === 'LOW' || value === 'MEDIUM' || value === 'HIGH') return value;
  return undefined;
};

const parseDraftRow = (row: {
  id: string;
  workspaceId: string;
  projectId: string | null;
  status: string;
  actions: unknown;
  createdAt: number;
  createdBy: string;
  reason: string | null;
}): DraftRecord => {
  // Validate status enum (include all valid DraftStatus values)
  const validStatuses = ['pending', 'applied', 'discarded', 'failed', 'partial'] as const;
  const status: DraftRecord['status'] = validStatuses.includes(row.status as DraftRecord['status'])
    ? row.status as DraftRecord['status']
    : 'pending';

  // Validate createdBy enum
  const validCreators = ['user', 'agent', 'system'] as const;
  const createdBy: DraftRecord['createdBy'] = validCreators.includes(row.createdBy as DraftRecord['createdBy'])
    ? row.createdBy as DraftRecord['createdBy']
    : 'agent';

  // Validate actions is an array
  const actions: DraftAction[] = Array.isArray(row.actions) ? row.actions as DraftAction[] : [];

  return {
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    status,
    actions,
    createdAt: row.createdAt,
    createdBy,
    reason: row.reason,
  };
};

/**
 * Safely extracts a string value from unknown input
 */
function getString(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value !== '') return value;
  return fallback;
}

/**
 * Safely extracts an optional string value from unknown input
 */
function getOptionalString(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return null;
  return null;
}

/**
 * Safely extracts an optional number value from unknown input
 */
function getOptionalNumber(value: unknown): number | null {
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  if (value === null || value === undefined) return null;
  return null;
}

/**
 * Safely extracts a boolean value from unknown input
 */
function getBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  return fallback;
}

/**
 * Safely extracts a string array from unknown input
 */
function getStringArray(value: unknown): string[] {
  if (Array.isArray(value) && value.every(item => typeof item === 'string')) {
    return value as string[];
  }
  return [];
}

const normalizeTaskInput = (
  input: Record<string, unknown>,
  fallback: TaskRecord | null,
  projectIdOverride?: string
): TaskRecord => {
  const timestamp = now();
  const projectId = getString(input.projectId ?? '', projectIdOverride ?? fallback?.projectId ?? '');
  const status = toTaskStatus(input.status, fallback?.status ?? 'TODO');
  const priority = toPriority(input.priority, fallback?.priority ?? 'MEDIUM');
  const createdAt = getOptionalNumber(input.createdAt) ?? fallback?.createdAt ?? timestamp;
  const updatedAt = getOptionalNumber(input.updatedAt) ?? timestamp;
  const startDate = getOptionalNumber(input.startDate) ?? fallback?.startDate ?? createdAt;
  const dueDate = getOptionalNumber(input.dueDate) ?? fallback?.dueDate ?? null;
  const completion = getOptionalNumber(input.completion) ?? fallback?.completion ?? 0;
  const predecessors = getStringArray(input.predecessors) ?? fallback?.predecessors ?? [];

  return {
    id: getString(input.id || '', fallback?.id || generateId()),  // Use || to handle empty string
    projectId,
    title: getString(input.title ?? '', fallback?.title ?? 'Untitled Task'),
    description: getOptionalString(input.description) ?? fallback?.description ?? null,
    status: status as TaskRecord['status'],
    priority: priority as TaskRecord['priority'],
    wbs: getOptionalString(input.wbs) ?? fallback?.wbs ?? null,
    createdAt,
    startDate,
    dueDate,
    completion,
    assignee: getOptionalString(input.assignee) ?? fallback?.assignee ?? null,
    isMilestone: getBoolean(input.isMilestone, fallback?.isMilestone ?? false),
    predecessors,
    updatedAt,
  };
};

const normalizeProjectInput = (
  input: Record<string, unknown>,
  fallback: ProjectRecord | null,
  workspaceId: string
): ProjectRecord => {
  const timestamp = now();
  const resolvedWorkspaceId = fallback?.workspaceId ?? workspaceId;
  const createdAt = getOptionalNumber(input.createdAt) ?? fallback?.createdAt ?? timestamp;
  const updatedAt = getOptionalNumber(input.updatedAt) ?? timestamp;

  return {
    id: getString(input.id || '', fallback?.id || generateId()),  // Use || to handle empty string
    workspaceId: resolvedWorkspaceId,
    name: getString(input.name ?? '', fallback?.name ?? 'Untitled Project'),
    description: getOptionalString(input.description) ?? fallback?.description ?? null,
    icon: getOptionalString(input.icon) ?? fallback?.icon ?? null,
    createdAt,
    updatedAt,
  };
};

/**
 * Handler context for action processing
 * Contains shared state that handlers can read and modify
 */
interface ActionHandlerContext {
  /** Current project state - handlers can modify this */
  projectState: ProjectRecord[];
  /** Current task state - handlers can modify this */
  taskState: TaskRecord[];
  /** Project lookup map for O(1) access */
  projectStateMap: Map<string, ProjectRecord>;
  /** Task lookup map for O(1) access */
  taskStateMap: Map<string, TaskRecord>;
  /** Collected warnings across all actions */
  warnings: string[];
  /** The workspace ID */
  workspaceId: string;
  /** Planned actions to be returned */
  planned: DraftAction[];
}

/**
 * Result returned by action handlers
 */
interface ActionResult {
  /** Updated project state (optional, if unchanged return undefined) */
  projectState?: ProjectRecord[];
  /** Updated task state (optional, if unchanged return undefined) */
  taskState?: TaskRecord[];
  /** The planned action to add */
  plannedAction: DraftAction;
  /** Any warnings to add to the global warnings array */
  warnings?: string[];
  /** Whether to stop processing this action (skip further handlers) */
  continueProcessing: boolean;
}

/**
 * Compensating transaction log entry
 * Tracks completed operations for rollback capability
 */
interface CompensatingLogEntry {
  /** Sequence number for ordering */
  sequence: number;
  /** Action type that was executed */
  actionType: 'project.create' | 'project.update' | 'project.delete' | 'task.create' | 'task.update' | 'task.delete';
  /** Entity ID affected */
  entityId: string;
  /** Snapshot of state before the operation (for rollback) */
  before: {
    project?: ProjectRecord;
    task?: TaskRecord;
    tasks?: TaskRecord[]; // For project delete - tasks that were cascade deleted
  };
  /** Whether audit log was recorded (needs cleanup on rollback) */
  auditRecorded: boolean;
  /** Timestamp of operation */
  timestamp: number;
}

/**
 * Type for action handler functions
 */
type ActionHandler = (
  action: DraftAction,
  context: ActionHandlerContext
) => Promise<ActionResult> | ActionResult;

/**
 * Handles project creation actions
 * @param action - The draft action to process
 * @param context - Handler context with state and warnings
 * @returns Action result with updated state and planned action
 */
const handleProjectCreate: ActionHandler = (action, context) => {
  const { projectState, workspaceId } = context;
  const project = normalizeProjectInput(action.after ?? {}, null, workspaceId);

  return {
    projectState: [...projectState, project],
    plannedAction: {
      ...action,
      id: action.id || generateId(),
      entityId: project.id,
      before: null,
      after: project,
    },
    continueProcessing: true,
  };
};

/**
 * Handles project update actions
 * @param action - The draft action to process
 * @param context - Handler context with state and warnings
 * @returns Action result with updated state and planned action
 */
const handleProjectUpdate: ActionHandler = (action, context) => {
  const { projectState, projectStateMap, workspaceId, warnings } = context;
  const entityId = action.entityId;
  if (!entityId) {
    const warningMessage = 'Project update missing entityId.';
    warnings.push(warningMessage);

    return {
      plannedAction: {
        ...action,
        id: action.id || generateId(),
        before: null,
        after: null,
        warnings: [warningMessage],
      },
      continueProcessing: false,
    };
  }

  const existing = projectStateMap.get(entityId);

  if (!existing) {
    const warningMessage = 'Project not found for update.';
    warnings.push(warningMessage);

    return {
      plannedAction: {
        ...action,
        id: action.id || generateId(),
        before: null,
        after: null,
        warnings: [warningMessage],
      },
      continueProcessing: false,
    };
  }

  const updated = normalizeProjectInput(action.after ?? {}, existing, workspaceId);

  // Update both the array and the map
  projectStateMap.set(updated.id, updated);

  return {
    projectState: projectState.map((item) => (item.id === existing.id ? updated : item)),
    plannedAction: {
      ...action,
      id: action.id || generateId(),
      entityId: existing.id,
      before: existing,
      after: updated,
    },
    continueProcessing: true,
  };
};

/**
 * Handles project deletion actions
 * @param action - The draft action to process
 * @param context - Handler context with state and warnings
 * @returns Action result with updated state and planned action
 */
const handleProjectDelete: ActionHandler = (action, context) => {
  const { projectState, taskState, projectStateMap, taskStateMap, warnings } = context;
  const entityId = action.entityId;
  if (!entityId) {
    const warningMessage = 'Project delete missing entityId.';
    warnings.push(warningMessage);

    return {
      plannedAction: {
        ...action,
        id: action.id || generateId(),
        before: null,
        after: null,
        warnings: [warningMessage],
      },
      continueProcessing: false,
    };
  }

  const existing = projectStateMap.get(entityId);

  if (!existing) {
    const warningMessage = 'Project not found for delete.';
    warnings.push(warningMessage);

    return {
      plannedAction: {
        ...action,
        id: action.id || generateId(),
        before: null,
        after: null,
        warnings: [warningMessage],
      },
      continueProcessing: false,
    };
  }

  // Remove from map
  projectStateMap.delete(existing.id);

  return {
    projectState: projectState.filter((item) => item.id !== existing.id),
    taskState: taskState.filter((task) => {
      if (task.projectId !== existing.id) return true;
      taskStateMap.delete(task.id);
      return false;
    }),
    plannedAction: {
      ...action,
      id: action.id || generateId(),
      entityId: existing.id,
      before: existing,
      after: null,
    },
    continueProcessing: true,
  };
};

/**
 * Handles task creation actions
 * @param action - The draft action to process
 * @param context - Handler context with state and warnings
 * @returns Action result with updated state and planned action
 */
const handleTaskCreate: ActionHandler = (action, context) => {
  const { taskState, warnings } = context;
  const projectIdOverride = (action.after as Record<string, unknown> | undefined)?.projectId as string | undefined;
  const task = normalizeTaskInput(action.after ?? {}, null, projectIdOverride);
  const constraintResult = applyTaskConstraints(task, [...taskState, task]);
  const updatedTask = constraintResult.task;

  if (!updatedTask.projectId) {
    constraintResult.warnings.push('Task create missing projectId.');
  }

  const actionWarnings = constraintResult.warnings;
  if (actionWarnings.length) {
    warnings.push(...actionWarnings);
  }

  return {
    taskState: [...taskState, updatedTask],
    plannedAction: {
      ...action,
      id: action.id || generateId(),
      entityId: updatedTask.id,
      before: null,
      after: updatedTask,
      warnings: actionWarnings.length ? actionWarnings : undefined,
    },
    continueProcessing: true,
  };
};

/**
 * Handles task update actions
 * @param action - The draft action to process
 * @param context - Handler context with state and warnings
 * @returns Action result with updated state and planned action
 */
const handleTaskUpdate: ActionHandler = (action, context) => {
  const { taskState, taskStateMap, warnings } = context;
  const entityId = action.entityId;
  if (!entityId) {
    const warningMessage = 'Task update missing entityId.';
    warnings.push(warningMessage);

    return {
      plannedAction: {
        ...action,
        id: action.id || generateId(),
        before: null,
        after: null,
        warnings: [warningMessage],
      },
      continueProcessing: false,
    };
  }

  const existing = taskStateMap.get(entityId);

  if (!existing) {
    const warningMessage = 'Task not found.';
    warnings.push(warningMessage);

    return {
      plannedAction: {
        ...action,
        id: action.id || generateId(),
        before: null,
        after: null,
        warnings: [warningMessage],
      },
      continueProcessing: false,
    };
  }

  const merged = normalizeTaskInput(action.after ?? {}, existing, existing.projectId);

  // Detect which fields were explicitly modified
  const explicitFields: string[] = [];
  const afterObj = action.after ?? {};

  // Check date fields (handle null vs undefined properly)
  if ('startDate' in afterObj && afterObj.startDate !== existing.startDate) {
    explicitFields.push('startDate');
  }
  if ('dueDate' in afterObj && afterObj.dueDate !== existing.dueDate) {
    explicitFields.push('dueDate');
  }
  // Check other fields
  if ('title' in afterObj && afterObj.title !== existing.title) {
    explicitFields.push('title');
  }
  if ('status' in afterObj && afterObj.status !== existing.status) {
    explicitFields.push('status');
  }
  if ('priority' in afterObj && afterObj.priority !== existing.priority) {
    explicitFields.push('priority');
  }
  if ('assignee' in afterObj && afterObj.assignee !== existing.assignee) {
    explicitFields.push('assignee');
  }

  // Check if dates were explicitly modified
  const datesModified = explicitFields.includes('startDate') || explicitFields.includes('dueDate');

  // First, check what the constraints would require
  const constraintResult = applyTaskConstraints(merged, taskState.map((item) => (item.id === existing.id ? merged : item)));

  // If dates were modified and constraints would change them, it's a violation
  if (datesModified && constraintResult.changed) {
    const constrainedStart = constraintResult.task.startDate;
    const constrainedDue = constraintResult.task.dueDate;

    // Check if the constrained dates differ from the user's requested dates
    const startViolated = explicitFields.includes('startDate') && constrainedStart !== merged.startDate;
    const dueViolated = explicitFields.includes('dueDate') && constrainedDue !== merged.dueDate;

    if (startViolated || dueViolated) {
      // Instead of throwing, we warn the user and allow the system to auto-correct the dates
      // to the valid constrained dates (which happens in the fall-through below).
      const warningMessage = [
        `Adjusted task dates: ${startViolated ? 'Start Date' : ''}${startViolated && dueViolated ? ' and ' : ''}${dueViolated ? 'Due Date' : ''} violated predecessor constraints`,
        `Task "${existing.title}" has mandatory predecessors.`,
        `Requested: ${merged.startDate ? new Date(merged.startDate).toISOString().split('T')[0] : 'N/A'} - ${merged.dueDate ? new Date(merged.dueDate).toISOString().split('T')[0] : 'N/A'}`,
        `Adjusted to: ${constrainedStart ? new Date(constrainedStart).toISOString().split('T')[0] : 'N/A'} - ${constrainedDue ? new Date(constrainedDue).toISOString().split('T')[0] : 'N/A'}`
      ].join('. ');

      warnings.push(warningMessage);
      // We append this specific warning to the constraint result so it appears on the action item too
      constraintResult.warnings.push(warningMessage);
    }
  }

  const actionWarnings = constraintResult.warnings;
  if (actionWarnings.length) {
    warnings.push(...actionWarnings);
  }

  // Update map with the constrained task
  taskStateMap.set(constraintResult.task.id, constraintResult.task);

  return {
    taskState: taskState.map((item) => (item.id === existing.id ? constraintResult.task : item)),
    plannedAction: {
      ...action,
      id: action.id || generateId(),
      entityId: existing.id,
      before: existing,
      after: constraintResult.task,
      warnings: actionWarnings.length ? actionWarnings : undefined,
    },
    continueProcessing: true,
  };
};

/**
 * Handles task deletion actions
 * @param action - The draft action to process
 * @param context - Handler context with state and warnings
 * @returns Action result with updated state and planned action
 */
const handleTaskDelete: ActionHandler = (action, context) => {
  const { taskState, taskStateMap, warnings } = context;
  const entityId = action.entityId;
  if (!entityId) {
    const warningMessage = 'Task delete missing entityId.';
    warnings.push(warningMessage);

    return {
      plannedAction: {
        ...action,
        id: action.id || generateId(),
        before: null,
        after: null,
        warnings: [warningMessage],
      },
      continueProcessing: false,
    };
  }

  const existing = taskStateMap.get(entityId);

  if (!existing) {
    const warningMessage = 'Task not found.';
    warnings.push(warningMessage);

    return {
      plannedAction: {
        ...action,
        id: action.id || generateId(),
        before: null,
        after: null,
        warnings: [warningMessage],
      },
      continueProcessing: false,
    };
  }

  // Remove from map
  taskStateMap.delete(existing.id);

  return {
    taskState: taskState.filter((item) => item.id !== existing.id),
    plannedAction: {
      ...action,
      id: action.id || generateId(),
      entityId: existing.id,
      before: existing,
      after: null,
    },
    continueProcessing: true,
  };
};

/**
 * Strategy lookup table for action handlers
 * Maps entity type and action to the appropriate handler function
 */
const ACTION_HANDLERS: Record<string, ActionHandler> = {
  'project.create': handleProjectCreate,
  'project.update': handleProjectUpdate,
  'project.delete': handleProjectDelete,
  'task.create': handleTaskCreate,
  'task.update': handleTaskUpdate,
  'task.delete': handleTaskDelete,
};

/**
 * Plans draft actions by validating and preparing them for application
 *
 * This function processes draft actions, validates constraints, and prepares
 * the actions for application. It uses a strategy pattern with dedicated handlers
 * for each combination of entity type and action.
 *
 * @param db - Database connection
 * @param actions - Array of draft actions to plan
 * @param workspaceId - Workspace ID for scoping
 * @returns Planned actions with any warnings
 */
const planActions = async (
  db: ReturnType<typeof import('../db').getDb>,
  actions: DraftAction[],
  workspaceId: string
) => {
  const planned: DraftAction[] = [];
  const warnings: string[] = [];

  // INTELLIGENT ENTITY RESOLUTION: Resolve missing/incorrect entityIds
  // This cascading resolution tries multiple strategies to match entities
  // when AI provides incomplete or inaccurate information
  const { resolveTask, resolveProject } = await import('./entityResolver');
  const resolvedActions = await Promise.all(
    actions.map(async (action) => {
      // Skip resolution for create actions
      if (action.action === 'create') return action;

      // Skip resolution if entityId is a complete UUID (36 characters for standard format)
      // Partial/truncated IDs (like first 8 chars) will be resolved by entityResolver
      if (action.entityId && action.entityId.length === 36) return action;

      // Try to resolve task references
      if (action.entityType === 'task') {
        // Determine the active project ID from context
        const projectId = action.after?.projectId as string | undefined;

        const result = await resolveTask(db, {
          entityType: 'task',
          action: action.action as 'update' | 'delete',
          entityId: action.entityId,
          after: action.after as Record<string, unknown> | undefined,
          fallbackRef: {
            title: action.after?.title as string | undefined,
            wbs: action.after?.wbs as string | undefined,
            projectId: projectId,
            assignee: action.after?.assignee as string | undefined,
          },
        }, workspaceId, projectId);

        if (result.success && result.entityId) {
          // Log resolution warnings for transparency
          if (result.warnings && result.warnings.length > 0) {
            warnings.push(...result.warnings);
          }

          // Return action with resolved entityId
          return {
            ...action,
            entityId: result.entityId,
          };
        } else {
          // Resolution failed - add warning but keep original action
          warnings.push(
            `Failed to resolve task reference: ${action.after?.title || action.entityId || 'unknown'}. ` +
            `Reason: ${result.error || 'Entity not found'}`
          );
          return action;
        }
      }

      // Try to resolve project references
      if (action.entityType === 'project') {
        const result = await resolveProject(db, {
          entityType: 'project',
          action: action.action as 'update' | 'delete',
          entityId: action.entityId,
          after: action.after as Record<string, unknown> | undefined,
          fallbackRef: {
            title: action.after?.name as string | undefined,
          },
        }, workspaceId);

        if (result.success && result.entityId) {
          // Log resolution warnings for transparency
          if (result.warnings && result.warnings.length > 0) {
            warnings.push(...result.warnings);
          }

          // Return action with resolved entityId
          return {
            ...action,
            entityId: result.entityId,
          };
        } else {
          // Resolution failed - add warning but keep original action
          warnings.push(
            `Failed to resolve project reference: ${action.after?.name || action.entityId || 'unknown'}. ` +
            `Reason: ${result.error || 'Entity not found'}`
          );
          return action;
        }
      }

      return action;
    })
  );

  // SMART PROJECT ID ASSIGNMENT: First pass - collect new project IDs being created
  // (Use resolvedActions since they have entityId filled in)
  const newProjectIds = new Set<string>();
  let firstNewProjectId: string | null = null;

  for (const action of resolvedActions) {
    if (action.entityType === 'project' && action.action === 'create' && action.after) {
      const createdId = (action.after.id as string | undefined) ?? undefined;
      if (createdId) {
        newProjectIds.add(createdId);
        if (!firstNewProjectId) {
          firstNewProjectId = createdId;
        }
      }
    }
  }

  // SMART PROJECT ID ASSIGNMENT: Second pass - assign projectId to tasks without one
  // This builds on top of resolvedActions to create a fully processed action array
  const adjustedActions = resolvedActions.map(action => {
    if (action.entityType === 'task' && action.action === 'create' && action.after) {
      const after = action.after as Record<string, unknown>;
      const currentProjectId = after.projectId as string | undefined;

      if (!currentProjectId && firstNewProjectId) {
        // Task has no projectId - assign it to the first new project being created
        return {
          ...action,
          after: {
            ...after,
            projectId: firstNewProjectId,
          },
        };
      }
    }
    return action;
  });

  // Extract IDs that we need to fetch using Sets for O(1) lookups
  const projectIdsToFetch = new Set<string>();
  const taskIdsToFetch = new Set<string>();
  const projectIdsReferenced = new Set<string>();
  const taskPredecessorIds = new Set<string>();

  // Single pass to collect all IDs we need (using adjustedActions)
  for (const action of adjustedActions) {
    if (action.entityType === 'project') {
      if (action.action !== 'create') {
        const id = action.entityId;
        if (id) projectIdsToFetch.add(id);
      }
    } else if (action.entityType === 'task') {
      if (action.action !== 'create') {
        const id = action.entityId;
        if (id) taskIdsToFetch.add(id);
      }
      // Collect project IDs from task actions
      const projectId = (action.after as Record<string, unknown> | undefined)?.projectId as string | undefined;
      if (projectId) projectIdsReferenced.add(projectId);

      // Collect predecessor IDs for constraint validation
      const predecessors = (action.after as Record<string, unknown> | undefined)?.predecessors as string[] | undefined;
      if (predecessors?.length) {
        for (const predId of predecessors) {
          if (predId) taskPredecessorIds.add(predId);
        }
      }
    }
  }

  // Include predecessor IDs in tasks to fetch
  for (const predId of taskPredecessorIds) {
    taskIdsToFetch.add(predId);
  }

  // Fetch only the projects we need
  let projectState: ProjectRecord[] = [];
  if (projectIdsToFetch.size > 0 || projectIdsReferenced.size > 0) {
    const { and, inArray, or } = await import('drizzle-orm');
    const conditions = [];

    // Use empty array check to avoid empty IN clauses
    const fetchProjectIds = Array.from(projectIdsToFetch).filter(Boolean);
    const referencedProjectIds = Array.from(projectIdsReferenced).filter(Boolean);

    if (fetchProjectIds.length > 0) {
      conditions.push(inArray(projects.id, fetchProjectIds));
    }
    if (referencedProjectIds.length > 0) {
      conditions.push(inArray(projects.id, referencedProjectIds));
    }
    const targetClause = conditions.length > 1 ? or(...conditions) : conditions[0];
    const whereClause = targetClause ? and(eq(projects.workspaceId, workspaceId), targetClause) : eq(projects.workspaceId, workspaceId);
    const projectRows = await db.select().from(projects).where(whereClause);
    projectState = projectRows.map(toProjectRecord);
  }

  // For tasks, we need to fetch:
  // 1. Tasks being modified
  // 2. Tasks that are predecessors of tasks being modified (for constraint validation)
  // Optimization: For small drafts, load selectively. For large drafts, load all.
  const SELECTIVE_LOAD_THRESHOLD = 50;
  let taskState: TaskRecord[] = [];

  if (taskIdsToFetch.size === 0 && actions.every(a => a.entityType !== 'task' || a.action === 'create')) {
    // No existing tasks to fetch - only new tasks being created
    taskState = [];
  } else if (taskIdsToFetch.size > SELECTIVE_LOAD_THRESHOLD) {
    // Large draft - fetch all tasks (more efficient than many individual queries)
    const taskRows = await db
      .select()
      .from(tasks)
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .where(eq(projects.workspaceId, workspaceId));
    taskState = taskRows.map((row) => toTaskRecord(row.tasks));
  } else {
    // Small draft - fetch selectively
    const { and, inArray, or } = await import('drizzle-orm');
    const conditions = [];

    // Tasks being directly modified
    const fetchTaskIds = Array.from(taskIdsToFetch).filter(Boolean);
    if (fetchTaskIds.length > 0) {
      conditions.push(inArray(tasks.id, fetchTaskIds));
    }

    // Tasks in the same projects (for predecessor constraint validation)
    const referencedProjectIds = Array.from(projectIdsReferenced).filter(Boolean);
    if (referencedProjectIds.length > 0) {
      conditions.push(inArray(tasks.projectId, referencedProjectIds));
    }

    // Build WHERE clause with proper empty check
    const taskFilter = conditions.length === 0 ? undefined : (conditions.length === 1 ? conditions[0] : or(...conditions));
    const combinedClause = taskFilter ? and(taskFilter, eq(projects.workspaceId, workspaceId)) : eq(projects.workspaceId, workspaceId);
    const taskRows = await db
      .select()
      .from(tasks)
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .where(combinedClause);
    taskState = taskRows.map((row) => toTaskRecord(row.tasks));
  }

  // Build Maps for O(1) lookups in handlers
  const projectStateMap = new Map(projectState.map(p => [p.id, p]));
  const taskStateMap = new Map(taskState.map(t => [t.id, t]));

  // Initialize handler context with Maps for efficient lookups
  const context: ActionHandlerContext = {
    projectState,
    taskState,
    projectStateMap,
    taskStateMap,
    warnings,
    workspaceId,
    planned,
  };

  // Process each action using the strategy pattern (using adjustedActions)
  for (const action of adjustedActions) {
    const handlerKey = `${action.entityType}.${action.action}`;
    const handler = ACTION_HANDLERS[handlerKey];

    if (!handler) {
      // Unknown action type - skip with a warning
      warnings.push(`Unknown action type: ${handlerKey}`);
      continue;
    }

    const result = await handler(action, context);

    // Update context with result (handlers keep Maps in sync internally)
    if (result.projectState !== undefined) {
      context.projectState = result.projectState;
    }
    if (result.taskState !== undefined) {
      context.taskState = result.taskState;
    }

    // Add the planned action
    context.planned.push(result.plannedAction);

    // Stop processing this action if the handler indicates to stop
    if (!result.continueProcessing) {
      continue;
    }
  }

  return { actions: planned, warnings };
};

export const createDraft = async (
  db: ReturnType<typeof import('../db').getDb>,
  input: {
    actions: DraftAction[];
    createdBy: DraftRecord['createdBy'];
    reason?: string;
    projectId?: string | null;
    workspaceId: string;
  }
): Promise<PlanResult> => {
  const { actions, warnings } = await planActions(db, input.actions, input.workspaceId);
  const draft: DraftRecord = {
    id: generateId(),
    workspaceId: input.workspaceId,
    projectId: input.projectId ?? null,
    status: 'pending',
    actions,
    createdAt: now(),
    createdBy: input.createdBy,
    reason: input.reason ?? null,
  };

  await db.insert(drafts).values({
    id: draft.id,
    workspaceId: draft.workspaceId,
    projectId: draft.projectId,
    status: draft.status,
    actions: draft.actions,
    createdAt: draft.createdAt,
    createdBy: draft.createdBy,
    reason: draft.reason,
  });

  return { draft, warnings };
};

export const getDraftById = async (
  db: ReturnType<typeof import('../db').getDb>,
  id: string,
  workspaceId: string
): Promise<DraftRecord | null> => {
  const { and } = await import('drizzle-orm');
  const rows = await db
    .select()
    .from(drafts)
    .where(and(eq(drafts.id, id), eq(drafts.workspaceId, workspaceId)))
    .limit(1);
  const row = rows[0];
  return row ? parseDraftRow(row) : null;
};

export const listDrafts = async (
  db: ReturnType<typeof import('../db').getDb>,
  workspaceId: string
): Promise<DraftRecord[]> => {
  const rows = await db
    .select()
    .from(drafts)
    .where(eq(drafts.workspaceId, workspaceId))
    .orderBy(drafts.createdAt);
  return rows.map(parseDraftRow);
};

export const discardDraft = async (
  db: ReturnType<typeof import('../db').getDb>,
  id: string,
  workspaceId: string
): Promise<DraftRecord | null> => {
  const draft = await getDraftById(db, id, workspaceId);
  if (!draft) return null;
  await db.update(drafts).set({ status: 'discarded' }).where(eq(drafts.id, id));
  return { ...draft, status: 'discarded' };
};

/**
 * Executes a compensating rollback operation for a single log entry
 * Reverses a completed operation using its before snapshot
 */
const rollbackOperation = async (
  db: ReturnType<typeof import('../db').getDb>,
  entry: CompensatingLogEntry,
  workspaceId: string
): Promise<void> => {
  try {
    switch (entry.actionType) {
      case 'project.create':
        // Rollback: Delete the created project
        if (entry.before.project) {
          await deleteProject(db, entry.entityId, workspaceId);
        }
        break;

      case 'project.update':
        // Rollback: Restore project to before state
        if (entry.before.project) {
          await updateProject(db, entry.entityId, {
            name: entry.before.project.name,
            description: entry.before.project.description ?? undefined,
            icon: entry.before.project.icon ?? undefined,
            createdAt: entry.before.project.createdAt,
            updatedAt: entry.before.project.updatedAt,
          }, workspaceId);
        }
        break;

      case 'project.delete':
        // Rollback: Recreate the deleted project and its tasks
        if (entry.before.project) {
          await createProject(db, {
            id: entry.before.project.id,
            name: entry.before.project.name,
            description: entry.before.project.description ?? undefined,
            icon: entry.before.project.icon ?? undefined,
            createdAt: entry.before.project.createdAt,
            updatedAt: entry.before.project.updatedAt,
            workspaceId,
          });
          // Restore cascade-deleted tasks
          if (entry.before.tasks) {
            for (const task of entry.before.tasks) {
              await createTask(db, {
                id: task.id,
                projectId: task.projectId,
                title: task.title,
                description: task.description ?? undefined,
                status: task.status,
                priority: task.priority,
                wbs: task.wbs ?? undefined,
                startDate: task.startDate ?? undefined,
                dueDate: task.dueDate ?? undefined,
                completion: task.completion ?? undefined,
                assignee: task.assignee ?? undefined,
                isMilestone: task.isMilestone,
                predecessors: task.predecessors,
                createdAt: task.createdAt,
                updatedAt: task.updatedAt,
              }, workspaceId);
            }
          }
        }
        break;

      case 'task.create':
        // Rollback: Delete the created task
        if (entry.before.task) {
          await deleteTask(db, entry.entityId, workspaceId);
        }
        break;

      case 'task.update':
        // Rollback: Restore task to before state
        if (entry.before.task) {
          await updateTask(db, entry.entityId, {
            title: entry.before.task.title,
            description: entry.before.task.description ?? undefined,
            status: entry.before.task.status,
            priority: entry.before.task.priority,
            wbs: entry.before.task.wbs ?? undefined,
            startDate: entry.before.task.startDate ?? undefined,
            dueDate: entry.before.task.dueDate ?? undefined,
            completion: entry.before.task.completion ?? undefined,
            assignee: entry.before.task.assignee ?? undefined,
            isMilestone: entry.before.task.isMilestone,
            predecessors: entry.before.task.predecessors,
          }, workspaceId);
        }
        break;

      case 'task.delete':
        // Rollback: Recreate the deleted task
        if (entry.before.task) {
          await createTask(db, {
            id: entry.before.task.id,
            projectId: entry.before.task.projectId,
            title: entry.before.task.title,
            description: entry.before.task.description ?? undefined,
            status: entry.before.task.status,
            priority: entry.before.task.priority,
            wbs: entry.before.task.wbs ?? undefined,
            startDate: entry.before.task.startDate ?? undefined,
            dueDate: entry.before.task.dueDate ?? undefined,
            completion: entry.before.task.completion ?? undefined,
            assignee: entry.before.task.assignee ?? undefined,
            isMilestone: entry.before.task.isMilestone,
            predecessors: entry.before.task.predecessors,
            createdAt: entry.before.task.createdAt,
            updatedAt: entry.before.task.updatedAt,
          }, workspaceId);
        }
        break;
    }
  } catch (error) {
    // Log rollback failure but continue with other operations
    console.error('Compensating rollback operation failed', {
      entry,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error; // Re-throw to indicate rollback failure
  }
};

/**
 * Error severity classification
 */
type ErrorSeverity = 'FATAL' | 'RECOVERABLE';

/**
 * Classifies error severity based on error message and type
 * FATAL: Database errors, connection issues, workspace mismatch
 * RECOVERABLE: Constraint violations, validation errors, missing entities
 */
const classifyError = (error: Error | unknown): ErrorSeverity => {
  const errorMsg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  // FATAL errors - require full rollback
  if (errorMsg.includes('database') || errorMsg.includes('connection') || errorMsg.includes('timeout')) {
    return 'FATAL';
  }
  if (errorMsg.includes('workspace') && errorMsg.includes('not found')) {
    return 'FATAL';
  }
  if (errorMsg.includes('permission') || errorMsg.includes('unauthorized')) {
    return 'FATAL';
  }

  // RECOVERABLE errors - allow partial success
  // Constraint violations, validation errors, missing entities are recoverable
  return 'RECOVERABLE';
};

/**
 * Result of constraint validation
 */
type ConflictValidationResult = {
  valid: boolean;
  conflicts: ConflictInfo[];
  canAutoFix: boolean;
};

/**
 * Fetches current state of tasks from database
 */
const fetchCurrentTasks = async (
  db: ReturnType<typeof import('../db').getDb>,
  taskIds: string[],
  workspaceId: string
): Promise<TaskRecord[]> => {
  if (taskIds.length === 0) return [];

  const rows = await db
    .select()
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .where(and(
      eq(projects.workspaceId, workspaceId),
      inArray(tasks.id, taskIds)
    ));

  return rows.map(row => toTaskRecord(row.tasks));
};

/**
 * Checks if a task's predecessor constraints are satisfied
 * @returns Object indicating satisfaction status, message, and proposed fix if violated
 */
const checkPredecessorConstraints = (
  task: TaskRecord,
  taskMap: Map<string, TaskRecord>
): { satisfied: boolean; message?: string; fix?: TaskRecord } => {
  if (!task.predecessors || task.predecessors.length === 0) {
    return { satisfied: true };
  }

  // Check for circular references to prevent infinite loops
  const visited = new Set<string>();
  const hasCircularRef = (taskId: string, path: Set<string>): boolean => {
    if (path.has(taskId)) return true; // Found a cycle
    if (visited.has(taskId)) return false; // Already checked this branch

    visited.add(taskId);
    const newpath = new Set(path).add(taskId);

    const currentTask = taskMap.get(taskId);
    if (currentTask?.predecessors) {
      for (const predId of currentTask.predecessors) {
        if (hasCircularRef(predId, newpath)) return true;
      }
    }
    return false;
  };

  if (hasCircularRef(task.id, new Set())) {
    return {
      satisfied: false,
      message: `Task "${task.title}" has circular predecessor dependencies`,
    };
  }

  const taskStart = task.startDate ?? task.createdAt;
  let maxPredecessorEnd = taskStart;
  const violatingPredecessors: Array<{ id: string; title: string; endDate: number }> = [];

  for (const predId of task.predecessors) {
    const pred = taskMap.get(predId);
    if (!pred) continue; // Predecessor not found - will be caught separately

    const predEnd = pred.dueDate ?? (pred.startDate ?? pred.createdAt);
    if (predEnd > taskStart) {
      violatingPredecessors.push({
        id: pred.id,
        title: pred.title,
        endDate: predEnd,
      });
      maxPredecessorEnd = Math.max(maxPredecessorEnd, predEnd);
    }
  }

  if (violatingPredecessors.length > 0) {
    // Calculate proposed fix
    const duration = (task.dueDate ?? taskStart) - taskStart;
    const fixedStart = maxPredecessorEnd;
    const fixedEnd = Math.max(fixedStart + 86_400_000, fixedStart + duration);

    return {
      satisfied: false,
      message: `Task "${task.title}" start date is before predecessor end dates: ${violatingPredecessors.map(p => `${p.title} (${new Date(p.endDate).toISOString().split('T')[0]})`).join(', ')}`,
      fix: {
        ...task,
        startDate: fixedStart,
        dueDate: fixedEnd,
      },
    };
  }

  return { satisfied: true };
};

/**
 * Checks if a task's date order is valid (end > start)
 * @returns Object indicating satisfaction status, message, and proposed fix if violated
 */
const checkDateOrder = (
  task: TaskRecord
): { satisfied: boolean; message?: string; fix?: TaskRecord } => {
  const start = task.startDate ?? task.createdAt;
  const end = task.dueDate ?? start;

  if (end <= start) {
    return {
      satisfied: false,
      message: `Task "${task.title}" due date is before or equal to start date`,
      fix: {
        ...task,
        startDate: start,
        dueDate: start + 86_400_000, // Add 1 day
      },
    };
  }

  return { satisfied: true };
};

/**
 * Checks if a task was concurrently modified after draft creation
 * @returns Object indicating satisfaction status, message, and details if violated
 */
const checkConcurrentModifications = (
  action: DraftAction,
  current: TaskRecord
): { satisfied: boolean; message?: string; details?: Record<string, unknown> } => {
  const actionUpdatedAt = (action.after as Record<string, unknown>)?.updatedAt as number | undefined;

  // Check if the action was planned based on stale data
  if (actionUpdatedAt && current.updatedAt > actionUpdatedAt) {
    return {
      satisfied: false,
      message: `Task was modified after draft was created`,
      details: {
        draftBasedOn: new Date(actionUpdatedAt).toISOString(),
        currentVersion: new Date(current.updatedAt).toISOString(),
      },
    };
  }

  return { satisfied: true };
};

/**
 * Validates draft constraints before applying
 * Detects conflicts and determines if they can be auto-fixed
 */
const validateDraftConstraints = async (
  db: ReturnType<typeof import('../db').getDb>,
  draft: DraftRecord,
  workspaceId: string
): Promise<ConflictValidationResult> => {
  const conflicts: ConflictInfo[] = [];

  // Collect all task IDs referenced in the draft
  const affectedTaskIds = draft.actions
    .filter(a => a.entityType === 'task')
    .map(a => a.entityId)
    .filter((id): id is string => Boolean(id));

  // Fetch current state of affected tasks
  const currentTasks = await fetchCurrentTasks(db, affectedTaskIds, workspaceId);
  const currentTaskMap = new Map(currentTasks.map(t => [t.id, t]));

  // Check each task action for conflicts
  for (const action of draft.actions) {
    if (action.entityType === 'task') {
      const proposedAfter = action.after as TaskRecord | undefined;

      // Skip actions without 'after' data
      if (!proposedAfter) {
        continue;
      }

      if (action.action === 'update' && action.entityId) {
        const current = currentTaskMap.get(action.entityId);

        if (!current) {
          conflicts.push({
            type: 'TASK_NOT_FOUND',
            entityId: action.entityId,
            message: `Task ${action.entityId} no longer exists`,
            canAutoFix: false,
          });
          continue;
        }

        // Build the proposed task state (merge current with changes)
        const proposedTask: TaskRecord = {
          ...current,
          ...proposedAfter,
          id: action.entityId, // Ensure ID is preserved
          projectId: current.projectId, // Preserve project association
        };

        // Check predecessor constraints
        const predecessorCheck = checkPredecessorConstraints(proposedTask, currentTaskMap);
        if (!predecessorCheck.satisfied) {
          conflicts.push({
            type: 'PREDECESSOR_CONFLICT',
            entityId: action.entityId,
            message: predecessorCheck.message ?? 'Predecessor constraint violation',
            canAutoFix: !!predecessorCheck.fix, // Can auto-fix only if fix is provided
            ...(predecessorCheck.fix && { proposedFix: predecessorCheck.fix }),
          });
        }

        // Check date order constraints
        const dateCheck = checkDateOrder(proposedTask);
        if (!dateCheck.satisfied && dateCheck.fix) {
          conflicts.push({
            type: 'DATE_ORDER_CONFLICT',
            entityId: action.entityId,
            message: dateCheck.message ?? 'Date order constraint violation',
            canAutoFix: true,
            proposedFix: dateCheck.fix,
          });
        }

        // Check for concurrent modifications
        const concurrentCheck = checkConcurrentModifications(action, current);
        if (!concurrentCheck.satisfied) {
          conflicts.push({
            type: 'CONCURRENT_MODIFICATION',
            entityId: action.entityId,
            message: concurrentCheck.message!,
            canAutoFix: false,
            details: concurrentCheck.details,
          });
        }
      } else if (action.action === 'create') {
        // For new tasks, only check date order (predecessors will be checked when applied)
        const dateCheck = checkDateOrder(proposedAfter as TaskRecord);
        if (!dateCheck.satisfied) {
          conflicts.push({
            type: 'DATE_ORDER_CONFLICT',
            entityId: proposedAfter.id ?? 'unknown',
            message: dateCheck.message!,
            canAutoFix: true,
            proposedFix: dateCheck.fix,
          });
        }
      }
    }
  }

  const canAutoFix = conflicts.length > 0 && conflicts.every(c => c.canAutoFix);

  return {
    valid: conflicts.length === 0,
    conflicts,
    canAutoFix,
  };
};

/**
 * Applies auto-fixes to a draft by updating conflicting actions
 * Returns the updated draft record
 */
const applyAutoFixes = async (
  db: ReturnType<typeof import('../db').getDb>,
  draft: DraftRecord,
  conflicts: ConflictInfo[]
): Promise<DraftRecord> => {
  const fixedActions = [...draft.actions];

  for (const conflict of conflicts) {
    if (!conflict.proposedFix) continue;

    const actionIndex = fixedActions.findIndex(
      a => a.entityId === conflict.entityId && a.entityType === 'task'
    );

    if (actionIndex >= 0) {
      const existingAction = fixedActions[actionIndex];
      if (existingAction) {
        // Update the action with the fixed task data
        fixedActions[actionIndex] = {
          ...existingAction,
          after: conflict.proposedFix,
          warnings: [
            ...(existingAction.warnings ?? []),
            `Auto-fixed: ${conflict.message}`,
          ],
        };
      }
    }
  }

  // Update the draft in database
  await db.update(drafts)
    .set({ actions: fixedActions })
    .where(eq(drafts.id, draft.id));

  return {
    ...draft,
    actions: fixedActions,
  };
};

/**
 * Applies a draft with partial success support
 * - FATAL errors trigger full rollback (all-or-nothing)
 * - RECOVERABLE errors are logged but don't stop execution
 */
export const applyDraft = async (
  db: ReturnType<typeof import('../db').getDb>,
  id: string,
  actor: DraftRecord['createdBy'],
  workspaceId: string,
  options?: { autoFix?: boolean; force?: boolean }
): Promise<{ draft: DraftRecord; results: DraftAction[]; conflicts?: ConflictInfo[] }> => {
  const draft = await getDraftById(db, id, workspaceId);
  if (!draft) {
    console.error('[Draft Apply] Draft not found', { id, workspaceId });
    throw new Error('Draft not found.');
  }
  if (draft.status !== 'pending') {
    console.log('[Draft Apply] Draft already processed', { id, status: draft.status });
    return { draft, results: draft.actions };
  }

  console.log('[Draft Apply] Starting draft application', {
    draftId: id,
    workspaceId,
    actionCount: draft.actions.length,
    actions: draft.actions.map(a => ({ type: `${a.entityType}.${a.action}`, id: a.entityId })),
    options,
  });

  // Use mutable variable for draft to allow auto-fix updates
  let currentDraft = draft;

  // Validate constraints before applying (unless force is true)
  if (!options?.force) {
    const validation = await validateDraftConstraints(db, currentDraft, workspaceId);

    if (!validation.valid) {
      console.log('[Draft Apply] Constraint validation failed', {
        draftId: id,
        conflictCount: validation.conflicts.length,
        canAutoFix: validation.canAutoFix,
      });

      // Return conflicts if not auto-fixing
      if (options?.autoFix === false || !validation.canAutoFix) {
        return {
          draft: {
            ...currentDraft,
            status: 'failed',
          },
          results: currentDraft.actions,
          conflicts: validation.conflicts,
        };
      }

      // Auto-fix if possible
      const shouldAutoFix = options?.autoFix ?? true;  // Default to true
      if (validation.canAutoFix && shouldAutoFix) {
        console.log('[Draft Apply] Auto-fixing conflicts', {
          draftId: id,
          conflicts: validation.conflicts.map(c => ({ type: c.type, entityId: c.entityId })),
        });

        currentDraft = await applyAutoFixes(db, currentDraft, validation.conflicts);
      }
    } else {
      console.log('[Draft Apply] Constraint validation passed', { draftId: id });
    }
  } else {
    console.log('[Draft Apply] Skipping validation (force mode)', { draftId: id });
  }

  const results: DraftAction[] = [];
  const draftProjectId = currentDraft.projectId ?? null;

  // Action execution statistics
  const stats = {
    success: 0,
    warning: 0,
    skipped: 0,
    failed: 0,
  };

  // Compensating transaction log: tracks operations for potential rollback
  const transactionLog: CompensatingLogEntry[] = [];
  let sequence = 0;
  let fatalError: Error | null = null;

  try {
    for (const action of currentDraft.actions) {
      if (action.entityType === 'project') {
        if (action.action === 'create' && action.after) {
          console.log('[Draft Apply] Processing project.create', {
            projectId: action.after.id,
            projectName: action.after.name,
            workspaceId,
          });

          try {
            const beforeSnapshot = await getProjectById(db, (action.after.id as string) || '', workspaceId);
            const created = await createProject(db, {
              id: (action.after.id as string) || undefined,  // Use || to handle empty string
              name: (action.after.name as string) ?? 'Untitled Project',
              description: (action.after.description as string) ?? undefined,
              icon: (action.after.icon as string) ?? undefined,
              createdAt: (action.after.createdAt as number) ?? undefined,
              updatedAt: (action.after.updatedAt as number) ?? undefined,
              workspaceId,
            });

            console.log('[Draft Apply] Project created successfully', {
              projectId: created.id,
              projectName: created.name,
            });

            results.push({
              ...action,
              entityId: created.id,
              after: created,
              status: action.warnings?.length ? 'warning' : 'success',
            });
            stats.success++;

            // Log operation for potential rollback
            const logIndex = transactionLog.push({
              sequence: sequence++,
              actionType: 'project.create',
              entityId: created.id,
              before: { project: beforeSnapshot ?? undefined },
              auditRecorded: false,
              timestamp: now(),
            }) - 1;

            try {
              await recordAudit(db, {
                workspaceId,
                entityType: 'project',
                entityId: created.id,
                action: 'create',
                before: null,
                after: created,
                actor,
                reason: currentDraft.reason ?? null,
                projectId: created.id,
                taskId: null,
                draftId: currentDraft.id,
              });
              transactionLog[logIndex]!.auditRecorded = true;
            } catch (auditError) {
              console.error('Audit logging failed', { error: auditError });
            }
          } catch (createError) {
            const severity = classifyError(createError);
            console.error('[Draft Apply] Project creation failed', {
              error: createError instanceof Error ? createError.message : String(createError),
              severity,
              action: action.after,
            });

            if (severity === 'FATAL') {
              fatalError = createError instanceof Error ? createError : new Error(String(createError));
              throw fatalError; // Trigger full rollback
            }

            // RECOVERABLE error - log and continue
            results.push({
              ...action,
              status: 'failed',
              error: createError instanceof Error ? createError.message : String(createError),
            });
            stats.failed++;
          }

        } else if (action.action === 'update' && action.entityId) {
          try {
            const before = await getProjectById(db, action.entityId, workspaceId);
            const updated = await updateProject(db, action.entityId, {
              name: (action.after?.name as string) ?? undefined,
              description: (action.after?.description as string) ?? undefined,
              icon: (action.after?.icon as string) ?? undefined,
              createdAt: (action.after?.createdAt as number) ?? undefined,
              updatedAt: (action.after?.updatedAt as number) ?? undefined,
            }, workspaceId);

            if (updated) {
              results.push({
                ...action,
                before: before ?? undefined,
                after: updated,
                status: action.warnings?.length ? 'warning' : 'success',
              });
              stats.success++;

              // Log operation for potential rollback
              const logIndex = transactionLog.push({
                sequence: sequence++,
                actionType: 'project.update',
                entityId: updated.id,
                before: { project: before ?? undefined },
                auditRecorded: false,
                timestamp: now(),
              }) - 1;

              try {
                await recordAudit(db, {
                  workspaceId,
                  entityType: 'project',
                  entityId: updated.id,
                  action: 'update',
                  before: before ?? null,
                  after: updated,
                  actor,
                  reason: draft.reason ?? null,
                  projectId: updated.id,
                  taskId: null,
                  draftId: draft.id,
                });
                transactionLog[logIndex]!.auditRecorded = true;
              } catch (auditError) {
                console.error('Audit logging failed', { error: auditError });
              }
            } else {
              // Not found - treat as skipped
              results.push({
                ...action,
                status: 'skipped',
                error: 'Project not found',
              });
              stats.skipped++;
            }
          } catch (updateError) {
            const severity = classifyError(updateError);
            if (severity === 'FATAL') {
              fatalError = updateError instanceof Error ? updateError : new Error(String(updateError));
              throw fatalError;
            }
            results.push({
              ...action,
              status: 'failed',
              error: updateError instanceof Error ? updateError.message : String(updateError),
            });
            stats.failed++;
          }

        } else if (action.action === 'delete' && action.entityId) {
          try {
            const before = await getProjectById(db, action.entityId, workspaceId);
            const taskRows = await db.select().from(tasks).where(eq(tasks.projectId, action.entityId));
            const tasksBefore = taskRows.map(toTaskRecord);
            const deleted = await deleteProject(db, action.entityId, workspaceId);

            results.push({
              ...action,
              before: before ?? undefined,
              after: null,
              status: 'success',
            });
            stats.success++;

            if (deleted.project) {
              // Log operation for potential rollback (with cascade tasks)
              const logIndex = transactionLog.push({
                sequence: sequence++,
                actionType: 'project.delete',
                entityId: deleted.project.id,
                before: {
                  project: before ?? deleted.project,
                  tasks: tasksBefore,
                },
                auditRecorded: false,
                timestamp: now(),
              }) - 1;

              try {
                await recordAudit(db, {
                  workspaceId,
                  entityType: 'project',
                  entityId: deleted.project.id,
                  action: 'delete',
                  before: { project: before ?? deleted.project, tasks: tasksBefore },
                  after: null,
                  actor,
                  reason: draft.reason ?? null,
                  projectId: deleted.project.id,
                  taskId: null,
                  draftId: draft.id,
                });
                transactionLog[logIndex]!.auditRecorded = true;
              } catch (auditError) {
                console.error('Audit logging failed', { error: auditError });
              }
            }
          } catch (deleteError) {
            const severity = classifyError(deleteError);
            if (severity === 'FATAL') {
              fatalError = deleteError instanceof Error ? deleteError : new Error(String(deleteError));
              throw fatalError;
            }
            results.push({
              ...action,
              status: 'failed',
              error: deleteError instanceof Error ? deleteError.message : String(deleteError),
            });
            stats.failed++;
          }
        }
        continue;
      }

      if (action.entityType === 'task') {
        if (action.action === 'create' && action.after) {
          try {
            const warnings: string[] = [];
            const actionProjectId = (action.after.projectId as string | undefined) ?? undefined;
            let resolvedProjectId = actionProjectId ?? draftProjectId ?? '';
            if (draftProjectId && actionProjectId && actionProjectId !== draftProjectId) {
              warnings.push('Task create projectId did not match the draft project. Using the draft project instead.');
              resolvedProjectId = draftProjectId;
            }
            if (!resolvedProjectId) {
              throw new Error('Missing projectId for task creation.');
            }

            const beforeSnapshot = await getTaskById(db, (action.after.id as string) || '', workspaceId);
            const created = await createTask(db, {
              id: (action.after.id as string) || undefined,  // Use || to handle empty string
              projectId: resolvedProjectId,
              title: (action.after.title as string) ?? 'Untitled Task',
              description: (action.after.description as string) ?? undefined,
              status: toTaskStatus(action.after.status, 'TODO'),
              priority: toPriority(action.after.priority, 'MEDIUM'),
              wbs: (action.after.wbs as string) ?? undefined,
              startDate: (action.after.startDate as number) ?? undefined,
              dueDate: (action.after.dueDate as number) ?? undefined,
              completion: (action.after.completion as number) ?? undefined,
              assignee: (action.after.assignee as string) ?? undefined,
              isMilestone: (action.after.isMilestone as boolean) ?? undefined,
              predecessors: (action.after.predecessors as string[]) ?? undefined,
              createdAt: (action.after.createdAt as number) ?? undefined,
              updatedAt: (action.after.updatedAt as number) ?? undefined,
            }, workspaceId);

            if (!created) {
              throw new Error(`Invalid project for task creation: ${resolvedProjectId}.`);
            }

            const hasWarnings = warnings.length > 0 || (action.warnings?.length ?? 0) > 0;
            results.push({
              ...action,
              entityId: created.id,
              after: created,
              warnings: warnings.length ? warnings : action.warnings,
              status: hasWarnings ? 'warning' : 'success',
            });
            stats.success++;

            // Log operation for potential rollback
            const logIndex = transactionLog.push({
              sequence: sequence++,
              actionType: 'task.create',
              entityId: created.id,
              before: { task: beforeSnapshot ?? undefined },
              auditRecorded: false,
              timestamp: now(),
            }) - 1;

            try {
              await recordAudit(db, {
                workspaceId,
                entityType: 'task',
                entityId: created.id,
                action: 'create',
                before: null,
                after: created,
                actor,
                reason: currentDraft.reason ?? null,
                projectId: created.projectId,
                taskId: created.id,
                draftId: currentDraft.id,
              });
              transactionLog[logIndex]!.auditRecorded = true;
            } catch (auditError) {
              console.error('Audit logging failed', { error: auditError });
            }
          } catch (createError) {
            const severity = classifyError(createError);
            if (severity === 'FATAL') {
              fatalError = createError instanceof Error ? createError : new Error(String(createError));
              throw fatalError;
            }
            results.push({
              ...action,
              status: 'failed',
              error: createError instanceof Error ? createError.message : String(createError),
            });
            stats.failed++;
          }

        } else if (action.action === 'update' && action.entityId) {
          try {
            const before = await getTaskById(db, action.entityId, workspaceId);

            if (!before) {
              // Task not found - treat as skipped
              results.push({
                ...action,
                status: 'skipped',
                error: `Task not found: ${action.entityId}. The task may have been deleted or the draft is outdated.`,
              });
              stats.skipped++;
              continue;
            }
            if (draftProjectId && before.projectId !== draftProjectId) {
              results.push({
                ...action,
                before,
                after: null,
                status: 'skipped',
                warnings: ['Task update skipped because it targets a different project than the active draft project.'],
              });
              stats.skipped++;
              continue;
            }

            if (!action.after) {
              throw new Error(`Invalid draft: No update data provided for task ${action.entityId}. This draft may be corrupted.`);
            }

            const updated = await updateTask(db, action.entityId, {
              title: (action.after?.title as string) ?? undefined,
              description: (action.after?.description as string) ?? undefined,
              status: toOptionalTaskStatus(action.after?.status),
              priority: toOptionalPriority(action.after?.priority),
              wbs: (action.after?.wbs as string) ?? undefined,
              startDate: (action.after?.startDate as number) ?? undefined,
              dueDate: (action.after?.dueDate as number) ?? undefined,
              completion: (action.after?.completion as number) ?? undefined,
              assignee: (action.after?.assignee as string) ?? undefined,
              isMilestone: (action.after?.isMilestone as boolean) ?? undefined,
              predecessors: (action.after?.predecessors as string[]) ?? undefined,
            }, workspaceId);

            if (updated) {
              const hasWarnings = (action.warnings?.length ?? 0) > 0;
              results.push({
                ...action,
                before: before ?? undefined,
                after: updated,
                status: hasWarnings ? 'warning' : 'success',
              });
              stats.success++;

              // Log operation for potential rollback
              const logIndex = transactionLog.push({
                sequence: sequence++,
                actionType: 'task.update',
                entityId: updated.id,
                before: { task: before ?? undefined },
                auditRecorded: false,
                timestamp: now(),
              }) - 1;

              try {
                await recordAudit(db, {
                  workspaceId,
                  entityType: 'task',
                  entityId: updated.id,
                  action: 'update',
                  before: before ?? null,
                  after: updated,
                  actor,
                  reason: draft.reason ?? null,
                  projectId: updated.projectId,
                  taskId: updated.id,
                  draftId: draft.id,
                });
                transactionLog[logIndex]!.auditRecorded = true;
              } catch (auditError) {
                console.error('Audit logging failed', { error: auditError });
              }
            } else {
              // Update returned null - treat as skipped
              results.push({
                ...action,
                status: 'skipped',
                error: 'Task not found or update failed',
              });
              stats.skipped++;
            }
          } catch (updateError) {
            const severity = classifyError(updateError);
            if (severity === 'FATAL') {
              fatalError = updateError instanceof Error ? updateError : new Error(String(updateError));
              throw fatalError;
            }
            results.push({
              ...action,
              status: 'failed',
              error: updateError instanceof Error ? updateError.message : String(updateError),
            });
            stats.failed++;
          }

        } else if (action.action === 'delete' && action.entityId) {
          try {
            const before = await getTaskById(db, action.entityId, workspaceId);
            if (before && draftProjectId && before.projectId !== draftProjectId) {
              results.push({
                ...action,
                before,
                after: null,
                status: 'skipped',
                warnings: ['Task delete skipped because it targets a different project than the active draft project.'],
              });
              stats.skipped++;
              continue;
            }

            const deleted = await deleteTask(db, action.entityId, workspaceId);

            results.push({
              ...action,
              before: before ?? undefined,
              after: null,
              status: 'success',
            });
            stats.success++;

            if (deleted) {
              // Log operation for potential rollback
              const logIndex = transactionLog.push({
                sequence: sequence++,
                actionType: 'task.delete',
                entityId: deleted.id,
                before: { task: before ?? undefined },
                auditRecorded: false,
                timestamp: now(),
              }) - 1;

              try {
                await recordAudit(db, {
                  workspaceId,
                  entityType: 'task',
                  entityId: deleted.id,
                  action: 'delete',
                  before: before ?? null,
                  after: null,
                  actor,
                  reason: draft.reason ?? null,
                  projectId: deleted.projectId,
                  taskId: deleted.id,
                  draftId: draft.id,
                });
                transactionLog[logIndex]!.auditRecorded = true;
              } catch (auditError) {
                console.error('Audit logging failed', { error: auditError });
              }
            }
          } catch (deleteError) {
            const severity = classifyError(deleteError);
            if (severity === 'FATAL') {
              fatalError = deleteError instanceof Error ? deleteError : new Error(String(deleteError));
              throw fatalError;
            }
            results.push({
              ...action,
              status: 'failed',
              error: deleteError instanceof Error ? deleteError.message : String(deleteError),
            });
            stats.failed++;
          }
        }
      }
    }

    // Determine draft status based on execution statistics
    let finalStatus: DraftStatus = 'applied';
    if (stats.failed > 0 && stats.success === 0) {
      // All operations failed
      finalStatus = 'failed';
    } else if (stats.skipped > 0 && stats.success === 0 && stats.failed === 0) {
      // All operations were skipped (e.g., tasks not found)
      finalStatus = 'failed';
    } else if (stats.failed > 0 || stats.warning > 0 || stats.skipped > 0) {
      // Partial success with failures, warnings, or skipped operations
      finalStatus = 'partial';
    }

    // Update draft with final status and summary statistics
    // Include summary for both 'partial' and 'failed' statuses to help users understand what happened
    const updatedDraft: DraftRecord = {
      ...currentDraft,
      status: finalStatus,
      actions: results, // Update actions with execution status
      summary: (finalStatus === 'partial' || finalStatus === 'failed') ? { ...stats } : undefined,
    };

    await db.update(drafts).set({
      status: finalStatus,
      actions: results,
    }).where(eq(drafts.id, currentDraft.id));

    console.log('[Draft Apply] Completed with status', {
      draftId: currentDraft.id,
      finalStatus,
      stats,
    });

    return { draft: updatedDraft, results };

  } catch (error) {
    // Only FATAL errors reach here - RECOVERABLE errors are handled inline
    console.error('[Draft Apply] Fatal error, initiating compensating rollback', {
      draftId: currentDraft.id,
      operationsCompleted: transactionLog.length,
      stats,
      error: error instanceof Error ? error.message : String(error),
    });

    // Rollback in reverse order (LIFO)
    const rollbackErrors: Array<{ entry: CompensatingLogEntry; error: string }> = [];
    for (let i = transactionLog.length - 1; i >= 0; i--) {
      const entry = transactionLog[i]!;
      try {
        await rollbackOperation(db, entry, workspaceId);
      } catch (rollbackError) {
        rollbackErrors.push({
          entry,
          error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
        });
      }
    }

    // Mark draft as failed with details
    await db.update(drafts).set({
      status: 'failed',
      actions: results,
    }).where(eq(drafts.id, currentDraft.id));

    // Construct comprehensive error message
    const errorMessage = [
      `Fatal error during draft application after ${transactionLog.length} successful operations.`,
      rollbackErrors.length > 0
        ? `Rollback completed with ${rollbackErrors.length} errors.`
        : 'Rollback completed successfully.',
      `Error: ${error instanceof Error ? error.message : String(error)}`,
      rollbackErrors.length > 0 ? 'Rollback errors: ' + rollbackErrors.map(e => `[${e.entry.actionType} on ${e.entry.entityId}: ${e.error}]`).join(', ') : '',
    ].filter(Boolean).join('. ');

    console.error('[Draft Apply] Compensating rollback completed', {
      draftId: currentDraft.id,
      operationsAttempted: transactionLog.length,
      rollbackFailures: rollbackErrors.length,
      rollbackErrors,
    });

    throw new Error(errorMessage);
  }
};

export const refreshDraftActions = async (
  db: ReturnType<typeof import('../db').getDb>,
  id: string,
  workspaceId: string
): Promise<DraftRecord | null> => {
  const draft = await getDraftById(db, id, workspaceId);
  if (!draft) return null;
  const planned = await planActions(db, draft.actions, workspaceId);
  const next = { ...draft, actions: planned.actions };
  await db.update(drafts).set({ actions: next.actions }).where(eq(drafts.id, id));
  return next;
};

/**
 * Bulk delete drafts by status and optional age criteria
 * @param db - Database instance
 * @param workspaceId - Workspace ID for scoping
 * @param options - Cleanup options
 * @returns Number of drafts deleted
 */
export const cleanupDrafts = async (
  db: ReturnType<typeof import('../db').getDb>,
  workspaceId: string,
  options: {
    /** Draft statuses to clean up (default: ['failed', 'discarded']) */
    statuses?: Array<'failed' | 'discarded' | 'pending'>;
    /** Only delete drafts older than this many milliseconds (default: 7 days) */
    olderThanMs?: number;
    /** Maximum number of drafts to delete (default: 100, for safety) */
    limit?: number;
  } = {}
): Promise<{ deletedCount: number; details: Array<{ id: string; status: string; createdAt: number }> }> => {
  const {
    statuses = ['failed', 'discarded'],
    olderThanMs = 7 * 24 * 60 * 60 * 1000, // 7 days
    limit = 100,
  } = options;

  const cutoffTime = now() - olderThanMs;

  // Build WHERE clause
  const { and, inArray, lt } = await import('drizzle-orm');
  const conditions = [
    eq(drafts.workspaceId, workspaceId),
    inArray(drafts.status, statuses),
    lt(drafts.createdAt, cutoffTime),
  ];

  const whereClause = and(...conditions);

  // Fetch drafts to be deleted (for logging/details)
  const draftsToDelete = await db
    .select()
    .from(drafts)
    .where(whereClause)
    .limit(limit);

  if (draftsToDelete.length === 0) {
    return { deletedCount: 0, details: [] };
  }

  // Delete drafts
  await db.delete(drafts).where(
    and(
      inArray(
        drafts.id,
        draftsToDelete.map(d => d.id)
      )
    )
  );

  return {
    deletedCount: draftsToDelete.length,
    details: draftsToDelete.map(d => ({
      id: d.id,
      status: d.status,
      createdAt: d.createdAt,
    })),
  };
};
