import { useRef, useEffect, useMemo } from 'react';

/**
 * Hook for deep comparison in useMemo to prevent unnecessary recalculations
 * Useful when dealing with array/object dependencies that change reference frequently
 *
 * @param factory - Function to compute the memoized value
 * @param deps - Dependencies to deeply compare
 * @returns The memoized value
 *
 * @example
 * const memoizedValue = useDeepCompareMemo(() => expensiveCalculation(data), [data]);
 */
export function useDeepCompareMemo<T>(factory: () => T, deps: React.DependencyList | undefined): T {
  const ref = useRef<React.DependencyList | undefined>(undefined);
  const prevDeps = ref.current;

  // Default to empty array if undefined
  const dependencies = deps ?? [];

  // Deep comparison function
  const deepEqual = (a: React.DependencyList, b: React.DependencyList): boolean => {
    if (a === b) return true;
    if (a.length !== b.length) return false;

    for (let i = 0; i < a.length; i += 1) {
      const aValue = a[i];
      const bValue = b[i];

      // Primitive comparison
      if (aValue === bValue) continue;

      // Handle null/undefined
      if (aValue == null || bValue == null) {
        if (aValue !== bValue) return false;
        continue;
      }

      // Array comparison
      if (Array.isArray(aValue) && Array.isArray(bValue)) {
        if (aValue.length !== bValue.length) return false;
        // For arrays, compare references first, then shallow compare contents
        if (aValue === bValue) continue;
        for (let j = 0; j < aValue.length; j += 1) {
          if (aValue[j] !== bValue[j]) return false;
        }
        continue;
      }

      // Object comparison (shallow)
      if (typeof aValue === 'object' && typeof bValue === 'object') {
        const aKeys = Object.keys(aValue);
        const bKeys = Object.keys(bValue);
        if (aKeys.length !== bKeys.length) return false;
        for (const key of aKeys) {
          if (aValue[key as keyof object] !== bValue[key as keyof object]) return false;
        }
        continue;
      }

      return false;
    }

    return true;
  };

  // Check if dependencies have deeply changed
  const hasChanged = prevDeps === undefined || !deepEqual(prevDeps, dependencies);

  // Update ref if changed
  if (hasChanged) {
    ref.current = dependencies;
  }

  // Use useMemo with the equality check
  return useMemo(factory, hasChanged ? dependencies : [false]); // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * Hook for deep comparison in useEffect
 * Useful when you want to run an effect only when deep dependencies change
 *
 * @param callback - The effect callback
 * @param deps - Dependencies to deeply compare
 */
export function useDeepCompareEffect(
  callback: React.EffectCallback,
  deps: React.DependencyList | undefined
): void {
  const ref = useRef<React.DependencyList | undefined>(undefined);
  const prevDeps = ref.current;

  // Default to empty array if undefined
  const dependencies = deps ?? [];

  // Deep comparison function
  const deepEqual = (a: React.DependencyList, b: React.DependencyList): boolean => {
    if (a === b) return true;
    if (a.length !== b.length) return false;

    for (let i = 0; i < a.length; i += 1) {
      const aValue = a[i];
      const bValue = b[i];

      // Primitive comparison
      if (aValue === bValue) continue;

      // Handle null/undefined
      if (aValue == null || bValue == null) {
        if (aValue !== bValue) return false;
        continue;
      }

      // Array comparison (shallow for performance)
      if (Array.isArray(aValue) && Array.isArray(bValue)) {
        if (aValue.length !== bValue.length) return false;
        if (aValue === bValue) continue;
        for (let j = 0; j < aValue.length; j += 1) {
          if (aValue[j] !== bValue[j]) return false;
        }
        continue;
      }

      // Object comparison (shallow)
      if (typeof aValue === 'object' && typeof bValue === 'object') {
        const aKeys = Object.keys(aValue);
        const bKeys = Object.keys(bValue);
        if (aKeys.length !== bKeys.length) return false;
        for (const key of aKeys) {
          if (aValue[key as keyof object] !== bValue[key as keyof object]) return false;
        }
        continue;
      }

      return false;
    }

    return true;
  };

  // Check if dependencies have deeply changed
  const hasChanged = prevDeps === undefined || !deepEqual(prevDeps, dependencies);

  // Update ref if changed
  if (hasChanged) {
    ref.current = dependencies;
  }

  // Only run effect if dependencies deeply changed
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(callback, hasChanged ? dependencies : [false]);
}
