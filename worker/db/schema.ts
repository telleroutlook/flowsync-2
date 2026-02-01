import { sqliteTable, text, integer, primaryKey, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull(),
  passwordHash: text('password_hash').notNull(),
  allowThinking: integer('allow_thinking', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'number' }).notNull(),
}, (table) => ({
  usernameIdx: uniqueIndex('users_username_unique').on(table.username),
}));

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  tokenHash: text('token_hash').notNull(),
  createdAt: integer('created_at', { mode: 'number' }).notNull(),
  expiresAt: integer('expires_at', { mode: 'number' }).notNull(),
}, (table) => ({
  tokenIdx: uniqueIndex('sessions_token_hash_unique').on(table.tokenHash),
}));

export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: integer('created_at', { mode: 'number' }).notNull(),
  createdBy: text('created_by'),
  isPublic: integer('is_public', { mode: 'boolean' }).notNull().default(false),
});

export const workspaceMembers = sqliteTable('workspace_members', {
  workspaceId: text('workspace_id').notNull(),
  userId: text('user_id').notNull(),
  role: text('role').notNull(),
  status: text('status').notNull(),
  createdAt: integer('created_at', { mode: 'number' }).notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.workspaceId, table.userId] }),
}));

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  icon: text('icon'),
  createdAt: integer('created_at', { mode: 'number' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'number' }).notNull(),
});

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').notNull(),
  priority: text('priority').notNull(),
  wbs: text('wbs'),
  createdAt: integer('created_at', { mode: 'number' }).notNull(),
  startDate: integer('start_date', { mode: 'number' }),
  dueDate: integer('due_date', { mode: 'number' }),
  completion: integer('completion', { mode: 'number' }),
  assignee: text('assignee'),
  isMilestone: integer('is_milestone', { mode: 'boolean' }).notNull().default(false),
  predecessors: text('predecessors', { mode: 'json' }).$type<string[] | null>(),
  updatedAt: integer('updated_at', { mode: 'number' }).notNull(),
});

export const drafts = sqliteTable('drafts', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  projectId: text('project_id'),
  status: text('status').notNull(),
  actions: text('actions', { mode: 'json' }).notNull().$type<unknown[]>(),
  createdAt: integer('created_at', { mode: 'number' }).notNull(),
  createdBy: text('created_by').notNull(),
  reason: text('reason'),
});

export const auditLogs = sqliteTable('audit_logs', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  action: text('action').notNull(),
  before: text('before', { mode: 'json' }).$type<Record<string, unknown> | null>(),
  after: text('after', { mode: 'json' }).$type<Record<string, unknown> | null>(),
  actor: text('actor').notNull(),
  reason: text('reason'),
  timestamp: integer('timestamp', { mode: 'number' }).notNull(),
  projectId: text('project_id'),
  taskId: text('task_id'),
  draftId: text('draft_id'),
});

export const observabilityLogs = sqliteTable('observability_logs', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(),
  payload: text('payload', { mode: 'json' }).notNull().$type<Record<string, unknown>>(),
  createdAt: integer('created_at', { mode: 'number' }).notNull(),
});

export const rateLimits = sqliteTable('rate_limits', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  type: text('type').notNull(),
  timestamp: integer('timestamp', { mode: 'number' }).notNull(),
});

// ==================== Chart Tables ====================

/**
 * Chart Projects - Manages chart collections
 * Similar to projects table but specifically for chart workspaces
 */
export const chartProjects = sqliteTable('chart_projects', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  icon: text('icon'),
  createdAt: integer('created_at', { mode: 'number' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'number' }).notNull(),
});

/**
 * Chart Configs - Stores individual ECharts configurations
 */
