import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { Variables } from '../types';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

export const jsonOk = (c: Context, data: unknown, status = 200) =>
  c.json({ success: true, data }, status as ContentfulStatusCode);

export const jsonError = (
  c: Context,
  code: string,
  message: string,
  status = 400
) => c.json({ success: false, error: { code, message } }, status as ContentfulStatusCode);

/**
 * Custom Zod validator wrapper that returns our standard error format.
 *
 * @hono/zod-validator returns a non-standard error format on validation failure.
 * This wrapper intercepts ZodError and returns our standard API format:
 * { success: false, error: { code: "VALIDATION_ERROR", message: "..." } }
 *
 * @param schema - Zod schema to validate against
 * @returns zValidator middleware with custom error handling
 *
 * @example
 * ```ts
 * route.post('/', validatedJson(createTaskSchema), async (c) => {
 *   const payload = c.req.valid('json');
 *   // ... handler logic
 * });
 * ```
 */
export const validatedJson = <T extends z.ZodTypeAny>(schema: T) => {
  return zValidator('json', schema, async (result, c) => {
    if (!result.success) {
      const firstError = result.error.issues[0];
      const message = firstError?.message || 'Validation failed';
      return c.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message,
          },
        },
        400
      );
    }
  });
};

/**
 * Validates that a workspace exists in the request context.
 * Returns a 404 error response if the workspace is not found.
 *
 * This is a helper function for route handlers to ensure workspace exists.
 * Note: When using workspaceMiddleware, this check is typically redundant
 * as the middleware already handles missing workspaces. However, keeping
 * this check provides explicit validation and defensive programming.
 *
 * @param c - Hono context with Variables that includes workspace
 * @returns Response object if workspace is missing (to be returned immediately),
 *          or null if workspace exists (allowing handler to continue)
 *
 * @example
 * ```ts
 * route.get('/', async (c) => {
 *   const error = requireWorkspace(c);
 *   if (error) return error;
 *
 *   const workspace = c.get('workspace')!;
 *   // ... rest of handler logic
 * });
 * ```
 */
export const requireWorkspace = (
  c: Context<{ Variables: Variables }>
): Response | null => {
  const workspace = c.get('workspace');
  if (!workspace) {
    return jsonError(c, 'WORKSPACE_NOT_FOUND', 'Workspace not found.', 404);
  }
  return null;
};
