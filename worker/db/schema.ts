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
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').notNull(),
  priority: text('priority').notNull(),
  wbs: text('wbs'),
  createdAt: text('created_at').notNull(),
  startDate: text('start_date'),
  dueDate: text('due_date'),
  completion: integer('completion', { mode: 'number' }),
  assignee: text('assignee'),
  isMilestone: integer('is_milestone', { mode: 'boolean' }).notNull().default(false),
  predecessors: text('predecessors', { mode: 'json' }).$type<string[] | null>(),
  updatedAt: text('updated_at').notNull(),
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
