import { Hono } from 'hono';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { projectsRoute } from './projects';
import type { Variables } from '../types';
import { expectError, expectSuccess, makeProjectRecord, readJson } from './testUtils';

vi.mock('../services/projectService', () => ({
  listProjects: vi.fn(),
  getProjectById: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
}));

vi.mock('../services/auditService', () => ({
  recordAudit: vi.fn(),
}));

vi.mock('../services/serializers', () => ({
  toTaskRecord: vi.fn((row: { id: string }) => row),
}));

vi.mock('./middleware', () => ({
  workspaceMiddleware: async (
    c: { set: (key: string, value: unknown) => void },
    next: () => Promise<void>
  ) => {
    c.set('workspace', { id: 'public', name: 'Public', description: null, createdAt: 0, createdBy: null, isPublic: true });
    c.set('workspaceMembership', null);
    await next();
  },
}));

import { listProjects, getProjectById, createProject, updateProject, deleteProject } from '../services/projectService';
import { recordAudit } from '../services/auditService';

const mockDb = {
  select: () => ({
    from: () => ({
      where: async () => [{ id: 't1' }],
    }),
  }),
} as unknown as Variables['db'];

const buildApp = () => {
  const app = new Hono<{ Variables: Variables }>();
  app.use('*', async (c, next) => {
    c.set('db', mockDb);
    c.set('user', null);
    c.set('workspace', null);
    c.set('workspaceMembership', null);
    await next();
  });
  app.route('/api/projects', projectsRoute);
  return app;
};

describe('projectsRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists projects', async () => {
    (listProjects as ReturnType<typeof vi.fn>).mockResolvedValue([makeProjectRecord({ id: 'p1', name: 'Alpha' })]);
    const app = buildApp();
    const res = await app.request('/api/projects');
    const json = await readJson<Array<{ id: string }>>(res);
    const success = expectSuccess(json);

    expect(res.status).toBe(200);
    expect(success.data[0]?.id).toBe('p1');
  });

  it('returns 404 for missing project', async () => {
    (getProjectById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const app = buildApp();
    const res = await app.request('/api/projects/p1');
    const json = await readJson<Record<string, unknown>>(res);
    const error = expectError(json);

    expect(res.status).toBe(404);
    expect(error.error.code).toBe('NOT_FOUND');
  });

  it('creates a project and records audit', async () => {
    (createProject as ReturnType<typeof vi.fn>).mockResolvedValue(makeProjectRecord({ id: 'p1', name: 'Alpha' }));
    const app = buildApp();
    const res = await app.request('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Alpha' }),
    });
    const json = await readJson<{ id: string }>(res);
    const success = expectSuccess(json);

    expect(res.status).toBe(201);
    expect(success.data.id).toBe('p1');
    expect(recordAudit).toHaveBeenCalled();
  });

  it('returns 404 for update missing project', async () => {
    (updateProject as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const app = buildApp();
    const res = await app.request('/api/projects/p1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Updated' }),
    });
    const json = await readJson<Record<string, unknown>>(res);
    const error = expectError(json);

    expect(res.status).toBe(404);
    expect(error.error.code).toBe('NOT_FOUND');
  });

  it('deletes a project and records audit', async () => {
    (getProjectById as ReturnType<typeof vi.fn>).mockResolvedValue(makeProjectRecord({ id: 'p1', name: 'Alpha' }));
    (deleteProject as ReturnType<typeof vi.fn>).mockResolvedValue({
      project: makeProjectRecord({ id: 'p1', name: 'Alpha' }),
      deletedTasks: 1,
    });
    const app = buildApp();
    const res = await app.request('/api/projects/p1', { method: 'DELETE' });
    const json = await readJson<{ project: { id: string } }>(res);
    const success = expectSuccess(json);

    expect(res.status).toBe(200);
    expect(success.data.project.id).toBe('p1');
    expect(recordAudit).toHaveBeenCalled();
  });
});
