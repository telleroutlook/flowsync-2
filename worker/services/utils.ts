export const now = () => Date.now();

export const todayDateString = () => new Date().toISOString().slice(0, 10);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const isDateString = (value?: string | null): value is string =>
  typeof value === 'string' && DATE_RE.test(value);

export const toDateString = (value?: string | null): string | undefined => {
  if (value === null || value === undefined) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (DATE_RE.test(trimmed)) return trimmed;
  return undefined;
};

export const dateStringToMs = (value: string): number => {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return NaN;
  return Date.UTC(year, month - 1, day);
};

export const addDays = (value: string, days: number): string => {
  const ms = dateStringToMs(value) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
};

// Re-export generateId from utils for consistency
// Note: In worker context, use Web crypto API
export const generateId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2, 11);
};

export const safeJsonParse = <T>(value: string | null | undefined, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

export const clampNumber = (value: number | undefined, min: number, max: number) => {
  if (value === undefined || Number.isNaN(value)) return undefined;
  return Math.min(max, Math.max(min, value));
};
