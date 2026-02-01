import { clsx, type ClassValue } from "clsx"

/**
 * Combines class names using clsx.
 *
 * Note: twMerge is disabled to prevent it from removing custom color classes.
 * For production, consider configuring twMerge to recognize custom Tailwind theme colors
 * or use a different approach for class merging.
 *
 * @param inputs - Class values to combine (strings, objects, arrays)
 * @returns Combined class string
 */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}
