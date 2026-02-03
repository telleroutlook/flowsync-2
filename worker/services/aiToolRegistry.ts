/**
 * Domain-Agnostic AI Tool Registry
 *
 * This module provides a configuration-based system for defining and executing AI tools.
 * Tools are defined with their schemas and handlers, making it easy to extend the system
 * for new domains beyond just project/task management.
 *
 * Updated to use Zod for type-safe parameter validation.
 */

import type { Context } from 'hono';
import type { Bindings, Variables } from '../types';
import { PUBLIC_WORKSPACE_ID } from './workspaceService';
import { z } from 'zod';
import {
  listProjectsSchema,
  getProjectSchema,
  listTasksSchema,
  searchTasksSchema,
  getTaskSchema,
  createProjectSchema,
  updateProjectSchema,
  deleteProjectSchema,
  createTaskSchema,
  updateTaskSchema,
  deleteTaskSchema,
  planChangesSchema,
  applyChangesSchema,
  zodToJsonSchemaWrapper,
  type GetProjectArgs,
  type GetTaskArgs,
  type CreateProjectArgs,
  type UpdateProjectArgs,
  type DeleteProjectArgs,
  type CreateTaskArgs,
  type UpdateTaskArgs,
  type DeleteTaskArgs,
  type PlanChangesArgs,
} from './aiToolSchemas';

// ============================================================================
// Type Definitions
// ============================================================================

export type JsonSchema = Record<string, unknown>;

export type ToolParameterSchema = {
  type: string;
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: string[];
  minimum?: number;
  maximum?: number;
};

export type ToolCategory = 'read' | 'write' | 'action';

export type ToolDefinition = {
  name: string;
  description: string;
  parameters: ToolParameterSchema;
  handler: ToolHandler;
  category?: ToolCategory;
  // Optional: Zod schema for type-safe validation
  zodSchema?: z.ZodTypeAny;
};

export type ToolHandler = (
  context: ToolHandlerContext
) => Promise<string> | string;

export type ToolHandlerContext = {
  db: ReturnType<typeof import('../db').getDb>;
  args: Record<string, unknown>;
  toolName: string;
};

export type ToolRegistryConfig = {
  tools: ToolDefinition[];
};

// ============================================================================
// Tool Registry Class
// ============================================================================

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const normalizeValue = (schema: JsonSchema | undefined, value: unknown): unknown => {
  if (!schema || !isPlainObject(schema)) return value;
  const schemaType = typeof schema.type === 'string' ? schema.type : undefined;

  if (schemaType === 'number' && typeof value === 'string') {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) return parsed;
  }

  if (schemaType === 'boolean' && typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }

  if (schemaType === 'array' && Array.isArray(value)) {
    const itemSchema = isPlainObject(schema.items) ? schema.items : undefined;
    if (itemSchema) {
      return value.map((item) => normalizeValue(itemSchema, item));
    }
  }

  if (schemaType === 'object' && isPlainObject(value)) {
    const propertiesSchema = isPlainObject(schema.properties) ? schema.properties : undefined;
    if (!propertiesSchema) return value;
    const normalized: Record<string, unknown> = { ...value };
    for (const [key, propSchema] of Object.entries(propertiesSchema)) {
      if (key in normalized) {
        const schemaForProp = isPlainObject(propSchema) ? propSchema : undefined;
        normalized[key] = normalizeValue(schemaForProp, normalized[key]);
      }
    }
    return normalized;
  }

  return value;
};

const normalizeArgs = (schema: ToolParameterSchema, args: Record<string, unknown>): Record<string, unknown> => {
  if (schema.type !== 'object') return args;
  if (!isPlainObject(args)) return args;
  if (!isPlainObject(schema.properties)) return args;
  const normalized: Record<string, unknown> = { ...args };
  for (const [key, propSchema] of Object.entries(schema.properties)) {
    if (key in normalized) {
      const schemaForProp = isPlainObject(propSchema) ? propSchema : undefined;
      normalized[key] = normalizeValue(schemaForProp, normalized[key]);
    }
  }
  return normalized;
};

