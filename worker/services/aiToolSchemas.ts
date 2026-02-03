/**
 * AI Tool Parameter Schemas using Zod
 *
 * This file defines all AI tool parameters using Zod for type-safe validation.
 * Benefits:
 * - Single source of truth for types and validation
 * - Compile-time type safety with runtime validation
 * - Automatic TypeScript type inference
 * - Better error messages
 */

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ToolParameterSchema } from './aiToolRegistry';
import { toDateString } from './utils';

// ============================================================================
// Common Reusable Schemas
// ============================================================================

const entityIdSchema = z.string({
  required_error: 'Entity ID is required',
  invalid_type_error: 'Entity ID must be a string',
});

const projectIdSchema = z.string({
  required_error: 'Project ID is required',
  invalid_type_error: 'Project ID must be a string',
});

const taskTitleSchema = z.string({
  required_error: 'Task title is required',
}).min(1, 'Task title cannot be empty');

const reasonSchema = z.string().optional().describe('Reason for this change (optional)');

const coerceNumber = (schema: z.ZodNumber) =>
  z.preprocess((value) => {
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      if (!Number.isNaN(parsed)) return parsed;
    }
    return value;
  }, schema);

const coerceInt = (schema: z.ZodNumber) =>
  coerceNumber(schema.int());

const coerceBoolean = z.preprocess((value) => {
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (lower === 'true') return true;
    if (lower === 'false') return false;
  }
  return value;
}, z.boolean());

const coerceDateString = z.preprocess((value) => {
  if (typeof value === 'string') {
    return toDateString(value) ?? value;
  }
  return value;
}, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'));

const paginationSchema = z.object({
  page: coerceInt(z.number().min(1, 'Page number must be at least 1'))
    .optional()
    .describe('Page number (1-indexed)'),
  pageSize: coerceInt(
    z.number()
      .min(1, 'Page size must be at least 1')
      .max(100, 'Page size cannot exceed 100')
  )
    .optional()
    .describe('Items per page'),
});

// Inline task fields schema (used by multiple tool schemas)
const taskFieldsSchema = z.object({
  description: z.string().optional(),
  status: z.enum(['TODO', 'IN_PROGRESS', 'DONE'], {
    errorMap: () => ({ message: 'Status must be one of: TODO, IN_PROGRESS, DONE' }),
  }).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH'], {
    errorMap: () => ({ message: 'Priority must be one of: LOW, MEDIUM, HIGH' }),
  }).optional(),
  wbs: z.string().optional(),
  startDate: coerceDateString.optional().describe('Task start date (YYYY-MM-DD)'),
  dueDate: coerceDateString.optional().describe('Task due date (YYYY-MM-DD)'),
  completion: coerceNumber(
    z.number().min(0, 'Completion cannot be negative').max(100, 'Completion cannot exceed 100')
  ).optional(),
  assignee: z.string().optional(),
  isMilestone: coerceBoolean.optional(),
  predecessors: z.array(z.string()).optional(),
});

