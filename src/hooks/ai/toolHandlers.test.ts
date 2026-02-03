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
        dueDateTo: '2026-01-01',
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
      startDateFrom: '2026-06-27',
      startDateTo: undefined,
      dueDateFrom: undefined,
      dueDateTo: '2026-01-01',
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

describe('toolHandlers updateTask', () => {
  it('corrects startDate when reason date conflicts', async () => {
    const context = buildContext();
    context.api.getTask = vi.fn().mockResolvedValue({
      id: 't4',
      projectId: 'project-1',
      title: 'Main Structure',
      status: 'TODO',
      priority: 'HIGH',
      createdAt: '2026-01-01',
      startDate: '2026-06-10',
      dueDate: '2026-06-11',
      completion: 0,
      assignee: 'General Contractor',
      isMilestone: false,
      predecessors: [],
    });
    context.api.listTasks = vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 50 });
    const startDate = '2024-07-19';

    const result = await executeToolCall(
      'updateTask',
      {
        id: 't4',
        startDate,
        reason: 'Align start date to Aug 19, 2027',
      },
      context
    );

    expect(result.draftActions?.[0]?.after?.startDate).toBe('2027-08-19');
  });

  it('prefers the revised start date in complex reason strings', async () => {
    const context = buildContext();
    context.api.getTask = vi.fn().mockResolvedValue({
      id: 't4',
      projectId: 'project-1',
      title: 'Main Structure',
      status: 'TODO',
      priority: 'HIGH',
      createdAt: '2026-01-01',
      startDate: '2024-07-19',
      dueDate: '2027-11-29',
      completion: 0,
      assignee: 'General Contractor',
      isMilestone: false,
      predecessors: [],
    });
    context.api.listTasks = vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 50 });

    const result = await executeToolCall(
      'updateTask',
      {
        id: 't4',
        startDate: '2024-07-19',
        dueDate: '2027-11-29',
        reason: '修复开始日期，从2024-07-19改为2026-12-09，并将截止日期延长至2027-11-29',
      },
      context
    );

    expect(result.draftActions?.[0]?.after?.startDate).toBe('2026-12-09');
  });
});