const validateValueType = (schema: JsonSchema | undefined, value: unknown): boolean => {
  if (!schema || !isPlainObject(schema)) return true;
  const schemaType = typeof schema.type === 'string' ? schema.type : undefined;
  if (!schemaType) return true;

  if (schemaType === 'string') return typeof value === 'string';
  if (schemaType === 'number') return typeof value === 'number' && !Number.isNaN(value);
  if (schemaType === 'boolean') return typeof value === 'boolean';
  if (schemaType === 'array') {
    if (!Array.isArray(value)) return false;
    const itemSchema = isPlainObject(schema.items) ? schema.items : undefined;
    if (itemSchema) {
      return value.every((item) => validateValueType(itemSchema, item));
    }
    return true;
  }
  if (schemaType === 'object') return isPlainObject(value);
  return true;
};

const validateArgs = (schema: ToolParameterSchema, args: Record<string, unknown>) => {
  if (schema.type !== 'object') {
    return { ok: true as const };
  }
  if (!isPlainObject(args)) {
    return { ok: false as const, error: 'Arguments must be an object.' };
  }

  const required = schema.required || [];
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(args, key)) {
      return { ok: false as const, error: `Missing required argument: ${key}` };
    }
  }

  if (isPlainObject(schema.properties)) {
    for (const [key, propertySchema] of Object.entries(schema.properties)) {
      if (!Object.prototype.hasOwnProperty.call(args, key)) continue;
      const value = args[key];
      const schemaForProp = isPlainObject(propertySchema) ? propertySchema : undefined;
      if (!validateValueType(schemaForProp, value)) {
        return { ok: false as const, error: `Invalid type for argument "${key}".` };
      }
      if (schemaForProp && Array.isArray(schemaForProp.enum)) {
        if (!schemaForProp.enum.includes(value)) {
          return { ok: false as const, error: `Invalid value for argument "${key}".` };
        }
      }
      if (
        schemaForProp &&
        typeof value === 'number' &&
        typeof schemaForProp.minimum === 'number' &&
        value < schemaForProp.minimum
      ) {
        return { ok: false as const, error: `Value for argument "${key}" is below minimum.` };
      }
      if (
        schemaForProp &&
        typeof value === 'number' &&
        typeof schemaForProp.maximum === 'number' &&
        value > schemaForProp.maximum
      ) {
        return { ok: false as const, error: `Value for argument "${key}" exceeds maximum.` };
      }
    }
  }

  // Note: Date range validation (startDate/dueDate) is now handled by Zod schemas
  // This fallback validation is kept for backward compatibility with tools not yet migrated

  return { ok: true as const };
};

// ============================================================================
// Zod Validation Helper (for type-safe tools)
// ============================================================================

/**
 * Validate arguments using a Zod schema
 * Returns normalized, validated data or an error message
 */
function validateWithZod<T extends z.ZodTypeAny>(
  schema: T,
  args: Record<string, unknown>
): { ok: true; data: z.infer<T> } | { ok: false; error: string } {
  try {
    const data = schema.parse(args);
    return { ok: true, data };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const formattedError = error.errors
        .map((e) => `${e.path.join('.')}: ${e.message}`)
        .join(', ');
      return { ok: false, error: formattedError || 'Validation failed' };
    }
    return { ok: false, error: 'Validation error' };
  }
}