const taskFilterFieldsSchema = z.object({
  projectId: z.string().optional().describe('Filter by project ID'),
  status: z.enum(['TODO', 'IN_PROGRESS', 'DONE']).optional().describe('Filter by status'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional().describe('Filter by priority'),
  assignee: z.string().optional().describe('Filter by assignee'),
  isMilestone: z.boolean().optional().describe('Filter by milestone tasks'),
  startDateFrom: coerceDateString.optional().describe('Filter tasks with startDate >= this date (YYYY-MM-DD)'),
  startDateTo: coerceDateString.optional().describe('Filter tasks with startDate <= this date (YYYY-MM-DD)'),
  dueDateFrom: coerceDateString.optional().describe('Filter tasks with dueDate >= this date (YYYY-MM-DD)'),
  dueDateTo: coerceDateString.optional().describe('Filter tasks with dueDate <= this date (YYYY-MM-DD)'),
  q: z.string().optional().describe('Search query for title/description'),
});

// ============================================================================
// Tool Parameter Schemas
// ============================================================================

export const listProjectsSchema = z.object({
  // No parameters required
});

export const getProjectSchema = z.object({
  id: entityIdSchema,
});

export const listTasksSchema = z.object({
  ...taskFilterFieldsSchema.shape,
  ...paginationSchema.shape,
});

export const searchTasksSchema = listTasksSchema; // Same as listTasks

export const getTaskSchema = z.object({
  id: entityIdSchema.optional(),
  wbs: z.string().optional(),
  title: z.string().optional(),
  projectId: projectIdSchema.optional(),
}).refine(
  (data) => Boolean(data.id || data.wbs || data.title),
  { message: 'At least one of id, wbs, or title is required.' }
);

export const createProjectSchema = z.object({
  name: z.string().min(1, 'Project name cannot be empty'),
  description: z.string().optional(),
  icon: z.string().optional(),
  reason: reasonSchema,
});

export const updateProjectSchema = z.object({
  id: entityIdSchema,
  name: z.string().min(1, 'Project name cannot be empty').optional(),
  description: z.string().optional(),
  icon: z.string().optional(),
  reason: reasonSchema,
});

export const deleteProjectSchema = z.object({
  id: entityIdSchema,
  reason: reasonSchema,
});

export const createTaskSchema = z.object({
  projectId: projectIdSchema,
  title: taskTitleSchema,
  ...taskFieldsSchema.shape,
  reason: reasonSchema,
}).refine(
  (data) => {
    // Validate date range: dueDate >= startDate
    const start = data.startDate;
    const due = data.dueDate;
    if (typeof start === 'string' && typeof due === 'string') {
      return due >= start;
    }
    return true;
  },
  {
    message: 'dueDate must be greater than or equal to startDate',
    path: ['dueDate'],
  }
);

export const updateTaskSchema = z.object({
  id: entityIdSchema,
  title: taskTitleSchema.optional(),
  ...taskFieldsSchema.shape,
  reason: reasonSchema,
}).refine(
  (data) => {
    // Validate date range
    const start = data.startDate;
    const due = data.dueDate;
    if (typeof start === 'string' && typeof due === 'string') {
      return due >= start;
    }
    return true;
  },
  {
    message: 'dueDate must be greater than or equal to startDate',
    path: ['dueDate'],
  }
);

export const deleteTaskSchema = z.object({
  id: entityIdSchema,
  reason: reasonSchema,
});

export const planChangesSchema = z.object({
  projectId: projectIdSchema.optional(),
  reason: reasonSchema,
  actions: z.array(
    z.object({
      entityType: z.enum(['task', 'project'], {
        errorMap: () => ({ message: 'Entity type must be either "task" or "project"' }),
      }),
      action: z.enum(['create', 'update', 'delete'], {
        errorMap: () => ({ message: 'Action must be one of: create, update, delete' }),
      }),
      entityId: z.string().optional().describe('Optional: The ID of the entity (for update/delete). Can be exact UUID or first 8 chars.'),
      after: z.record(z.unknown()).optional().describe('The new state. Required for create/update. A flexible object with any key-value pairs.'),
    }),
    {
      required_error: 'Actions array is required',
      invalid_type_error: 'Actions must be an array',
    }
  ).min(1, 'At least one action is required'),
});

export const applyChangesSchema = z.object({
  draftId: z.string({
    required_error: 'Draft ID is required',
    invalid_type_error: 'Draft ID must be a string',
  }),
  actor: z.enum(['user', 'agent', 'system'], {
    errorMap: () => ({ message: 'Actor must be one of: user, agent, system' }),
  }).optional(),
});

// ============================================================================
// Type Inference
// ============================================================================

export type ListProjectsArgs = z.infer<typeof listProjectsSchema>;
export type GetProjectArgs = z.infer<typeof getProjectSchema>;
export type ListTasksArgs = z.infer<typeof listTasksSchema>;
export type SearchTasksArgs = z.infer<typeof searchTasksSchema>;
export type GetTaskArgs = z.infer<typeof getTaskSchema>;
export type CreateProjectArgs = z.infer<typeof createProjectSchema>;
export type UpdateProjectArgs = z.infer<typeof updateProjectSchema>;
export type DeleteProjectArgs = z.infer<typeof deleteProjectSchema>;
export type CreateTaskArgs = z.infer<typeof createTaskSchema>;
export type UpdateTaskArgs = z.infer<typeof updateTaskSchema>;
export type DeleteTaskArgs = z.infer<typeof deleteTaskSchema>;
export type PlanChangesArgs = z.infer<typeof planChangesSchema>;
export type ApplyChangesArgs = z.infer<typeof applyChangesSchema>;

// ============================================================================
// JSON Schema Conversion Helper
// ============================================================================

/**
 * Convert a Zod schema to JSON Schema for OpenAI API
 */
export function zodToJsonSchemaWrapper<T extends z.ZodTypeAny>(
  schema: T,
  description?: string
): ToolParameterSchema {
  const jsonSchema = zodToJsonSchema(schema, {
    target: 'openAi',
    definitionPath: 'definitions',
  });

  // Ensure the schema has a 'type' property for ToolParameterSchema compatibility
  // zod-to-json-schema might not always include it, so we add it explicitly
  const result = jsonSchema as ToolParameterSchema & { type?: string };

  if (!result.type) {
    // Check if it's an object schema (most common for tool parameters)
    if (schema instanceof z.ZodObject) {
      result.type = 'object';
    } else {
      // For other schema types, try to infer from zod schema
      const typeName = schema._def?.typeName;
      if (typeName === 'ZodString') result.type = 'string';
      else if (typeName === 'ZodNumber') result.type = 'number';
      else if (typeName === 'ZodBoolean') result.type = 'boolean';
      else if (typeName === 'ZodArray') result.type = 'array';
      else result.type = 'object'; // Default fallback
    }
  }

  if (description) {
    result.description = description;
  }

  return result as ToolParameterSchema;
}
