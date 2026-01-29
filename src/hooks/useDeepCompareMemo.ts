import { useRef, useEffect, useMemo } from 'react';

type DependencyList = React.DependencyList;

/**
 * Deep comparison for dependency lists
 * Handles primitives, arrays (shallow), and plain objects (shallow)
 */
function deepEqual(a: DependencyList, b: DependencyList): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;

  for (let i = 0; i < a.length; i++) {
    const aValue = a[i];
    const bValue = b[i];

    // Primitive comparison (handles null/undefined via strict equality)
    if (aValue === bValue) continue;

    // Array comparison (shallow for performance)
    if (Array.isArray(aValue) && Array.isArray(bValue)) {
      if (aValue.length !== bValue.length) return false;
      if (aValue === bValue) continue;
      for (let j = 0; j < aValue.length; j++) {
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
}

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
export function useDeepCompareMemo<T>(factory: () => T, deps: DependencyList | undefined): T {
  const ref = useRef<DependencyList | undefined>(undefined);
  const prevDeps = ref.current;
  const dependencies = deps ?? [];

  const hasChanged = prevDeps === undefined || !deepEqual(prevDeps, dependencies);

  if (hasChanged) {
    ref.current = dependencies;
  }

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
  deps: DependencyList | undefined
): void {
  const ref = useRef<DependencyList | undefined>(undefined);
  const prevDeps = ref.current;
  const dependencies = deps ?? [];

  const hasChanged = prevDeps === undefined || !deepEqual(prevDeps, dependencies);

  if (hasChanged) {
    ref.current = dependencies;
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(callback, hasChanged ? dependencies : [false]);
}
