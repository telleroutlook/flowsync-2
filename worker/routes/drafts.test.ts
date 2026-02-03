import { Hono } from 'hono';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { draftsRoute } from './drafts';
import type { Variables } from '../types';
import { expectError, expectSuccess, makeDraftRecord, readJson } from './testUtils';

vi.mock('../services/draftService', () => ({
  listDrafts: vi.fn(),
  getDraftById: vi.fn(),
  createDraft: vi.fn(),
  applyDraft: vi.fn(),
  discardDraft: vi.fn(),
}));

vi.mock('../services/logService', () => ({
  recordLog: vi.fn(),
}));

vi.mock('../services/utils', () => ({
  generateId: () => 'gen-1',
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

import { createDraft, applyDraft, discardDraft } from '../services/draftService';
import { recordLog } from '../services/logService';

const mockDb = {} as Variables['db'];

const buildApp = () => {
  const app = new Hono<{ Variables: Variables }>();
  app.use('*', async (c, next) => {
    c.set('db', mockDb);
    c.set('user', null);
    c.set('workspace', null);
    c.set('workspaceMembership', null);
    await next();
  });
  app.route('/api/drafts', draftsRoute);
  return app;
};

describe('draftsRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a draft and records log', async () => {
    (createDraft as ReturnType<typeof vi.fn>).mockResolvedValue({
      draft: makeDraftRecord({ id: 'd1', projectId: null, actions: [] }),
      warnings: [],
    });

    const app = buildApp();
    const res = await app.request('/api/drafts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        createdBy: 'agent',
        actions: [{ entityType: 'task', action: 'create', after: { title: 'Task' } }],
      }),
    });
    const json = await readJson<{ draft: { id: string } }>(res);
    const success = expectSuccess(json);

    expect(res.status).toBe(201);
    expect(success.data.draft.id).toBe('d1');
    const mockCall = (createDraft as ReturnType<typeof vi.fn>).mock.calls[0];
    const call = mockCall?.[1];
    if (call) {
      expect(call.actions[0].id).toBe('gen-1');
    }
    expect(recordLog).toHaveBeenCalled();
  });

  it('returns apply failure when service throws', async () => {
    (applyDraft as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));
    const app = buildApp();
    const res = await app.request('/api/drafts/d1/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor: 'user' }),
    });
    const json = await readJson<Record<string, unknown>>(res);
    const error = expectError(json);

    expect(res.status).toBe(400);
    expect(error.error.code).toBe('APPLY_FAILED');
  });

  it('returns 404 when discard target missing', async () => {
    (discardDraft as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const app = buildApp();
    const res = await app.request('/api/drafts/d1/discard', { method: 'POST' });
    const json = await readJson<Record<string, unknown>>(res);
    const error = expectError(json);

    expect(res.status).toBe(404);
    expect(error.error.code).toBe('NOT_FOUND');
  });
});
