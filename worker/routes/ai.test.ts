import { Hono } from 'hono';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { aiRoute } from './ai';
import type { Variables } from '../types';

vi.mock('../services/logService', () => ({
  recordLog: vi.fn(),
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

import { recordLog } from '../services/logService';

// Mock database with rate limit methods
const mockDb = {
  select: vi.fn(() => mockDb),
  from: vi.fn(() => mockDb),
  where: vi.fn(() => []),
  insert: vi.fn(() => mockDb),
  values: vi.fn(() => Promise.resolve()),
  delete: vi.fn(() => mockDb),
};

const buildApp = () => {
  const app = new Hono<{ Variables: Variables }>();
  app.use('*', async (c, next) => {
    c.set('db', mockDb as any);
    c.set('user', null);
    c.set('workspace', null);
    c.set('workspaceMembership', null);
    await next();
  });
  app.route('/', aiRoute);
  return app;
};

const baseRequest = {
  history: [],
  message: 'Hello',
};

describe('aiRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns error when OPENAI_API_KEY is missing', async () => {
    const app = buildApp();
    const res = await app.request(
      '/api/ai',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(baseRequest),
      },
      { OPENAI_API_KEY: '' }
    );
    const json = (await res.json()) as any;

    expect(res.status).toBe(500);
    expect(json.error.code).toBe('MISSING_API_KEY');
  });

  it('returns model response with tool calls', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: 'Hi there',
                tool_calls: [
                  {
                    function: { name: 'listProjects', arguments: '{}' },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const app = buildApp();
    const res = await app.request(
      '/api/ai',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(baseRequest),
      },
      { OPENAI_API_KEY: 'test-key' }
    );
    const json = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(json.data.text).toBe('Hi there');
    expect(json.data.toolCalls).toHaveLength(1);
    expect(json.data.toolCalls[0].name).toBe('listProjects');
    expect(recordLog).toHaveBeenCalledTimes(3);
  });

  it('returns OPENAI_ERROR when upstream fails', async () => {
    const fetchMock = vi.fn(async () => new Response('Upstream error', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    const app = buildApp();
    const res = await app.request(
      '/api/ai',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(baseRequest),
      },
      { OPENAI_API_KEY: 'test-key' }
    );
    const json = (await res.json()) as any;

    expect(res.status).toBe(502);
    expect(json.error.code).toBe('OPENAI_ERROR');
    expect(recordLog).toHaveBeenCalledTimes(2);
  });

  it('uses custom base URL and model when provided', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: { content: 'Custom', tool_calls: [] },
            },
          ],
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const app = buildApp();
    const res = await app.request(
      '/api/ai',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(baseRequest),
      },
      {
        OPENAI_API_KEY: 'test-key',
        OPENAI_BASE_URL: 'https://open.bigmodel.cn/api/coding/paas/v4',
        OPENAI_MODEL: 'GLM-4.7',
      }
    );
    const json = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(json.data.text).toBe('Custom');
    expect(fetchMock).toHaveBeenCalled();

    const [url, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://open.bigmodel.cn/api/coding/paas/v4/chat/completions');
    const body = JSON.parse(String(options.body));
    expect(body.model).toBe('GLM-4.7');
    expect(recordLog).toHaveBeenCalledTimes(2);
  });
});
