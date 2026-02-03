import type { ApiResponse, AuditLog, Draft, DraftAction, Project, Task, User, Workspace, WorkspaceJoinRequest, WorkspaceMember, WorkspaceMemberActionResult, WorkspaceMembership, WorkspaceWithMembership } from '../types';
import type { ConflictInfo } from '../components/ConflictDialog';
import { sleep, getRetryDelay } from '../src/utils/retry';
import { buildAuthHeaders } from './aiService';
import { ApiError, TimeoutError, NetworkError, getErrorMessage, isAppError } from '../src/utils/error';

const MAX_FETCH_RETRIES = 2;
const DEFAULT_TIMEOUT_MS = 30000;
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

// Request deduplication cache
const pendingRequests = new Map<string, Promise<unknown>>();

function getRequestKey(input: RequestInfo, init?: RequestInit): string {
  const url = typeof input === 'string' ? input : input.url;
  const method = (init?.method || 'GET').toUpperCase();

  // Only deduplicate GET requests and safe mutations
  if (method !== 'GET') {
    return `${method}:${url}:${Date.now()}`;
  }

  return `${method}:${url}`;
}

function shouldRetryStatus(status: number): boolean {
  return RETRYABLE_STATUS_CODES.has(status);
}

function isIdempotentMethod(method?: string): boolean {
  const normalized = (method || 'GET').toUpperCase();
  return normalized === 'GET' || normalized === 'HEAD';
}

function createTimeoutPromise(ms: number, url: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new TimeoutError(`Request timeout after ${ms}ms`, ms, { url }));
    }, ms);
  });
}

const fetchWithRetry = async (input: RequestInfo, init?: RequestInit): Promise<Response> => {
  const canRetry = isIdempotentMethod(init?.method);
  const url = typeof input === 'string' ? input : input.url;
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_FETCH_RETRIES; attempt += 1) {
    if (init?.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    try {
      // Create a timeout promise
      const timeoutPromise = createTimeoutPromise(DEFAULT_TIMEOUT_MS, url);

      // Race between fetch and timeout
      const response = await Promise.race([
        fetch(input, init),
        timeoutPromise
      ]) as Response;

      if (!canRetry || !shouldRetryStatus(response.status) || attempt === MAX_FETCH_RETRIES) {
        return response;
      }

      const delayMs = getRetryDelay(attempt, response.headers.get('Retry-After'));
      await sleep(delayMs);
    } catch (error) {
      lastError = error;

      // Don't retry on abort
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw error;
      }

      // Don't retry on TimeoutError for non-idempotent methods
      if (error instanceof TimeoutError && !canRetry) {
        throw error;
      }

      // Don't retry network errors for POST/PUT/DELETE
      if (!canRetry) {
        if (error instanceof TypeError) {
          throw new NetworkError(`Network error: ${getErrorMessage(error, 'Connection failed')}`, { url, method: init?.method });
        }
        throw error;
      }

      if (attempt === MAX_FETCH_RETRIES) {
        throw error;
      }

      const delayMs = getRetryDelay(attempt);
      await sleep(delayMs);
    }
  }

  throw lastError;
};

const buildQueryString = (params: Record<string, string | number | boolean | undefined | null>): string => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (typeof value === 'number' && !Number.isFinite(value)) return;
    query.set(key, String(value));
  });
  const suffix = query.toString();
  return suffix ? `?${suffix}` : '';
};

// Helper to extract CSRF token from cookies
const getCsrfToken = (): string | undefined => {
  const cookies = document.cookie.split(';');
  const csrfCookie = cookies.find(cookie => cookie.trim().startsWith('csrf_token='));
  return csrfCookie?.split('=')[1]?.trim();
};

const buildHeaders = (headers?: HeadersInit, method?: string, workspaceId?: string) => {
  const merged = new Headers(buildAuthHeaders(false, workspaceId));

  // Add CSRF token header for state-changing operations (POST/PATCH/DELETE)
  // This implements the double-submit cookie pattern for CSRF protection
  const isMutation = method && ['POST', 'PATCH', 'DELETE', 'PUT'].includes(method.toUpperCase());
  if (isMutation) {
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      merged.set('x-csrf-token', csrfToken);
    }
  }

  if (headers) {
    const additional = new Headers(headers);
    additional.forEach((value, key) => merged.set(key, value));
  }
  return merged;
};

