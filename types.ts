export enum TaskStatus {
  TODO = 'TODO',
  IN_PROGRESS = 'IN_PROGRESS',
  DONE = 'DONE',
}

export enum Priority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

export interface Project {
  id: string;
  workspaceId?: string;
  name: string;
  description?: string;
  icon?: string; // Emoji or simple string char
  createdAt?: string;
  updatedAt?: string;
}

export interface Task {
  id: string;
  projectId: string; // Link to project
  title: string;
  description?: string;
  status: TaskStatus;
  priority: Priority;
  
  // WBS & Scheduling
  wbs?: string; // e.g., "1.1", "2.0"
  createdAt: string;
  updatedAt?: string;
  startDate?: string; // Planned Start
  dueDate?: string; // Planned Finish / Deadline
  
  // Progress & Responsibility
  completion?: number; // 0 to 100
  assignee?: string; // Responsible Unit / Person
  isMilestone?: boolean; 
  predecessors?: string[]; // IDs or WBS codes of previous tasks
}

export interface ActionableSuggestion {
  text: string;
  action?: string;
  params?: Record<string, unknown>;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model' | 'system';
  text: string;
  timestamp: number;
  isThinking?: boolean;
  thinking?: {
    preview?: string;
    steps?: { label: string; elapsedMs?: number }[];
  };
  meta?: {
    requestId?: string;
    turns?: number;
  };
  attachments?: ChatAttachment[];
  suggestions?: ActionableSuggestion[];
}

export interface ChatAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
}

export type ActionStatus = 'pending' | 'success' | 'warning' | 'skipped' | 'failed';

export interface DraftAction {
  id: string;
  entityType: 'task' | 'project';
  action: 'create' | 'update' | 'delete';
  entityId?: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  warnings?: string[];
  /** Execution status (available after draft application) */
  status?: ActionStatus;
  /** Error message if the action failed */
  error?: string;
}

export type DraftStatus = 'pending' | 'applied' | 'partial' | 'discarded' | 'failed';

export interface Draft {
  id: string;
  workspaceId?: string;
  projectId: string | null;
  status: DraftStatus;
  actions: DraftAction[];
  createdAt: number;
  createdBy: 'user' | 'agent' | 'system';
  reason?: string | null;
  /** Summary statistics when status is 'partial' */
  summary?: {
    success: number;
    warning: number;
    skipped: number;
    failed: number;
  };
}

export interface AuditLog {
  id: string;
  workspaceId?: string | null;
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
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: { path: string; message: string }[];
  };
}

export interface User {
  id: string;
  username: string;
  createdAt: number;
  allowThinking?: boolean;
}

export interface Workspace {
  id: string;
  name: string;
  description?: string | null;
  createdAt: number;
  createdBy?: string | null;
  isPublic: boolean;
}

export interface WorkspaceMembership {
  workspaceId: string;
  userId: string;
  role: 'admin' | 'member';
  status: 'active' | 'pending';
  createdAt: number;
}

export interface WorkspaceWithMembership extends Workspace {
  membership?: WorkspaceMembership | null;
}

export interface WorkspaceJoinRequest {
  userId: string;
  username: string;
  role: 'admin' | 'member';
  status: 'active' | 'pending';
  createdAt: number;
}

export interface WorkspaceMember {
  userId: string;
  username: string;
  role: 'admin' | 'member';
  status: 'active' | 'pending';
  createdAt: number;
}

export interface WorkspaceMemberActionResult {
  workspaceId: string;
  userId: string;
}

export const PUBLIC_WORKSPACE_ID = 'public';

// AI Tool Arguments
export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}
export interface TaskActionArgs {
  action: 'create' | 'update' | 'delete';
  id?: string;
  projectId?: string;
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  wbs?: string;
  startDate?: string;
  dueDate?: string;
  completion?: number;
  assignee?: string;
  isMilestone?: boolean;
  predecessors?: string[];
  reason?: string;
}

export interface ProjectActionArgs {
  action: 'create' | 'update' | 'delete';
  id?: string;
  name?: string;
  description?: string;
  icon?: string;
  reason?: string;
}
