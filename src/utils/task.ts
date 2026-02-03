import type { Task } from '../../types';
import { dateStringToMs, getTaskEnd, getTaskStart } from './date';

/**
 * Check if a task has a predecessor conflict
 * A conflict occurs when any predecessor task ends after this task starts
 */
export const hasPredecessorConflict = (task: Task, allTasks: Task[]): boolean => {
  if (!task.predecessors || task.predecessors.length === 0) {
    return false;
  }

  const taskStart = getTaskStart(task);

  return task.predecessors.some((predecessorRef: string) => {
    const predecessor = allTasks.find(t => t.id === predecessorRef || t.wbs === predecessorRef);
    if (!predecessor) return false;

    const predecessorEnd = getTaskEnd(predecessor);
    return dateStringToMs(predecessorEnd) > dateStringToMs(taskStart);
  });
};

/**
 * Get all tasks with predecessor conflicts
 * Returns a Set of task IDs that have conflicts
 */
export const getTasksWithConflicts = (tasks: Task[]): Set<string> => {
  const conflicts = new Set<string>();

  for (const task of tasks) {
    if (hasPredecessorConflict(task, tasks)) {
      conflicts.add(task.id);
    }
  }

  return conflicts;
};