/**
 * Initialize CSRF token by fetching from server
 * Should be called on app startup to ensure CSRF token is available
 */
export const initCsrfToken = async (): Promise<void> => {
  try {
    await fetchJson<{ token: string }>('/api/auth/csrf-token');
  } catch (error) {
    // Log but don't throw - CSRF token will be set on first GET request anyway
    console.warn('Failed to initialize CSRF token:', error);
  }
};

interface FetchInitWithOptions extends RequestInit {
  workspaceId?: string;
}

const fetchJson = async <T>(input: RequestInfo, init?: FetchInitWithOptions): Promise<T> => {
  const requestKey = getRequestKey(input, init);
  const url = typeof input === 'string' ? input : input.url;

  // Check for pending duplicate request
  const cached = pendingRequests.get(requestKey);
  if (cached) {
    return cached as Promise<T>;
  }

  // Create the request promise
  const requestPromise = (async (): Promise<T> => {
    try {
      let response: Response | null = null;
      let text = '';

      try {
        response = await fetchWithRetry(input, { ...init, headers: buildHeaders(init?.headers, init?.method, init?.workspaceId) });
        text = await response.text();
      } catch (error) {
        if (error instanceof TypeError && error.message.includes('fetch')) {
          throw new NetworkError(getErrorMessage(error, 'Failed to connect to server'), { url });
        }
        if (isAppError(error)) {
          throw error;
        }
        throw new NetworkError(getErrorMessage(error, 'Network request failed'), { url });
      }

      let payload: ApiResponse<T> | null = null;
      if (text) {
        try {
          payload = JSON.parse(text) as ApiResponse<T>;
        } catch {
          const snippet = text.slice(0, 160).replace(/\s+/g, ' ').trim();
          throw new ApiError(
            `Invalid JSON response from server. ${snippet ? `Response: ${snippet}` : 'Empty response body.'}`,
            response?.status,
            'INVALID_JSON'
          );
        }
      }

      if (!payload) {
        throw new ApiError('Empty response from server', response?.status, 'EMPTY_RESPONSE');
      }

      if (!response.ok || !payload.success || payload.data === undefined) {
        const message = payload.error?.message || `Request failed with status ${response.status}`;
        throw new ApiError(message, response.status, payload.error?.code);
      }

      return payload.data;
    } finally {
      // Clean up cache after request completes
      pendingRequests.delete(requestKey);
    }
  })();

  // Cache the promise for deduplication
  pendingRequests.set(requestKey, requestPromise);

  return requestPromise;
};

