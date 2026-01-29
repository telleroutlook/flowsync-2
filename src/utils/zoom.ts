/**
 * Zoom utilities for view scaling
 */

import type { Task } from '../../types';
import { DAY_MS, GANTT_PX_PER_DAY, type GanttViewMode } from '../constants/gantt';

export type ViewMode = 'BOARD' | 'LIST' | 'GANTT';

export type ZoomState = {
  BOARD: number;
  LIST: number;
  GANTT: number;
};

export type ZoomSignature = {
  count: number;
  spanDays?: number;
};

export type ZoomMeta = {
  signature: ZoomSignature | null;
  userOverride: boolean;
};

export type ZoomMetaState = {
  BOARD: ZoomMeta;
  LIST: ZoomMeta;
  GANTT: ZoomMeta;
};

export const DEFAULT_ZOOM_STATE: ZoomState = { BOARD: 1, LIST: 1, GANTT: 1 };

export const DEFAULT_ZOOM_META: ZoomMetaState = {
  BOARD: { signature: null, userOverride: false },
  LIST: { signature: null, userOverride: false },
  GANTT: { signature: null, userOverride: false },
};

/**
 * Compute Gantt timeline range from tasks
 */
export function computeGanttTimelineRange(tasks: Task[], viewMode: GanttViewMode): { startMs: number; endMs: number } | null {
  if (tasks.length === 0) return null;

  const starts = tasks.map((task) => task.startDate ?? task.createdAt);
  const ends = tasks.map((task) => {
    const start = task.startDate ?? task.createdAt;
    const end = task.dueDate ?? start + DAY_MS;
    return end <= start ? start + DAY_MS : end;
  });

  const rawStart = Math.min(...starts);
  const rawEnd = Math.max(...ends);

  const startDate = new Date(rawStart);
  startDate.setDate(startDate.getDate() - 7);

  const endDate = new Date(rawEnd);
  endDate.setDate(endDate.getDate() + 14);

  // Align to view mode boundaries
  if (viewMode === 'Year') {
    startDate.setMonth(0, 1);
    endDate.setMonth(11, 31);
  } else if (viewMode === 'Month') {
    startDate.setDate(1);
    endDate.setMonth(endDate.getMonth() + 1, 0);
  } else if (viewMode === 'Week') {
    const day = startDate.getDay();
    startDate.setDate(startDate.getDate() - ((day + 6) % 7));
  }

  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(23, 59, 59, 999);

  return { startMs: startDate.getTime(), endMs: endDate.getTime() };
}

/**
 * Pick zoom level from available levels based on ratio
 */
export function pickZoomLevel(levels: number[], ratio: number): number {
  if (levels.length === 0) return 1;
  const [min, max] = [levels[0], levels[levels.length - 1]];
  const clamped = Math.max(min, Math.min(max, ratio));
  return levels.filter((l) => l <= clamped).pop() ?? min;
}

/**
 * Find closest zoom index for a given zoom level
 */
export function findZoomIndex(zoomLevels: number[], currentZoom: number): number {
  const exactIndex = zoomLevels.indexOf(currentZoom);
  if (exactIndex !== -1) return exactIndex;

  return zoomLevels.reduce((closestIdx, level, idx) => {
    const currentDiff = Math.abs(level - currentZoom);
    const closestDiff = Math.abs(zoomLevels[closestIdx] - currentZoom);
    return currentDiff < closestDiff ? idx : closestIdx;
  }, 0);
}

/**
 * Check if zoom signature represents a major change
 */
export function isMajorZoomChange(mode: ViewMode, prev: ZoomSignature | null, next: ZoomSignature): boolean {
  if (!prev) return true;

  const countDiff = Math.abs(next.count - prev.count);
  if (countDiff >= 3) return true;

  if (mode === 'GANTT') {
    const prevSpan = prev.spanDays ?? 0;
    const nextSpan = next.spanDays ?? 0;
    return Math.abs(nextSpan - prevSpan) >= 7;
  }

  return false;
}

/**
 * Compute zoom signature for auto-zoom
 */
export function computeZoomSignature(mode: ViewMode, activeTasks: Task[], ganttViewMode: GanttViewMode): ZoomSignature {
  const count = activeTasks.length;
  if (mode !== 'GANTT') return { count };

  const range = computeGanttTimelineRange(activeTasks, ganttViewMode);
  const spanDays = range ? Math.max(1, Math.ceil((range.endMs - range.startMs) / DAY_MS)) : 1;

  return { count, spanDays };
}
