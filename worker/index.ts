import { createApp } from './app';
import { getDb } from './db';
import { ensureSeedData } from './services/seedService';
import type { Bindings } from './types';

let app: ReturnType<typeof createApp> | null = null;
let seedPromise: Promise<void> | null = null;

const getApp = (env: Bindings) => {
  if (!app) {
    const db = getDb(env);
    app = createApp(db);
    if (!seedPromise) {
      seedPromise = ensureSeedData(db).catch(() => {});
    }
  }
  return app;
};

export default {
  async fetch(request: Request, env: Bindings, ctx: ExecutionContext) {
    try {
      const url = new URL(request.url);

      if (url.pathname.startsWith('/api')) {
        return getApp(env).fetch(request, env, ctx);
      }

      if (env.ASSETS) {
        return env.ASSETS.fetch(request);
      }

      return getApp(env).fetch(request, env, ctx);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      console.error('fetch_error', {
        method: request.method,
        path: new URL(request.url).pathname,
        message,
        stack,
      });
      return new Response(
        JSON.stringify({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Internal server error.' },
        }),
        { status: 500, headers: { 'content-type': 'application/json' } }
      );
    }
  },
};