export const apiService = {
  register: (data: { username: string; password: string }) =>
    fetchJson<{ user: User; token: string; expiresAt: number }>('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  login: (data: { username: string; password: string }) =>
    fetchJson<{ user: User; token: string; expiresAt: number }>('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  me: () => fetchJson<{ user: User }>('/api/auth/me'),
  updateProfile: (data: { allowThinking?: boolean }) =>
    fetchJson<{ user: User }>('/api/auth/me', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  logout: () =>
    fetchJson<{ success: true }>('/api/auth/logout', {
      method: 'POST',
    }),

  listWorkspaces: () => fetchJson<WorkspaceWithMembership[]>('/api/workspaces'),
  createWorkspace: (data: { name: string; description?: string }) =>
    fetchJson<Workspace>('/api/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  requestJoinWorkspace: (id: string) =>
    fetchJson<WorkspaceMembership>(`/api/workspaces/${id}/join`, { method: 'POST' }),
  listWorkspaceRequests: (id: string) =>
    fetchJson<WorkspaceJoinRequest[]>(`/api/workspaces/${id}/requests`),
  approveWorkspaceRequest: (workspaceId: string, userId: string) =>
    fetchJson<WorkspaceMembership>(`/api/workspaces/${workspaceId}/requests/${userId}/approve`, { method: 'POST' }),
  rejectWorkspaceRequest: (workspaceId: string, userId: string) =>
    fetchJson<WorkspaceMemberActionResult>(`/api/workspaces/${workspaceId}/requests/${userId}/reject`, { method: 'POST' }),
  listWorkspaceMembers: (id: string) =>
    fetchJson<WorkspaceMember[]>(`/api/workspaces/${id}/members`),
  removeWorkspaceMember: (workspaceId: string, userId: string) =>
    fetchJson<WorkspaceMemberActionResult>(`/api/workspaces/${workspaceId}/members/${userId}`, { method: 'DELETE' }),

  listProjects: () => fetchJson<Project[]>('/api/projects'),
  getProject: (id: string) => fetchJson<Project>(`/api/projects/${id}`),
  createProject: (data: { id?: string; name: string; description?: string; icon?: string; createdAt?: string; updatedAt?: string }) =>
    fetchJson<Project>('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  updateProject: (id: string, data: { name?: string; description?: string; icon?: string }) =>
    fetchJson<Project>(`/api/projects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  deleteProject: (id: string) =>
    fetchJson<{ project: Project; deletedTasks: number }>(`/api/projects/${id}`, {
      method: 'DELETE',
    }),

  listTasks: (params: {
    projectId?: string;
    status?: string;
    priority?: string;
    assignee?: string;
    isMilestone?: boolean;
    q?: string;
    startDateFrom?: string;
    startDateTo?: string;
    dueDateFrom?: string;
    dueDateTo?: string;
    page?: number;
    pageSize?: number;
  }) => {
    return fetchJson<{ data: Task[]; total: number; page: number; pageSize: number }>(
      `/api/tasks${buildQueryString(params)}`
    );
  },
  getTask: (id: string) => fetchJson<Task>(`/api/tasks/${id}`),
  createTask: (data: {
    id?: string;
    projectId: string;
    title: string;
    description?: string;
    status?: Task['status'];
    priority?: Task['priority'];
    wbs?: string;
    startDate?: string;
    dueDate?: string;
    completion?: number;
    assignee?: string;
    isMilestone?: boolean;
    predecessors?: string[];
    createdAt?: string;
    updatedAt?: string;
  }) =>
    fetchJson<Task>('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  updateTask: (id: string, data: Partial<Task>) =>
    fetchJson<Task>(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  deleteTask: (id: string) =>
    fetchJson<Task>(`/api/tasks/${id}`, {
      method: 'DELETE',
    }),

  listDrafts: () => fetchJson<Draft[]>('/api/drafts'),
  getDraft: (id: string) => fetchJson<Draft>(`/api/drafts/${id}`),
  createDraft: (data: { projectId?: string; createdBy?: Draft['createdBy']; reason?: string; actions: DraftAction[] }) =>
    fetchJson<{ draft: Draft; warnings: string[] }>('/api/drafts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  applyDraft: (
    id: string,
    actor: Draft['createdBy'],
    workspaceId?: string,
    options?: { autoFix?: boolean; force?: boolean }
  ) =>
    fetchJson<{ draft: Draft; results: DraftAction[]; conflicts?: ConflictInfo[] }>(
      `/api/drafts/${id}/apply`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor, autoFix: options?.autoFix ?? true, force: options?.force ?? false }),
        workspaceId,
      }
    ),
  discardDraft: (id: string) =>
    fetchJson<Draft>(`/api/drafts/${id}/discard`, {
      method: 'POST',
    }),

  listAuditLogs: (params: {
    projectId?: string;
    taskId?: string;
    page?: number;
    pageSize?: number;
    actor?: string;
    action?: string;
    entityType?: string;
    q?: string;
    from?: number;
    to?: number;
  }) => {
    return fetchJson<{ data: AuditLog[]; total: number; page: number; pageSize: number }>(
      `/api/audit${buildQueryString(params)}`
    );
  },
  getAuditLog: (id: string) => fetchJson<AuditLog>(`/api/audit/${id}`),
};
