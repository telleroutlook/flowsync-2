import { describe, it, expect } from 'vitest';
import { toTaskRecord } from './serializers';

describe('serializers', () => {
  it('parses task record fields', () => {
    const record = toTaskRecord({
      id: 't1',
      projectId: 'p1',
      title: 'Task',
      description: null,
      status: 'TODO',
      priority: 'LOW',
      wbs: null,
      createdAt: '2026-01-01',
      startDate: '2026-01-02',
      dueDate: '2026-01-03',
      completion: 0,
      assignee: null,
      isMilestone: true,
      predecessors: ['a', 'b'],
      updatedAt: '2026-01-01',
    });

    expect(record.isMilestone).toBe(true);
    expect(record.predecessors).toEqual(['a', 'b']);
  });

  it('handles empty predecessors', () => {
    const record = toTaskRecord({
      id: 't1',
      projectId: 'p1',
      title: 'Task',
      description: null,
      status: 'TODO',
      priority: 'LOW',
      wbs: null,
      createdAt: '2026-01-01',
      startDate: '2026-01-02',
      dueDate: '2026-01-03',
      completion: 0,
      assignee: null,
      isMilestone: false,
      predecessors: null,
      updatedAt: '2026-01-01',
    });

    expect(record.predecessors).toEqual([]);
  });
});
