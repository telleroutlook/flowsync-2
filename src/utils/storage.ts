/**
 * Shared localStorage utilities with error handling
 * All operations safely fail when localStorage is unavailable (e.g., in SSR or private browsing)
 */

const STORAGE_PREFIX = 'flowsync:';

const getFullKey = (key: string): string => `${STORAGE_PREFIX}${key}`;

export function storageGet(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(getFullKey(key));
  } catch {
    return null;
  }
}

export function storageSet(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(getFullKey(key), value);
  } catch {
    // Silently fail - storage may be unavailable or quota exceeded
  }
}

export function storageRemove(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(getFullKey(key));
  } catch {
    // Silently fail
  }
}

export function storageGetJSON<T>(key: string, fallback: T): T {
  const value = storageGet(key);
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function storageSetJSON<T>(key: string, value: T): void {
  storageSet(key, JSON.stringify(value));
}
