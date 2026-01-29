import { eq } from 'drizzle-orm';
import { drafts, projects, tasks } from '../db/schema';
import { toProjectRecord, toTaskRecord } from './serializers';
import { applyTaskConstraints } from './constraintService';
import { recordAudit } from './auditService';
import { createProject, updateProject, deleteProject, getProjectById } from './projectService';
import { createTask, updateTask, deleteTask, getTaskById } from './taskService';
import { generateId, now } from './utils';
import type { DraftAction, DraftRecord, PlanResult, TaskRecord, ProjectRecord, TaskStatus, Priority } from './types';

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
  actions: any[];
  createdAt: number;
  createdBy: string;
  reason: string | null;
}): DraftRecord => ({
  id: row.id,
  workspaceId: row.workspaceId,
  projectId: row.projectId,
  status: row.status as DraftRecord['status'],
  actions: row.actions as DraftAction[],
  createdAt: row.createdAt,
  createdBy: row.createdBy as DraftRecord['createdBy'],
  reason: row.reason,
});

const normalizeTaskInput = (
  input: Record<string, unknown>,
  fallback: TaskRecord | null,
  projectIdOverride?: string
): TaskRecord => {
  const timestamp = now();
  const projectId = (input.projectId as string | undefined) ?? projectIdOverride ?? fallback?.projectId ?? '';
  const status = toTaskStatus(input.status, fallback?.status ?? 'TODO');
  const priority = toPriority(input.priority, fallback?.priority ?? 'MEDIUM');
  const createdAt = (input.createdAt as number | undefined) ?? fallback?.createdAt ?? timestamp;
  const updatedAt = (input.updatedAt as number | undefined) ?? timestamp;
  const startDate = (input.startDate as number | undefined) ?? fallback?.startDate ?? createdAt;
  const dueDate = (input.dueDate as number | undefined) ?? fallback?.dueDate ?? null;
  const completion = (input.completion as number | undefined) ?? fallback?.completion ?? 0;
  const predecessors = (input.predecessors as string[] | undefined) ?? fallback?.predecessors ?? [];

  return {
    id: (input.id as string | undefined) ?? fallback?.id ?? generateId(),
    projectId,
    title: (input.title as string | undefined) ?? fallback?.title ?? 'Untitled Task',
    description: (input.description as string | undefined) ?? fallback?.description ?? null,
    status: status as TaskRecord['status'],
    priority: priority as TaskRecord['priority'],
    wbs: (input.wbs as string | undefined) ?? fallback?.wbs ?? null,
    createdAt,
    startDate,
    dueDate,
    completion,
    assignee: (input.assignee as string | undefined) ?? fallback?.assignee ?? null,
    isMilestone: (input.isMilestone as boolean | undefined) ?? fallback?.isMilestone ?? false,
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
  const createdAt = (input.createdAt as number | undefined) ?? fallback?.createdAt ?? timestamp;
  const updatedAt = (input.updatedAt as number | undefined) ?? timestamp;
  return {
    id: (input.id as string | undefined) ?? fallback?.id ?? generateId(),
    workspaceId: resolvedWorkspaceId,
    name: (input.name as string | undefined) ?? fallback?.name ?? 'Untitled Project',
    description: (input.description as string | undefined) ?? fallback?.description ?? null,
    icon: (input.icon as string | undefined) ?? fallback?.icon ?? null,
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
  const { projectState, workspaceId, warnings } = context;
  const existing = projectState.find((item) => item.id === action.entityId);

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
  const { projectState, taskState, warnings } = context;
  const existing = projectState.find((item) => item.id === action.entityId);

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

  return {
    projectState: projectState.filter((item) => item.id !== existing.id),
    taskState: taskState.filter((task) => task.projectId !== existing.id),
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
  const { taskState, warnings } = context;
  const existing = taskState.find((item) => item.id === action.entityId);

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
  if (afterObj.startDate !== undefined && afterObj.startDate !== existing.startDate) {
    explicitFields.push('startDate');
  }
  if (afterObj.dueDate !== undefined && afterObj.dueDate !== existing.dueDate) {
    explicitFields.push('dueDate');
  }
  if (afterObj.title !== undefined && afterObj.title !== existing.title) {
    explicitFields.push('title');
  }
  if (afterObj.status !== undefined && afterObj.status !== existing.status) {
    explicitFields.push('status');
  }
  if (afterObj.priority !== undefined && afterObj.priority !== existing.priority) {
    explicitFields.push('priority');
  }
  if (afterObj.assignee !== undefined && afterObj.assignee !== existing.assignee) {
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
  const { taskState } = context;
  const existing = taskState.find((item) => item.id === action.entityId);

  if (!existing) {
    const warningMessage = 'Task not found.';
    context.warnings.push(warningMessage);

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

  // Extract IDs that we need to fetch using Sets for O(1) lookups
  const projectIdsToFetch = new Set<string>();
  const taskIdsToFetch = new Set<string>();
  const projectIdsReferenced = new Set<string>();
  const taskPredecessorIds = new Set<string>();

  // Single pass to collect all IDs we need
  for (const action of actions) {
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

  // Initialize handler context
  const context: ActionHandlerContext = {
    projectState,
    taskState,
    warnings,
    workspaceId,
    planned,
  };

  // Process each action using the strategy pattern
  for (const action of actions) {
    const handlerKey = `${action.entityType}.${action.action}`;
    const handler = ACTION_HANDLERS[handlerKey];

    if (!handler) {
      // Unknown action type - skip with a warning
      warnings.push(`Unknown action type: ${handlerKey}`);
      continue;
    }

    const result = await handler(action, context);

    // Update context with result
    if (result.projectState !== undefined) {
      context.projectState = result.projectState;
    }
    if (result.taskState !== undefined) {
      context.taskState = result.taskState;
    }

    // Add the planned action
    context.planned.push(result.plannedAction);

    // Stop processing this action if the handler indicates to continue
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
 * Applies a draft with compensating transaction support
 * If any operation fails, previously completed operations are rolled back
 */
export const applyDraft = async (
  db: ReturnType<typeof import('../db').getDb>,
  id: string,
  actor: DraftRecord['createdBy'],
  workspaceId: string
): Promise<{ draft: DraftRecord; results: DraftAction[] }> => {
  const draft = await getDraftById(db, id, workspaceId);
  if (!draft) {
    throw new Error('Draft not found.');
  }
  if (draft.status !== 'pending') {
    return { draft, results: draft.actions };
  }

  const results: DraftAction[] = [];
  const draftProjectId = draft.projectId ?? null;

  // Compensating transaction log: tracks operations for potential rollback
  const transactionLog: CompensatingLogEntry[] = [];
  let sequence = 0;

  try {
    for (const action of draft.actions) {
      if (action.entityType === 'project') {
        if (action.action === 'create' && action.after) {
          const beforeSnapshot = await getProjectById(db, (action.after.id as string) ?? '', workspaceId);
          const created = await createProject(db, {
            id: (action.after.id as string) ?? undefined,
            name: (action.after.name as string) ?? 'Untitled Project',
            description: (action.after.description as string) ?? undefined,
            icon: (action.after.icon as string) ?? undefined,
            createdAt: (action.after.createdAt as number) ?? undefined,
            updatedAt: (action.after.updatedAt as number) ?? undefined,
            workspaceId,
          });
          results.push({ ...action, entityId: created.id, after: created });

          // Log operation for potential rollback
          const logIndex = transactionLog.push({
            sequence: sequence++,
            actionType: 'project.create',
            entityId: created.id,
            before: { project: beforeSnapshot ?? undefined },
            auditRecorded: false,
            timestamp: now(),
          }) - 1;

          await recordAudit(db, {
            workspaceId,
            entityType: 'project',
            entityId: created.id,
            action: 'create',
            before: null,
            after: created,
            actor,
            reason: draft.reason ?? null,
            projectId: created.id,
            taskId: null,
            draftId: draft.id,
          });
          transactionLog[logIndex]!.auditRecorded = true;

        } else if (action.action === 'update' && action.entityId) {
          const before = await getProjectById(db, action.entityId, workspaceId);
          const updated = await updateProject(db, action.entityId, {
            name: (action.after?.name as string) ?? undefined,
            description: (action.after?.description as string) ?? undefined,
            icon: (action.after?.icon as string) ?? undefined,
          }, workspaceId);

          if (updated) {
            results.push({ ...action, before: before ?? undefined, after: updated });

            // Log operation for potential rollback
            const logIndex = transactionLog.push({
              sequence: sequence++,
              actionType: 'project.update',
              entityId: updated.id,
              before: { project: before ?? undefined },
              auditRecorded: false,
              timestamp: now(),
            }) - 1;

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
          }

        } else if (action.action === 'delete' && action.entityId) {
          const before = await getProjectById(db, action.entityId, workspaceId);
          const taskRows = await db.select().from(tasks).where(eq(tasks.projectId, action.entityId));
          const tasksBefore = taskRows.map(toTaskRecord);
          const deleted = await deleteProject(db, action.entityId, workspaceId);
          results.push({ ...action, before: before ?? undefined, after: null });

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
          }
        }
        continue;
      }

      if (action.entityType === 'task') {
        if (action.action === 'create' && action.after) {
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

          const beforeSnapshot = await getTaskById(db, (action.after.id as string) ?? '', workspaceId);
          const created = await createTask(db, {
            id: (action.after.id as string) ?? undefined,
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
          results.push({ ...action, entityId: created.id, after: created, warnings: warnings.length ? warnings : undefined });

          // Log operation for potential rollback
          const logIndex = transactionLog.push({
            sequence: sequence++,
            actionType: 'task.create',
            entityId: created.id,
            before: { task: beforeSnapshot ?? undefined },
            auditRecorded: false,
            timestamp: now(),
          }) - 1;

          await recordAudit(db, {
            workspaceId,
            entityType: 'task',
            entityId: created.id,
            action: 'create',
            before: null,
            after: created,
            actor,
            reason: draft.reason ?? null,
            projectId: created.projectId,
            taskId: created.id,
            draftId: draft.id,
          });
          transactionLog[logIndex]!.auditRecorded = true;

        } else if (action.action === 'update' && action.entityId) {
          const before = await getTaskById(db, action.entityId, workspaceId);

          if (!before) {
            throw new Error(`Task not found: ${action.entityId}. The task may have been deleted or the draft is outdated.`);
          }
          if (draftProjectId && before.projectId !== draftProjectId) {
            results.push({
              ...action,
              before,
              after: null,
              warnings: ['Task update skipped because it targets a different project than the active draft project.'],
            });
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
            results.push({ ...action, before: before ?? undefined, after: updated });

            // Log operation for potential rollback
            const logIndex = transactionLog.push({
              sequence: sequence++,
              actionType: 'task.update',
              entityId: updated.id,
              before: { task: before ?? undefined },
              auditRecorded: false,
              timestamp: now(),
            }) - 1;

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
          }

        } else if (action.action === 'delete' && action.entityId) {
          const before = await getTaskById(db, action.entityId, workspaceId);
          if (before && draftProjectId && before.projectId !== draftProjectId) {
            results.push({
              ...action,
              before,
              after: null,
              warnings: ['Task delete skipped because it targets a different project than the active draft project.'],
            });
            continue;
          }

          const deleted = await deleteTask(db, action.entityId, workspaceId);
          results.push({ ...action, before: before ?? undefined, after: null });

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
          }
        }
      }
    }

    await db.update(drafts).set({ status: 'applied' }).where(eq(drafts.id, draft.id));
    return { draft: { ...draft, status: 'applied' }, results };

  } catch (error) {
    // Compensating transaction: rollback all completed operations in reverse order
    console.error('Draft application failed, initiating compensating rollback', {
      draftId: draft.id,
      operationsCompleted: transactionLog.length,
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
      status: 'pending', // Keep pending so user can retry
    }).where(eq(drafts.id, draft.id));

    // Construct comprehensive error message
    const errorMessage = [
      `Draft application failed after ${transactionLog.length} operations.`,
      rollbackErrors.length > 0
        ? `Rollback completed with ${rollbackErrors.length} errors.`
        : 'Rollback completed successfully.',
      rollbackErrors.length > 0 ? 'Rollback errors: ' + rollbackErrors.map(e => `[${e.entry.actionType} on ${e.entry.entityId}: ${e.error}]`).join(', ') : '',
    ].filter(Boolean).join(' ');

    console.error('Compensating rollback completed', {
      draftId: draft.id,
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
