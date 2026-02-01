export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH';

export type UserRecord = {
  id: string;
  username: string;
  createdAt: number;
  allowThinking?: boolean;
};

export type WorkspaceRecord = {
  id: string;
  name: string;
  description: string | null;
  createdAt: number;
  createdBy: string | null;
  isPublic: boolean;
};

export type WorkspaceMembershipRecord = {
  workspaceId: string;
  userId: string;
  role: 'admin' | 'member';
  status: 'active' | 'pending';
  createdAt: number;
};

export type TaskRecord = {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority;
  wbs: string | null;
  createdAt: number;
  startDate: number | null;
  dueDate: number | null;
  completion: number | null;
  assignee: string | null;
  isMilestone: boolean;
  predecessors: string[];
  updatedAt: number;
};

export type ProjectRecord = {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  icon: string | null;
  createdAt: number;
  updatedAt: number;
};

// Stricter types for DraftAction data to improve type safety
export type TaskActionData = {
  id?: string;
  projectId?: string;
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: Priority;
  wbs?: string | null;
  startDate?: number | null;
  dueDate?: number | null;
  completion?: number | null;
  assignee?: string | null;
  isMilestone?: boolean;
  predecessors?: string[];
  createdAt?: number;
  updatedAt?: number;
};

export type ProjectActionData = {
  id?: string;
  workspaceId?: string;
  name?: string;
  description?: string | null;
  icon?: string | null;
  createdAt?: number;
  updatedAt?: number;
};

export type DraftActionData = TaskActionData | ProjectActionData;

export type ActionStatus = 'pending' | 'success' | 'warning' | 'skipped' | 'failed';

export type DraftAction = {
  id: string;
  entityType: 'task' | 'project';
  action: 'create' | 'update' | 'delete';
  entityId?: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  warnings?: string[];
  explicitFields?: string[];  // Fields explicitly modified by user/AI (e.g., ['startDate', 'dueDate'])
  /** Execution status (available after draft application) */
  status?: ActionStatus;
  /** Error message if the action failed */
  error?: string;
};

export type DraftStatus = 'pending' | 'applied' | 'partial' | 'discarded' | 'failed';

export type DraftRecord = {
  id: string;
  workspaceId: string;
  projectId: string | null;
  status: DraftStatus;
  actions: DraftAction[];
  createdAt: number;
  createdBy: 'user' | 'agent' | 'system';
  reason?: string | null;
  /** Summary statistics when status is 'partial' or 'failed' */
  summary?: {
    success: number;
    warning: number;
    skipped: number;
    failed: number;
  };
};

export type AuditRecord = {
  id: string;
  workspaceId: string;
  entityType: 'task' | 'project';
  entityId: string;
  action: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  actor: 'user' | 'agent' | 'system';
  reason?: string | null;
  timestamp: number;
  projectId?: string | null;
  taskId?: string | null;
  draftId?: string | null;
};

export type PlanResult = {
  draft: DraftRecord;
  warnings: string[];
};

/**
 * Conflict types detected when applying a draft
 */
export type ConflictType =
  | 'TASK_NOT_FOUND'           // Task referenced in draft no longer exists
  | 'PREDECESSOR_CONFLICT'     // Task start date is before predecessor end dates
  | 'DATE_ORDER_CONFLICT'      // Task due date is before or equal to start date
  | 'CONCURRENT_MODIFICATION'; // Task was modified after draft was created

/**
 * Detailed conflict information
 */
export type ConflictInfo = {
  type: ConflictType;
  entityId: string;
  message: string;
  canAutoFix: boolean;
  /** Proposed fix for auto-fixable conflicts (mainly date adjustments) */
  proposedFix?: TaskRecord;
  /** Additional details (e.g., timestamps for concurrent modifications) */
  details?: Record<string, unknown>;
};
