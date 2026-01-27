import { Hono } from 'hono';
import type { Variables, Bindings, DrizzleDB } from './types';
import { projectsRoute } from './routes/projects';
import { tasksRoute } from './routes/tasks';
import { draftsRoute } from './routes/drafts';
import { auditRoute } from './routes/audit';
import { aiRoute } from './routes/ai';
import { authRoute } from './routes/auth';
import { workspacesRoute } from './routes/workspaces';
import { authMiddleware } from './routes/middleware';
import { systemRoute } from './routes/system';

export { Variables, Bindings };

export const createApp = (db: DrizzleDB, bindings?: Bindings) => {
  const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

  // Middleware to inject db and optional env bindings - must be before routes
  app.use('*', async (c, next) => {
    c.set('db', db);
    if (bindings) {
      c.env = bindings;
    }
    await next();
  });
  app.use('*', authMiddleware);

  app.route('/', aiRoute);
  app.route('/api/auth', authRoute);
  app.route('/api/workspaces', workspacesRoute);
  app.route('/api/projects', projectsRoute);
  app.route('/api/tasks', tasksRoute);
  app.route('/api/drafts', draftsRoute);
  app.route('/api/audit', auditRoute);
  app.route('/api/system', systemRoute);

  app.onError((err, c) => {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error('request_error', {
      method: c.req.method,
      path: c.req.path,
      message,
      stack,
    });
    return c.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error.',
        },
      },
      500
    );
  });

  return app;
};
