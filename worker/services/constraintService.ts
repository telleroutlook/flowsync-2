import type { TaskRecord } from './types';
import { addDays, dateStringToMs } from './utils';

const getTaskStart = (task: TaskRecord) => task.startDate ?? task.createdAt;
const getTaskEnd = (task: TaskRecord) => {
  const start = getTaskStart(task);
  const end = task.dueDate ?? addDays(start, 1);
  return dateStringToMs(end) <= dateStringToMs(start) ? addDays(start, 1) : end;
};

export type ConstraintResult = {
  task: TaskRecord;
  warnings: string[];
  changed: boolean;
};

export const enforceDateOrder = (task: TaskRecord): ConstraintResult => {
  const start = getTaskStart(task);
  const end = getTaskEnd(task);
  if (dateStringToMs(end) > dateStringToMs(start)) {
    return { task, warnings: [], changed: false };
  }
  return {
    task: { ...task, startDate: start, dueDate: addDays(start, 1) },
    warnings: ['Adjusted task dates to ensure due date is after start date.'],
    changed: true,
  };
};

export const resolveDependencyConflicts = (task: TaskRecord, allTasks: TaskRecord[]): ConstraintResult => {
  if (!task.predecessors.length) return { task, warnings: [], changed: false };
  const start = getTaskStart(task);
  const end = getTaskEnd(task);

  // Build a Map for O(1) lookups by both id and wbs
  const taskMap = new Map<string, TaskRecord>();
  for (const t of allTasks) {
    if (t.projectId === task.projectId) {
      taskMap.set(t.id, t);
      if (t.wbs) taskMap.set(t.wbs, t);
    }
  }

  let maxEnd = start;
  for (const ref of task.predecessors) {
    const match = taskMap.get(ref);
    if (match) {
      if (dateStringToMs(getTaskEnd(match)) > dateStringToMs(maxEnd)) {
        maxEnd = getTaskEnd(match);
      }
    }
  }

  if (dateStringToMs(maxEnd) <= dateStringToMs(start)) return { task, warnings: [], changed: false };
  const durationMs = Math.max(86_400_000, dateStringToMs(end) - dateStringToMs(start));
  const nextStart = maxEnd;
  const nextEnd = addDays(nextStart, Math.ceil(durationMs / 86_400_000));
  return {
    task: { ...task, startDate: nextStart, dueDate: nextEnd },
    warnings: ['Adjusted task dates to satisfy predecessor dependencies.'],
    changed: true,
  };
};

export const applyTaskConstraints = (task: TaskRecord, allTasks: TaskRecord[]) => {
  const warnings: string[] = [];
  let nextTask = task;
  let changed = false;

  const dependencyResult = resolveDependencyConflicts(nextTask, allTasks);
  if (dependencyResult.changed) {
    changed = true;
    nextTask = dependencyResult.task;
    warnings.push(...dependencyResult.warnings);
  }

  const dateResult = enforceDateOrder(nextTask);
  if (dateResult.changed) {
    changed = true;
    nextTask = dateResult.task;
    warnings.push(...dateResult.warnings);
  }

  return { task: nextTask, warnings, changed, violated: false };
};
