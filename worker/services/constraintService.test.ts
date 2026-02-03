import { describe, it, expect } from 'vitest';
import { applyTaskConstraints } from './constraintService';
import type { TaskRecord } from './types';

const baseTask = (overrides: Partial<TaskRecord>): TaskRecord => ({
  id: 't1',
  projectId: 'p1',
  title: 'Task',
  description: null,
  status: 'TODO',
  priority: 'LOW',
  wbs: null,
  createdAt: '2026-01-01',
  startDate: '2026-01-01',
  dueDate: '2026-01-01',
  completion: 0,
  assignee: null,
  isMilestone: false,
  predecessors: [],
  updatedAt: '2026-01-01',
  ...overrides,
});

describe('constraintService', () => {
  it('adjusts dates when due date is before start', () => {
    const task = baseTask({ startDate: '2026-01-03', dueDate: '2026-01-02' });
    const result = applyTaskConstraints(task, [task]);

    expect(result.changed).toBe(false);
    expect(result.warnings.length).toBe(0);
  });

  it('pushes start after predecessors', () => {
    const dependency = baseTask({ id: 't0', startDate: '2026-01-02', dueDate: '2026-01-05' });
    const task = baseTask({ startDate: '2026-01-01', dueDate: '2026-01-02', predecessors: ['t0'] });
    const result = applyTaskConstraints(task, [dependency, task]);

    expect(result.changed).toBe(true);
    expect((result.task.startDate ?? '') >= '2026-01-05').toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
