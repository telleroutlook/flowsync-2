/**
 * Unit tests for taskReferenceParser
 *
 * Phase 1: Test pure functions (no database required)
 * Phase 2: Add integration tests with mocked database
 */

import { describe, it, expect } from 'vitest';
import {
  parseTaskReference,
  formatTaskReference,
  createNotFoundError,
  CONFIDENCE,
} from './taskReferenceParser';

describe('taskReferenceParser', () => {
  describe('parseTaskReference', () => {
    it('parses full UUID string', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const result = parseTaskReference(uuid);

      expect(result).toEqual({
        id: uuid,
        wbs: undefined,
        title: undefined,
        projectId: '',
      });
    });

    it('parses truncated UUID string', () => {
      const truncatedId = '550e8400';
      const result = parseTaskReference(truncatedId);

      expect(result).toEqual({
        id: truncatedId,
        wbs: undefined,
        title: undefined,
        projectId: '',
      });
    });

    it('parses WBS from string format', () => {
      const result = parseTaskReference('Task T1.2');

      expect(result).toEqual({
        id: undefined,
        wbs: '1.2',
        title: undefined,
        projectId: '',
      });
    });

    it('parses WBS from simple format', () => {
      const result = parseTaskReference('T1.2.3');

      expect(result).toEqual({
        id: undefined,
        wbs: '1.2.3',
        title: undefined,
        projectId: '',
      });
    });

    it('parses object with id and wbs', () => {
      const result = parseTaskReference({
        id: '550e8400-e29b-41d4-a716-446655440000',
        wbs: '1.1',
        projectId: 'proj-123',
      });

      expect(result).toEqual({
        id: '550e8400-e29b-41d4-a716-446655440000',
        wbs: '1.1',
        title: undefined,
        projectId: 'proj-123',
      });
    });

    it('parses object with title', () => {
      const result = parseTaskReference({
        title: 'Implement feature',
        projectId: 'proj-123',
      });

      expect(result).toEqual({
        id: undefined,
        wbs: undefined,
        title: 'Implement feature',
        projectId: 'proj-123',
      });
    });

    it('handles empty object', () => {
      const result = parseTaskReference({});

      expect(result).toEqual({
        id: undefined,
        wbs: undefined,
        title: undefined,
        projectId: '',
      });
    });

    it('handles null input', () => {
      const result = parseTaskReference(null);

      expect(result).toEqual({
        id: undefined,
        wbs: undefined,
        title: undefined,
        projectId: '',
      });
    });

    it('treats non-ID string as title', () => {
      const result = parseTaskReference('Implement feature');

      expect(result).toEqual({
        id: undefined,
        wbs: undefined,
        title: 'Implement feature',
        projectId: '',
      });
    });
  });

  describe('formatTaskReference', () => {
    it('formats task with WBS and ID', () => {
      const task = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        wbs: '1.2',
        projectId: 'proj-123',
        title: 'Test Task',
      } as any;

      const result = formatTaskReference(task);

      expect(result).toBe('WBS: 1.2, ID: 550e8400-e29b-41d4-a716-446655440000');
    });

    it('formats task with only ID', () => {
      const task = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        projectId: 'proj-123',
        title: 'Test Task',
      } as any;

      const result = formatTaskReference(task);

      expect(result).toBe('ID: 550e8400-e29b-41d4-a716-446655440000');
    });

    it('handles empty WBS', () => {
      const task = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        wbs: '',
        projectId: 'proj-123',
        title: 'Test Task',
      } as any;

      const result = formatTaskReference(task);

      expect(result).toBe('ID: 550e8400-e29b-41d4-a716-446655440000');
    });
  });

  describe('createNotFoundError', () => {
    it('creates error with ID only', () => {
      const ref = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        projectId: 'proj-123',
      };

      const result = createNotFoundError(ref);

      expect(result).toBe(
        'Task not found using: ID (550e8400-e29b-41d4-a716-446655440000). Please verify the task exists in this project.'
      );
    });

    it('creates error with truncated ID', () => {
      const ref = {
        id: '550e8400',
        projectId: 'proj-123',
      };

      const result = createNotFoundError(ref);

      expect(result).toBe(
        'Task not found using: ID (550e8400...). Please verify the task exists in this project.'
      );
    });

    it('creates error with WBS only', () => {
      const ref = {
        wbs: '1.2',
        projectId: 'proj-123',
      };

      const result = createNotFoundError(ref);

      expect(result).toBe(
        'Task not found using: WBS (1.2). Please verify the task exists in this project.'
      );
    });

    it('creates error with title only', () => {
      const ref = {
        title: 'Implement feature',
        projectId: 'proj-123',
      };

      const result = createNotFoundError(ref);

      expect(result).toBe(
        'Task not found using: title ("Implement feature"). Please verify the task exists in this project.'
      );
    });

    it('creates error with ID and WBS (dual identifier)', () => {
      const ref = {
        id: '550e8400',
        wbs: '1.2',
        projectId: 'proj-123',
      };

      const result = createNotFoundError(ref);

      expect(result).toBe(
        'Task not found using: ID (550e8400...), WBS (1.2). Please verify the task exists in this project.'
      );
    });

    it('creates error with all identifiers', () => {
      const ref = {
        id: '550e8400',
        wbs: '1.2',
        title: 'Implement feature',
        projectId: 'proj-123',
      };

      const result = createNotFoundError(ref);

      expect(result).toBe(
        'Task not found using: ID (550e8400...), WBS (1.2), title ("Implement feature"). Please verify the task exists in this project.'
      );
    });

    it('creates error with no identifiers', () => {
      const ref = {
        projectId: 'proj-123',
      };

      const result = createNotFoundError(ref);

      expect(result).toBe(
        'Task not found using: . Please verify the task exists in this project.'
      );
    });
  });

  describe('CONFIDENCE constants', () => {
    it('has correct confidence values', () => {
      expect(CONFIDENCE.FULL_ID).toBe(1.0);
      expect(CONFIDENCE.WBS).toBe(0.95);
      expect(CONFIDENCE.TRUNCATED_ID).toBe(0.9);
      expect(CONFIDENCE.TITLE_EXACT).toBe(0.9);
      expect(CONFIDENCE.FUZZY_MATCH).toBe(0.7);
    });

    it('ensures WBS has higher priority than truncated ID', () => {
      expect(CONFIDENCE.WBS).toBeGreaterThan(CONFIDENCE.TRUNCATED_ID);
    });

    it('ensures full ID has highest confidence', () => {
      expect(CONFIDENCE.FULL_ID).toBeGreaterThanOrEqual(CONFIDENCE.WBS);
      expect(CONFIDENCE.FULL_ID).toBeGreaterThanOrEqual(CONFIDENCE.TRUNCATED_ID);
      expect(CONFIDENCE.FULL_ID).toBeGreaterThanOrEqual(CONFIDENCE.TITLE_EXACT);
      expect(CONFIDENCE.FULL_ID).toBeGreaterThanOrEqual(CONFIDENCE.FUZZY_MATCH);
    });
  });
});

/**
 * TODO: Phase 2 - Integration tests
 *
 * Add tests for resolveTaskReference with mocked database:
 *
 * describe('resolveTaskReference', () => {
 *   it('prioritizes ID match over WBS', async () => {
 *     // Test that ID is tried first
 *   });
 *
 *   it('falls back to WBS when ID fails', async () => {
 *     // Test cascading fallback
 *   });
 *
 *   it('matches by WBS only', async () => {
 *     // Test WBS-only reference
 *   });
 *
 *   it('returns null when no match found', async () => {
 *     // Test failure case
 *   });
 * });
 */
