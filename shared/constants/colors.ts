/**
 * Shared color constants for UI components
 * Used across KanbanBoard, ListView, and other components
 */

import { Priority, TaskStatus } from '../../types';

// Priority color classes for badges and indicators
export const PRIORITY_COLORS: Record<Priority, string> = {
  [Priority.LOW]: 'text-success bg-success/10 border-success/20',
  [Priority.MEDIUM]: 'text-critical bg-critical/10 border-critical/20',
  [Priority.HIGH]: 'text-negative bg-negative/10 border-negative/20',
} as const;

// Priority color classes for Kanban cards (slightly different variant)
export const PRIORITY_COLORS_KANBAN: Record<Priority, string> = {
  [Priority.LOW]: 'bg-success/10 text-success border-success/20 ring-success/30',
  [Priority.MEDIUM]: 'bg-warning/10 text-warning border-warning/20 ring-warning/30',
  [Priority.HIGH]: 'bg-negative/10 text-negative border-negative/20 ring-negative/30',
} as const;

// Task status color classes
export const STATUS_COLORS: Record<TaskStatus, string> = {
  [TaskStatus.TODO]: 'text-text-secondary bg-secondary/10',
  [TaskStatus.IN_PROGRESS]: 'text-primary bg-primary/10',
  [TaskStatus.DONE]: 'text-success bg-success/10',
} as const;

// Status indicator colors for Kanban board
export const STATUS_INDICATOR_COLORS: Record<TaskStatus, string> = {
  [TaskStatus.TODO]: 'bg-text-secondary',
  [TaskStatus.IN_PROGRESS]: 'bg-primary shadow-sm shadow-primary/30',
  [TaskStatus.DONE]: 'bg-success shadow-sm shadow-success/30',
} as const;

// Task color classes for Gantt chart bars - using solid, high-contrast colors
export const TASK_COLOR_CLASSES: Record<Priority, string> = {
  [Priority.LOW]: 'bg-success border-success-dark',
  [Priority.MEDIUM]: 'bg-warning border-warning-dark',
  [Priority.HIGH]: 'bg-negative border-negative-dark',
} as const;

// Helper function to get task color class for Gantt chart
export function getTaskColorClass(priority: Priority, isMilestone?: boolean): string {
  if (isMilestone) return 'border-accent bg-surface';
  const colorClass = TASK_COLOR_CLASSES[priority] || 'bg-primary border-primary-hover';
  return colorClass + ' border bg-opacity-100';
}