class AIToolRegistry {
  private tools = new Map<string, ToolDefinition>();
  private toolsByCategory = new Map<string, ToolDefinition[]>();

  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
    const category = tool.category || 'action';
    if (!this.toolsByCategory.has(category)) {
      this.toolsByCategory.set(category, []);
    }
    this.toolsByCategory.get(category)?.push(tool);
  }

  registerAll(tools: ToolDefinition[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  getByCategory(category: string): ToolDefinition[] {
    return this.toolsByCategory.get(category) || [];
  }

  getOpenAITools(options?: { categories?: ToolCategory[] }): Array<{ type: 'function'; function: { name: string; description?: string; parameters: JsonSchema } }> {
    const categories = options?.categories;
    const toolList = categories
      ? this.getAll().filter((tool) => categories.includes(tool.category || 'action'))
      : this.getAll();
    return toolList.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  async execute(toolName: string, context: ToolHandlerContext): Promise<string> {
    const tool = this.get(toolName);
    if (!tool) {
      return `Unknown tool: ${toolName}`;
    }
    try {
      // Use Zod validation if available, otherwise fall back to legacy validation
      let validatedArgs: Record<string, unknown>;

      if (tool.zodSchema) {
        const zodValidation = validateWithZod(tool.zodSchema, context.args);
        if (!zodValidation.ok) {
          return `Error: ${zodValidation.error}`;
        }
        validatedArgs = zodValidation.data as Record<string, unknown>;
      } else {
        // Legacy validation path
        const normalizedArgs = normalizeArgs(tool.parameters, context.args);
        const validation = validateArgs(tool.parameters, normalizedArgs);
        if (!validation.ok) {
          return `Error: ${validation.error}`;
        }
        validatedArgs = normalizedArgs;
      }

      return await tool.handler({ ...context, args: validatedArgs });
    } catch (error) {
      return `Error: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}

// ============================================================================
// Default Tool Definitions for Project/Task Domain
// ============================================================================

function createDefaultTools<TVariables extends Variables>(
  c: Context<{ Bindings: Bindings; Variables: TVariables }>
): ToolDefinition[] {
  const workspaceId = c.get('workspace')?.id ?? PUBLIC_WORKSPACE_ID;
  return [
    // Read-only tools - Always start with these to understand context
    {
      name: 'listProjects',
      description: 'List ALL available projects to show the user what projects exist. Use this FIRST when the user asks about projects or wants to work with tasks without specifying a project.',
      parameters: zodToJsonSchemaWrapper(listProjectsSchema),
      zodSchema: listProjectsSchema,
      category: 'read',
      handler: async ({ db }) => {
        const { projects } = await import('../db/schema');
        const { eq } = await import('drizzle-orm');
        const projectRows = await db
          .select({ id: projects.id, name: projects.name, description: projects.description })
          .from(projects)
          .where(eq(projects.workspaceId, workspaceId));
        return JSON.stringify({ success: true, data: projectRows });
      },
    },
    {
      name: 'getProject',
      description: 'Get detailed information about a SPECIFIC project by its ID. Use this after listProjects when the user wants details about a particular project.',
      parameters: zodToJsonSchemaWrapper(getProjectSchema),
      zodSchema: getProjectSchema,
      category: 'read',
      handler: async ({ db, args }) => {
        const { projects } = await import('../db/schema');
        const { and, eq } = await import('drizzle-orm');
        // Type-safe access thanks to Zod
        const { id } = args as GetProjectArgs;
        const projectList = await db
          .select()
          .from(projects)
          .where(and(eq(projects.id, id), eq(projects.workspaceId, workspaceId)))
          .limit(1);
        if (projectList.length === 0) {
          return JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: 'Project not found' } });
        }
        return JSON.stringify({ success: true, data: projectList[0] });
      },
    },
    {
      name: 'listTasks',
      description: 'List tasks with filters. Use this to show tasks to the user, analyze project state, or understand task distribution. Supports filtering by status, priority, assignee, dates, and keyword search.',
      parameters: zodToJsonSchemaWrapper(listTasksSchema),
      zodSchema: listTasksSchema,
      category: 'read',
      handler: async ({ db, args }) => {
        const { tasks, projects } = await import('../db/schema');
        const { and, eq, gte, lte, like, or, sql } = await import('drizzle-orm');
        const { toTaskRecord } = await import('../services/serializers');

        const conditions = [];
        if (args.projectId) {
          conditions.push(eq(tasks.projectId, String(args.projectId)));
        }
        if (args.status) {
          conditions.push(eq(tasks.status, String(args.status)));
        }
        if (args.priority) {
          conditions.push(eq(tasks.priority, String(args.priority)));
        }
        if (args.assignee) {
          conditions.push(eq(tasks.assignee, String(args.assignee)));
        }
        if (typeof args.isMilestone === 'boolean') {
          conditions.push(eq(tasks.isMilestone, args.isMilestone));
        }
        if (typeof args.startDateFrom === 'number') {
          conditions.push(gte(tasks.startDate, args.startDateFrom));
        }
        if (typeof args.startDateTo === 'number') {
          conditions.push(lte(tasks.startDate, args.startDateTo));
        }
        if (typeof args.dueDateFrom === 'number') {
          conditions.push(gte(tasks.dueDate, args.dueDateFrom));
        }
        if (typeof args.dueDateTo === 'number') {
          conditions.push(lte(tasks.dueDate, args.dueDateTo));
        }
        if (args.q) {
          const query = `%${String(args.q)}%`;
          conditions.push(
            or(
              like(tasks.title, query),
              like(sql`coalesce(${tasks.description}, '')`, query)
            )
          );
        }

        const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
        const workspaceClause = eq(projects.workspaceId, workspaceId);
        const combinedClause = whereClause ? and(whereClause, workspaceClause) : workspaceClause;
        const page = typeof args.page === 'number' ? Math.max(1, args.page) : 1;
        const pageSize = typeof args.pageSize === 'number' ? Math.min(100, Math.max(1, args.pageSize)) : 50;
        const offset = (page - 1) * pageSize;

        const taskList = await db
          .select()
          .from(tasks)
          .innerJoin(projects, eq(tasks.projectId, projects.id))
          .where(combinedClause)
          .limit(pageSize)
          .offset(offset);
        const totalCountRows = await db
          .select({ count: sql<number>`count(*)` })
          .from(tasks)
          .innerJoin(projects, eq(tasks.projectId, projects.id))
          .where(combinedClause);
        const totalCount = totalCountRows[0]?.count ?? 0;

        return JSON.stringify({
          success: true,
          data: taskList.map((row) => toTaskRecord(row.tasks)),
          total: totalCount,
          page,
          pageSize,
        });
      },
    },
    {
      name: 'searchTasks',
      description: 'Search for EXISTING tasks before creating or updating. CRITICAL: ALWAYS call this FIRST when the user mentions a task by title or keyword to find if it already exists. Supports the same filters as listTasks.',
      parameters: zodToJsonSchemaWrapper(searchTasksSchema),
      zodSchema: searchTasksSchema,
      category: 'read',
      // Reuse listTasks handler - they are functionally identical
      handler: async ({ db, args }) => {
        const { tasks, projects } = await import('../db/schema');
        const { and, eq, gte, lte, like, or, sql } = await import('drizzle-orm');
        const { toTaskRecord } = await import('../services/serializers');

        const conditions = [];
        if (args.projectId) {
          conditions.push(eq(tasks.projectId, String(args.projectId)));
        }
        if (args.status) {
          conditions.push(eq(tasks.status, String(args.status)));
        }
        if (args.priority) {
          conditions.push(eq(tasks.priority, String(args.priority)));
        }
        if (args.assignee) {
          conditions.push(eq(tasks.assignee, String(args.assignee)));
        }
        if (typeof args.isMilestone === 'boolean') {
          conditions.push(eq(tasks.isMilestone, args.isMilestone));
        }
        if (typeof args.startDateFrom === 'number') {
          conditions.push(gte(tasks.startDate, args.startDateFrom));
        }
        if (typeof args.startDateTo === 'number') {
          conditions.push(lte(tasks.startDate, args.startDateTo));
        }
        if (typeof args.dueDateFrom === 'number') {
          conditions.push(gte(tasks.dueDate, args.dueDateFrom));
        }
        if (typeof args.dueDateTo === 'number') {
          conditions.push(lte(tasks.dueDate, args.dueDateTo));
        }
        if (args.q) {
          const query = `%${String(args.q)}%`;
          conditions.push(
            or(
              like(tasks.title, query),
              like(sql`coalesce(${tasks.description}, '')`, query)
            )
          );
        }

        const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
        const workspaceClause = eq(projects.workspaceId, workspaceId);
        const combinedClause = whereClause ? and(whereClause, workspaceClause) : workspaceClause;
        const page = typeof args.page === 'number' ? Math.max(1, args.page) : 1;
        const pageSize = typeof args.pageSize === 'number' ? Math.min(100, Math.max(1, args.pageSize)) : 50;
        const offset = (page - 1) * pageSize;

        const taskList = await db
          .select()
          .from(tasks)
          .innerJoin(projects, eq(tasks.projectId, projects.id))
          .where(combinedClause)
          .limit(pageSize)
          .offset(offset);
        const totalCountRows = await db
          .select({ count: sql<number>`count(*)` })
          .from(tasks)
          .innerJoin(projects, eq(tasks.projectId, projects.id))
          .where(combinedClause);
        const totalCount = totalCountRows[0]?.count ?? 0;

        return JSON.stringify({
          success: true,
          data: taskList.map((row) => toTaskRecord(row.tasks)),
          total: totalCount,
          page,
          pageSize,
        });
      },
    },
    {
      name: 'getTask',
      description: 'Get COMPLETE details of a SPECIFIC task by its ID. Use this before updating a task to see its current values. ALWAYS call getTask before updateTask to understand what you are changing.',
      parameters: zodToJsonSchemaWrapper(getTaskSchema),
      zodSchema: getTaskSchema,
      category: 'read',
      handler: async ({ db, args }) => {
        const { tasks, projects } = await import('../db/schema');
        const { and, eq } = await import('drizzle-orm');
        const { toTaskRecord } = await import('../services/serializers');
        // Type-safe access thanks to Zod
        const { id } = args as GetTaskArgs;
        const taskList = await db
          .select()
          .from(tasks)
          .innerJoin(projects, eq(tasks.projectId, projects.id))
          .where(and(eq(tasks.id, id), eq(projects.workspaceId, workspaceId)))
          .limit(1);
        if (taskList.length === 0) {
          return JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: 'Task not found' } });
        }
        const taskRow = taskList[0];
        if (!taskRow) {
          return JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: 'Task not found' } });
        }
        return JSON.stringify({ success: true, data: toTaskRecord(taskRow.tasks) });
      },
    },

    // Write tools - These create DRAFTS that require user approval
    {
      name: 'createProject',
      description: 'Create a NEW project. This creates a DRAFT that requires user approval before taking effect. Only use when the user wants to create an entirely new project.',
      parameters: zodToJsonSchemaWrapper(createProjectSchema),
      zodSchema: createProjectSchema,
      category: 'write',
      handler: async ({ args }) => {
        // Type-safe access thanks to Zod
        const { name, description, icon } = args as CreateProjectArgs;
        const actions = [{
          entityType: 'project' as const,
          action: 'create' as const,
          after: { name, description, icon },
        }];
        const summary = actions.map(a => `${a.action} ${a.entityType}`).join(', ');
        return JSON.stringify({
          success: true,
          message: `Draft created with ${actions.length} action(s): ${summary}. Awaiting user approval.`,
          actions,
        });
      },
    },
    {
      name: 'updateProject',
      description: 'Update an EXISTING project. This creates a DRAFT that requires user approval. Use getProject FIRST to see current values before updating.',
      parameters: zodToJsonSchemaWrapper(updateProjectSchema),
      zodSchema: updateProjectSchema,
      category: 'write',
      handler: async ({ args }) => {
        // Type-safe access thanks to Zod
        const { id, name, description, icon } = args as UpdateProjectArgs;
        const actions = [{
          entityType: 'project' as const,
          action: 'update' as const,
          entityId: id,
          after: { name, description, icon },
        }];
        const summary = actions.map(a => `${a.action} ${a.entityType}(${id})`).join(', ');
        return JSON.stringify({
          success: true,
          message: `Draft created with ${actions.length} action(s): ${summary}. Awaiting user approval.`,
          actions,
        });
      },
    },
    {
      name: 'deleteProject',
      description: 'Delete a project and ALL its tasks. This creates a DRAFT that requires user approval. WARNING: This is destructive - confirm with the user before using.',
      parameters: zodToJsonSchemaWrapper(deleteProjectSchema),
      zodSchema: deleteProjectSchema,
      category: 'write',
      handler: async ({ args }) => {
        // Type-safe access thanks to Zod
        const { id } = args as DeleteProjectArgs;
        const actions = [{
          entityType: 'project' as const,
          action: 'delete' as const,
          entityId: id,
        }];
        const summary = actions.map(a => `${a.action} ${a.entityType}(${id})`).join(', ');
        return JSON.stringify({
          success: true,
          message: `Draft created with ${actions.length} action(s): ${summary}. Awaiting user approval.`,
          actions,
        });
      },
    },
    {
      name: 'createTask',
      description: 'Create a NEW task that does NOT exist yet. CRITICAL RULE: You MUST call searchTasks FIRST to verify the task does not exist. If the user says "this task" or refers to an existing task, use updateTask instead. Creates a DRAFT requiring approval.',
      parameters: zodToJsonSchemaWrapper(createTaskSchema),
      zodSchema: createTaskSchema,
      category: 'write',
      handler: async ({ args }) => {
        // Type-safe access thanks to Zod
        const { projectId, title, description, status, priority, wbs, startDate, dueDate, completion, assignee, isMilestone, predecessors } = args as CreateTaskArgs;
        const actions = [{
          entityType: 'task' as const,
          action: 'create' as const,
          after: {
            projectId, title, description, status, priority, wbs,
            startDate, dueDate, completion, assignee, isMilestone, predecessors,
          },
        }];
        const summary = actions.map(a => `${a.action} ${a.entityType}`).join(', ');
        return JSON.stringify({
          success: true,
          message: `Draft created with ${actions.length} action(s): ${summary}. Awaiting user approval.`,
          actions,
        });
      },
    },
    {
      name: 'updateTask',
      description: 'Update an EXISTING task. Use when the user says "this task", "the task", or wants to change attributes of a task they mentioned. CRITICAL: ALWAYS call getTask FIRST to see current values. Creates a DRAFT requiring approval.',
      parameters: zodToJsonSchemaWrapper(updateTaskSchema),
      zodSchema: updateTaskSchema,
      category: 'write',
      handler: async ({ args }) => {
        // Type-safe access thanks to Zod
        const { id, title, description, status, priority, wbs, startDate, dueDate, completion, assignee, isMilestone, predecessors } = args as UpdateTaskArgs;
        const actions = [{
          entityType: 'task' as const,
          action: 'update' as const,
          entityId: id,
          after: {
            title, description, status, priority, wbs,
            startDate, dueDate, completion, assignee, isMilestone, predecessors,
          },
        }];
        const summary = actions.map(a => `${a.action} ${a.entityType}(${id})`).join(', ');
        return JSON.stringify({
          success: true,
          message: `Draft created with ${actions.length} action(s): ${summary}. Awaiting user approval.`,
          actions,
        });
      },
    },
    {
      name: 'deleteTask',
      description: 'Delete a task permanently. Creates a DRAFT that requires user approval. WARNING: Destructive action - use updateTask to set status to DONE instead if appropriate.',
      parameters: zodToJsonSchemaWrapper(deleteTaskSchema),
      zodSchema: deleteTaskSchema,
      category: 'write',
      handler: async ({ args }) => {
        // Type-safe access thanks to Zod
        const { id } = args as DeleteTaskArgs;
        const actions = [{
          entityType: 'task' as const,
          action: 'delete' as const,
          entityId: id,
        }];
        const summary = actions.map(a => `${a.action} ${a.entityType}(${id})`).join(', ');
        return JSON.stringify({
          success: true,
          message: `Draft created with ${actions.length} action(s): ${summary}. Awaiting user approval.`,
          actions,
        });
      },
    },
    {
      name: 'planChanges',
      description: 'Create MULTIPLE related changes in a SINGLE draft for batch approval. Use this when making several task/project changes together that should be approved as a group. More efficient than multiple individual create/update/delete calls.\n\nFor UPDATE and DELETE actions, you can provide EITHER:\n1. entityId (exact UUID or first 8 characters)\n2. Title in the after object (system will match by title)\n3. WBS code in the after object\n\nThe system uses intelligent matching to find the correct entity even with partial information.',
      parameters: zodToJsonSchemaWrapper(planChangesSchema),
      zodSchema: planChangesSchema,
      category: 'write',
      handler: async ({ args }) => {
        // Type-safe access thanks to Zod
        const { actions } = args as PlanChangesArgs;
        const summary = actions.map((action) => {
          const type = action.entityType;
          const op = action.action;
          const title = action.after?.title;
          const id = action.entityId ||
                    (typeof title === 'string' ? `"${title}"` : 'new');
          return `${op} ${type}(${id})`;
        }).join(', ');
        return JSON.stringify({
          success: true,
          message: `Draft created with ${actions.length} action(s): ${summary}. Awaiting user approval.`,
          actions,
        });
      },
    },

    // Action tools - Execute drafts
    {
      name: 'applyChanges',
      description: 'Apply a previously created draft by its ID. This executes the draft actions. Only use when the user explicitly approves or says "apply", "approve", "confirm".',
      parameters: zodToJsonSchemaWrapper(applyChangesSchema),
      zodSchema: applyChangesSchema,
      category: 'action',
      handler: async () => {
        return JSON.stringify({ success: true, message: 'Draft applied successfully.' });
      },
    },
  ];
}

// ============================================================================
// Factory Function
// ============================================================================

export function createToolRegistry<TVariables extends Variables>(
  c: Context<{ Bindings: Bindings; Variables: TVariables }>,
  additionalTools?: ToolDefinition[]
): AIToolRegistry {
  const registry = new AIToolRegistry();
  const defaultTools = createDefaultTools(c);
  registry.registerAll(defaultTools);
  if (additionalTools) {
    registry.registerAll(additionalTools);
  }
  return registry;
}
