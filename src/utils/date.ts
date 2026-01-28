import type { Task } from '../../types';

const DAY_MS = 86400000;

export function getTaskStart(task: Task): number {
  return task.startDate ?? task.createdAt;
}

export function getTaskEnd(task: Task): number {
  const start = getTaskStart(task);
  const end = task.dueDate ?? start + DAY_MS;
  return end <= start ? start + DAY_MS : end;
}

export function formatExportDate(value?: number): string {
  if (!value) return '';
  return new Date(value).toISOString().slice(0, 10);
}

export function formatDateInput(value?: number): string {
  if (!value) return '';
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseDateInput(value: string): number | undefined {
  if (!value) return undefined;
  const parts = value.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return undefined;
  const [year, month, day] = parts;
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day).getTime();
}

export function parseDateFlexible(value?: string): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  if (/^\d+$/.test(trimmed)) {
    const numeric = Number(trimmed);
    if (!Number.isNaN(numeric)) return numeric;
  }

  const parsed = Date.parse(trimmed);
  if (!Number.isNaN(parsed)) return parsed;

  return undefined;
}
