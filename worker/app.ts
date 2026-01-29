import { Hono } from 'hono';
import { cors } from '@tinyhttp/cors';
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

  // ============================================================================
  // SECURITY MIDDLEWARE
  // ============================================================================

  // CORS Configuration - Strict origin allowlist for cross-origin requests
  app.use('*', async (c, next) => {
    const corsMiddleware = cors({
      origin: [
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'https://workchatly.com',
        'https://www.workchatly.com',
      ],
      credentials: true, // Allow cookies for authentication
      maxAge: 86400, // 24 hours
      exposedHeaders: ['Content-Length', 'Content-Type'],
    });

    // @ts-ignore - tinyhttp cors middleware compatibility
    return corsMiddleware(c, next);
  });

  // Security Headers Middleware - Adds security headers to all responses
  app.use('*', async (c, next) => {
    await next();

    // Prevent MIME type sniffing
    c.header('X-Content-Type-Options', 'nosniff');

    // Prevent clickjacking attacks
    c.header('X-Frame-Options', 'DENY');

    // Enable XSS filtering in browsers
    c.header('X-XSS-Protection', '1; mode=block');

    // Enforce HTTPS (only in production)
    if (c.req.header('cf-visitor')?.includes('https')) {
      c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }

    // Content Security Policy - Restricts resources the browser can load
    c.header(
      'Content-Security-Policy',
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline'; " +
      "style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data: https:; " +
      "font-src 'self'; " +
      "connect-src 'self'; " +
      "frame-ancestors 'none';"
    );

    // Permissions Policy - Restricts browser features
    c.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

    // Referrer Policy - Controls referrer information
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  });

  // CSRF Protection - Token-based double-submit cookie pattern
  // Generates and validates CSRF tokens for state-changing operations
  app.use('*', async (c, next) => {
    const isReadOperation = c.req.method === 'GET' || c.req.method === 'HEAD' || c.req.method === 'OPTIONS';

    if (isReadOperation) {
      // For GET requests, generate and set CSRF token in cookie
      const token = crypto.randomUUID();
      c.header('set-cookie', `csrf_token=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=3600`);
      // c.set('csrfToken', token);
    } else {
      // For state-changing operations (POST/PATCH/DELETE), validate CSRF token
      const cookieToken = c.req.header('cookie')?.match(/csrf_token=([^;]+)/)?.[1];
      const headerToken = c.req.header('x-csrf-token');

      // Skip CSRF for API routes that don't use cookies (e.g., bearer token auth)
      const isApiRoute = c.req.path.startsWith('/api/');

      if (isApiRoute && (!cookieToken || !headerToken || cookieToken !== headerToken)) {
        console.warn('CSRF validation failed', {
          path: c.req.path,
          method: c.req.method,
          hasCookieToken: !!cookieToken,
          hasHeaderToken: !!headerToken,
        });
        return c.json(
          {
            success: false,
            error: {
              code: 'CSRF_VALIDATION_FAILED',
              message: 'CSRF token validation failed. Please refresh the page and try again.',
            },
          },
          403
        );
      }
    }

    await next();
  });

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
