/**
 * Shared Gantt Chart constants
 * Centralized to avoid duplication between App.tsx and GanttChart.tsx
 */

export type GanttViewMode = 'Day' | 'Week' | 'Month' | 'Year';

export const DAY_MS = 86400000;

export const GANTT_PX_PER_DAY: Record<GanttViewMode, number> = {
  Day: 60,
  Week: 30,
  Month: 10,
  Year: 1.5,
} as const;

export const GANTT_VIEW_SETTINGS: Record<GanttViewMode, {
  pxPerDay: number;
  tickLabelFormat: Intl.DateTimeFormatOptions;
}> = {
  Day: { pxPerDay: 60, tickLabelFormat: { year: 'numeric', month: 'short', day: 'numeric' } },
  Week: { pxPerDay: 30, tickLabelFormat: { year: 'numeric', month: 'short', day: 'numeric' } },
  Month: { pxPerDay: 10, tickLabelFormat: { month: 'long', year: 'numeric' } },
  Year: { pxPerDay: 1.5, tickLabelFormat: { year: 'numeric' } },
} as const;
