import { ArrowDown, Minus, AlertTriangle, type LucideIcon } from 'lucide-react';
import { Priority } from '../../types';

/**
 * Priority icons mapping
 * Maps each priority level to its corresponding icon component
 */
export const PRIORITY_ICONS: Record<Priority, LucideIcon> = {
  [Priority.LOW]: ArrowDown,
  [Priority.MEDIUM]: Minus,
  [Priority.HIGH]: AlertTriangle,
} as const;
