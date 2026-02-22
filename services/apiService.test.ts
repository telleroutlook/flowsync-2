import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { storageSet } from '../src/utils/storage';

const buildListTasksResponse = () =>
  new Response(
    JSON.stringify({
      success: true,
      data: {
        data: [],
        total: 0,
        page: 1,
        pageSize: 20,
      },
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );

describe('apiService request deduplication', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('deduplicates concurrent GET requests in the same workspace', async () => {
    vi.resetModules();

    const resolvers: Array<(value: Response) => void> = [];
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolvers.push(resolve);
        })
    );
    vi.stubGlobal('fetch', fetchMock);

    storageSet('activeWorkspaceId', 'ws-1');
    const { apiService } = await import('./apiService');

    const p1 = apiService.listTasks({ page: 1, pageSize: 20 });
    const p2 = apiService.listTasks({ page: 1, pageSize: 20 });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    expect(resolvers[0]).toBeDefined();
    resolvers[0]!(buildListTasksResponse());
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toEqual(r2);
  });

  it('does not deduplicate concurrent GET requests across different workspaces', async () => {
    vi.resetModules();

    const resolvers: Array<(value: Response) => void> = [];
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolvers.push(resolve);
        })
    );
    vi.stubGlobal('fetch', fetchMock);

    const { apiService } = await import('./apiService');

    storageSet('activeWorkspaceId', 'ws-1');
    const p1 = apiService.listTasks({ page: 1, pageSize: 20 });

    storageSet('activeWorkspaceId', 'ws-2');
    const p2 = apiService.listTasks({ page: 1, pageSize: 20 });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    const calls = fetchMock.mock.calls as unknown as Array<[RequestInfo, RequestInit | undefined]>;
    const firstCall = calls[0];
    const secondCall = calls[1];
    expect(firstCall).toBeDefined();
    expect(secondCall).toBeDefined();
    const firstHeaders = new Headers(firstCall?.[1]?.headers);
    const secondHeaders = new Headers(secondCall?.[1]?.headers);
    expect(firstHeaders.get('X-Workspace-Id')).toBe('ws-1');
    expect(secondHeaders.get('X-Workspace-Id')).toBe('ws-2');

    expect(resolvers[0]).toBeDefined();
    expect(resolvers[1]).toBeDefined();
    resolvers[0]!(buildListTasksResponse());
    resolvers[1]!(buildListTasksResponse());
    await Promise.all([p1, p2]);
  });
});
