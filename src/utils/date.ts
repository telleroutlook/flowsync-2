import type { Task } from '../../types';

const DAY_MS = 86_400_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Format a date string for display in task context
 * Returns ISO date format (YYYY-MM-DD) or 'N/A' if no date
 */
export function formatTaskDate(value: string | null | undefined): string {
  if (!value) return 'N/A';
  return value;
}

export const isDateString = (value?: string | null): value is string =>
  typeof value === 'string' && DATE_RE.test(value);

export const dateStringToMs = (value: string): number => {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return NaN;
  return Date.UTC(year, month - 1, day);
};

export const toDateString = (value?: string | null): string | undefined => {
  if (value === null || value === undefined) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (DATE_RE.test(trimmed)) return trimmed;
  return undefined;
};

export const msToDateString = (value: number): string | undefined => {
  if (!Number.isFinite(value)) return undefined;
  return new Date(value).toISOString().slice(0, 10);
};

export const addDays = (value: string, days: number): string => {
  const ms = dateStringToMs(value) + days * DAY_MS;
  return new Date(ms).toISOString().slice(0, 10);
};

export function getTaskStart(task: Task): string {
  return task.startDate ?? task.createdAt;
}

export function getTaskEnd(task: Task): string {
  const start = getTaskStart(task);
  const end = task.dueDate ?? addDays(start, 1);
  if (dateStringToMs(end) <= dateStringToMs(start)) return addDays(start, 1);
  return end;
}

export function formatExportDate(value?: string | null): string {
  if (!value) return '';
  return value;
}

export function formatDateInput(value?: string | null): string {
  if (!value) return '';
  return value;
}

export function parseDateInput(value: string): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!DATE_RE.test(trimmed)) return undefined;
  return trimmed;
}

export function parseDateFlexible(value?: string): string | undefined {
  return toDateString(value);
}

export const isBeforeDate = (value: string, compareTo: string): boolean =>
  dateStringToMs(value) < dateStringToMs(compareTo);

export const formatDisplayDate = (value: string, locale: string): string =>
  new Date(`${value}T00:00:00`).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });

export const todayDateString = (): string => new Date().toISOString().slice(0, 10);
