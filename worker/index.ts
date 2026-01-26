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
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api')) {
      return getApp(env).fetch(request, env, ctx);
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return getApp(env).fetch(request, env, ctx);
  },
};