export const chartConfigs = sqliteTable('chart_configs', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  dataSourceId: text('data_source_id'),

  // Chart metadata
  title: text('title').notNull(),
  description: text('description'),
  chartType: text('chart_type').notNull(), // 'line', 'bar', 'pie', 'scatter', 'map', 'radar', etc.

  // ECharts JSON configuration (core)
  echartsConfig: text('echarts_config', { mode: 'json' }).notNull().$type<Record<string, unknown>>(),

  // Validation status
  validationStatus: text('validation_status').notNull(), // 'valid', 'invalid', 'pending'
  validationErrors: text('validation_errors', { mode: 'json' }).$type<Array<{message: string; path?: string}>>(),

  // Generation info
  generatedBy: text('generated_by').notNull(), // 'ai' | 'user'
  generationPrompt: text('generation_prompt'),

  // Timestamps
  createdAt: integer('created_at', { mode: 'number' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'number' }).notNull(),
});

/**
 * Data Sources - Stores uploaded data files
 */
export const dataSources = sqliteTable('data_sources', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  workspaceId: text('workspace_id').notNull(),

  // File info
  fileName: text('file_name').notNull(),
  fileType: text('file_type').notNull(), // 'csv', 'json', 'xlsx', 'xls', 'md'
  fileSize: integer('file_size').notNull(),

  // Data content (small files stored directly, large files use R2)
  content: text('content', { mode: 'json' }).$type<Record<string, unknown> | null>(),
  r2Key: text('r2_key'), // R2 object key (for large files)

  // Parse status
  parseStatus: text('parse_status').notNull(), // 'pending', 'success', 'failed'
  parseErrors: text('parse_errors'),

  // Timestamp
  uploadedAt: integer('uploaded_at', { mode: 'number' }).notNull(),
  uploadedBy: text('uploaded_by').notNull(), // user ID
});

/**
 * Chart Drafts - Draft approval workflow for charts
 * Reuses the existing drafts table concept but specialized for charts
 */
export const chartDrafts = sqliteTable('chart_drafts', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  projectId: text('project_id').notNull(),
  status: text('status').notNull(), // 'pending', 'approved', 'rejected', 'applied'

  // Draft type
  draftType: text('draft_type').notNull(), // 'create_charts', 'modify_charts', 'delete_charts'

  // Suggested actions
  actions: text('actions', { mode: 'json' }).notNull().$type<Array<{
    type: 'create' | 'update' | 'delete';
    entityId?: string;
    data?: Record<string, unknown>;
  }>>(),

  // AI generation info
  generatedBy: text('generated_by').notNull(), // 'ai'
  prompt: text('prompt'),

  // Timestamp
  createdAt: integer('created_at', { mode: 'number' }).notNull(),
  reason: text('reason'),
});

/**
 * Chart Audit Logs - Audit trail for chart operations
 * Can reuse existing audit_logs table, but this provides chart-specific tracking
 */
export const chartAuditLogs = sqliteTable('chart_audit_logs', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  entityType: text('entity_type').notNull(), // 'chart_project', 'chart_config', 'data_source'
  entityId: text('entity_id').notNull(),
  action: text('action').notNull(), // 'create', 'update', 'delete', 'export', 'validate'
  before: text('before', { mode: 'json' }).$type<Record<string, unknown> | null>(),
  after: text('after', { mode: 'json' }).$type<Record<string, unknown> | null>(),
  actor: text('actor').notNull(), // 'user', 'ai', 'system'
  reason: text('reason'),
  timestamp: integer('timestamp', { mode: 'number' }).notNull(),
  projectId: text('project_id'),
  draftId: text('draft_id'),
});

/**
 * Chart Templates - Predefined chart templates
 */
export const chartTemplates = sqliteTable('chart_templates', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category').notNull(), // 'business', 'scientific', 'financial', etc.
  description: text('description'),
  thumbnail: text('thumbnail'),

  // Template configuration
  echartsTemplate: text('echarts_template', { mode: 'json' }).notNull().$type<Record<string, unknown>>(),
  sampleData: text('sample_data', { mode: 'json' }).$type<Record<string, unknown>>(),

  // Tags and search
  tags: text('tags', { mode: 'json' }).$type<string[]>(),

  // Usage statistics
  usageCount: integer('usage_count').notNull().default(0),

  // System template or user custom
  isSystem: integer('is_system', { mode: 'boolean' }).notNull().default(false),
  createdBy: text('created_by'),
  createdAt: integer('created_at', { mode: 'number' }).notNull(),
});
