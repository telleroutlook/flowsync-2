import { describe, it, expect, vi } from 'vitest';
import { executeToolCall, type ToolHandlerContext } from './toolHandlers';
import type { ApiClient } from './types';

const buildContext = (overrides?: Partial<ToolHandlerContext>) => {
  const api: ApiClient = {
    listProjects: vi.fn(),
    getProject: vi.fn(),
    listTasks: vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 50 }),
    getTask: vi.fn(),
    createDraft: vi.fn(),
    applyDraft: vi.fn(),
  };

  const context: ToolHandlerContext = {
    api,
    activeProjectId: 'project-1',
    generateId: () => 'id-1',
    t: (key: string) => key,
  };

  return { ...context, ...overrides, api };
};

describe('toolHandlers listTasks', () => {
  it('normalizes status/priority and parses numeric date filters', async () => {
    const context = buildContext();

    await executeToolCall(
      'listTasks',
      {
        status: '进行中',
        priority: '高',
        startDateFrom: '2026-06-27',
        dueDateTo: '1767225600000',
      },
      context
    );

    expect(context.api.listTasks).toHaveBeenCalledWith({
      projectId: 'project-1',
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      assignee: undefined,
      isMilestone: undefined,
      q: undefined,
      startDateFrom: Date.parse('2026-06-27'),
      startDateTo: undefined,
      dueDateFrom: undefined,
      dueDateTo: 1767225600000,
      page: undefined,
      pageSize: undefined,
    });
  });

  it('drops invalid status/priority and non-numeric date filters', async () => {
    const context = buildContext();

    await executeToolCall(
      'listTasks',
      {
        status: 'doing',
        priority: 'urgent',
        startDateFrom: 'not-a-date',
      },
      context
    );

    expect(context.api.listTasks).toHaveBeenCalledWith({
      projectId: 'project-1',
      status: undefined,
      priority: undefined,
      assignee: undefined,
      isMilestone: undefined,
      q: undefined,
      startDateFrom: undefined,
      startDateTo: undefined,
      dueDateFrom: undefined,
      dueDateTo: undefined,
      page: undefined,
      pageSize: undefined,
    });
  });
});
