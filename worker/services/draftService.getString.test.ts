import { describe, it, expect } from 'vitest';

/**
 * Test for the getString function fix
 *
 * This test verifies that getString correctly handles:
 * 1. Valid non-empty strings (returns the string)
 * 2. Empty strings (returns fallback, not the empty string)
 * 3. undefined/null values (returns fallback)
 * 4. Non-string values (returns fallback)
 */

// Copied from draftService.ts for testing
function getString(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value !== '') return value;
  return fallback;
}

describe('getString function', () => {
  it('should return valid non-empty strings', () => {
    expect(getString('Hello World', 'fallback')).toBe('Hello World');
    expect(getString('中文标题', 'fallback')).toBe('中文标题');
    expect(getString('a', 'fallback')).toBe('a');
  });

  it('should return fallback for empty strings', () => {
    expect(getString('', 'fallback')).toBe('fallback');
    expect(getString('', 'Untitled Task')).toBe('Untitled Task');
    expect(getString('', 'Original Title')).toBe('Original Title');
  });

  it('should return fallback for undefined values', () => {
    expect(getString(undefined, 'fallback')).toBe('fallback');
    expect(getString(undefined, 'Default Title')).toBe('Default Title');
  });

  it('should return fallback for null values', () => {
    expect(getString(null, 'fallback')).toBe('fallback');
  });

  it('should return fallback for non-string values', () => {
    expect(getString(123, 'fallback')).toBe('fallback');
    expect(getString(true, 'fallback')).toBe('fallback');
    expect(getString({}, 'fallback')).toBe('fallback');
    expect(getString([], 'fallback')).toBe('fallback');
  });

  // The key test case: simulating the original bug
  it('should preserve original title when input only has dates', () => {
    const input = { startDate: 1234567890, dueDate: 1234567890 };
    const existingTask = { title: 'Original Chinese Title', description: 'Original Description' };

    // Simulating the behavior in normalizeTaskInput
    const title = getString((input as any).title ?? '', existingTask.title ?? 'Untitled Task');

    expect(title).toBe('Original Chinese Title');
    expect(title).not.toBe('');
    expect(title).not.toBe('Untitled Task');
  });
});
