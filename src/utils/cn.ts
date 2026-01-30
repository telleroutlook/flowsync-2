import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  // Disable twMerge for now to prevent it from removing custom color classes
  // TODO: Configure twMerge properly to recognize custom Tailwind theme colors
  return clsx(inputs)
}
