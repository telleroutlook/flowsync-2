import { Hono } from 'hono';
import type { Context, Next } from 'hono';
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

// Custom CORS middleware compatible with Cloudflare Workers
const corsMiddleware = async (c: Context<{ Bindings: Bindings; Variables: Variables }>, next: Next) => {
  // Allowed origins
  const allowedOrigins = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'https://workchatly.com',
    'https://www.workchatly.com',
  ];

  const origin = c.req.header('Origin');
  const isAllowedOrigin = origin && allowedOrigins.includes(origin);

  // Handle OPTIONS preflight request
  if (c.req.method === 'OPTIONS') {
    if (isAllowedOrigin) {
      c.header('Access-Control-Allow-Origin', origin);
    }
    c.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Workspace-Id, X-CSRF-Token');
    c.header('Access-Control-Allow-Credentials', 'true');
    c.header('Access-Control-Max-Age', '86400'); // 24 hours
    c.header('Access-Control-Expose-Headers', 'Content-Length, Content-Type');
    return new Response(null, { status: 204 });
  }

  // For all other requests, add CORS headers after the handler
  await next();

  if (isAllowedOrigin) {
    c.header('Access-Control-Allow-Origin', origin);
  }
  c.header('Access-Control-Allow-Credentials', 'true');
  c.header('Access-Control-Expose-Headers', 'Content-Length, Content-Type');
};

export const createApp = (db: DrizzleDB, bindings?: Bindings) => {
  const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

  // ============================================================================
  // SECURITY MIDDLEWARE
  // ============================================================================

  // CORS Configuration - Cloudflare Workers compatible
  app.use('*', corsMiddleware);

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
    // For React SPA built with Vite, we don't need unsafe-inline in production
    // Static assets are hashed by Vite and have stable content addresses
    c.header(
      'Content-Security-Policy',
      "default-src 'self'; " +
      "script-src 'self'; " +
      "style-src 'self' 'unsafe-inline'; " + // Keep unsafe-inline for dynamic styles in development
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
  //
  // Pattern: Server sets cookie with token → Client reads cookie → Client sends token in header → Server validates
  // Note: Cookie is NOT HttpOnly to allow JavaScript to read it for the double-submit pattern
  app.use('*', async (c, next) => {
    const isReadOperation = c.req.method === 'GET' || c.req.method === 'HEAD' || c.req.method === 'OPTIONS';

    // For state-changing operations (POST/PATCH/DELETE), validate CSRF token BEFORE processing
    if (!isReadOperation) {
      const cookieToken = c.req.header('cookie')?.match(/csrf_token=([^;]+)/)?.[1];
      const headerToken = c.req.header('x-csrf-token');

      // Validate CSRF token for API routes
      const isApiRoute = c.req.path.startsWith('/api/');

      // Use timing-safe comparison to prevent timing attacks
      const tokensMatch = cookieToken && headerToken && timingSafeEqual(cookieToken, headerToken);

      if (isApiRoute && !tokensMatch) {
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

    // Process the request
    await next();

    // After processing, set CSRF token cookie for GET requests (on response)
    if (isReadOperation) {
      // NOT HttpOnly - JavaScript must read this cookie and send it in X-CSRF-Token header
      const token = crypto.randomUUID();

      // Check if the request is over HTTPS
      const isSecure = c.req.header('cf-visitor')?.includes('https') ||
                       c.req.url.startsWith('https://') ||
                       c.req.raw.url.startsWith('https://');

      // Set the cookie with Secure attribute only for HTTPS
      const secureFlag = isSecure ? 'Secure; ' : '';
      c.header('set-cookie', `csrf_token=${token}; ${secureFlag}SameSite=Strict; Path=/; Max-Age=3600`);
    }
  });

  // Timing-safe string comparison to prevent timing attacks on CSRF tokens
  function timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
  }

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
