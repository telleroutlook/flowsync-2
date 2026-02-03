import type { AuditRecord, DraftAction, DraftRecord, ProjectRecord, TaskRecord } from '../services/types';

export type ApiErrorDetail = {
  path: string;
  message: string;
};

export type ApiError = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: ApiErrorDetail[];
  };
};

export type ApiSuccess<T> = {
  success: true;
  data: T;
};

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export const readJson = async <T>(res: Response): Promise<ApiResponse<T>> => {
  return (await res.json()) as ApiResponse<T>;
};

export const expectError = <T>(response: ApiResponse<T>): ApiError => {
  if (response.success) {
    throw new Error('Expected error response');
  }
  return response;
};

export const expectSuccess = <T>(response: ApiResponse<T>): ApiSuccess<T> => {
  if (!response.success) {
    throw new Error(`Expected success response, got ${response.error.code}`);
  }
  return response;
};

const DEFAULT_DATE = '2024-01-01';
const DEFAULT_TIMESTAMP = 1;

export const makeProjectRecord = (overrides: Partial<ProjectRecord> = {}): ProjectRecord => ({
  id: 'p1',
  workspaceId: 'public',
  name: 'Project',
  description: null,
  icon: null,
  createdAt: DEFAULT_DATE,
  updatedAt: DEFAULT_DATE,
  ...overrides,
});

export const makeTaskRecord = (overrides: Partial<TaskRecord> = {}): TaskRecord => ({
  id: 't1',
  projectId: 'p1',
  title: 'Task',
  description: null,
  status: 'TODO',
  priority: 'LOW',
  wbs: null,
  createdAt: DEFAULT_DATE,
  startDate: DEFAULT_DATE,
  dueDate: null,
  completion: 0,
  assignee: null,
  isMilestone: false,
  predecessors: [],
  updatedAt: DEFAULT_DATE,
  ...overrides,
});

export const makeDraftAction = (overrides: Partial<DraftAction> = {}): DraftAction => ({
  id: 'a1',
  entityType: 'task',
  action: 'create',
  ...overrides,
});

export const makeDraftRecord = (overrides: Partial<DraftRecord> = {}): DraftRecord => ({
  id: 'd1',
  workspaceId: 'public',
  projectId: 'p1',
  status: 'pending',
  actions: [makeDraftAction()],
  createdAt: DEFAULT_TIMESTAMP,
  createdBy: 'agent',
  reason: null,
  ...overrides,
});

export const makeAuditRecord = (overrides: Partial<AuditRecord> = {}): AuditRecord => ({
  id: 'a1',
  workspaceId: 'public',
  entityType: 'task',
  entityId: 't1',
  action: 'create',
  actor: 'agent',
  reason: null,
  timestamp: DEFAULT_TIMESTAMP,
  projectId: 'p1',
  taskId: 't1',
  draftId: null,
  ...overrides,
});
