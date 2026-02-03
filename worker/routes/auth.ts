import { Hono } from 'hono';
import { z } from 'zod';
import { jsonError, jsonOk, validatedJson } from './helpers';
import { createSession, createUser, getUserByUsername, parseAuthHeader, revokeSession, verifyPassword } from '../services/authService';
import { checkRateLimit, getClientIp } from '../services/rateLimitService';
import type { Bindings, Variables } from '../types';

export const authRoute = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * Custom password validation that checks length and character variety.
 * Requires at least 6 characters and at least 2 of: uppercase, lowercase, number, special
 */
const passwordSchema = z.string()
  .min(6, 'Password must be at least 6 characters long')
  .max(128, 'Password must be at most 128 characters long')
  .refine(
    (pwd) => {
      const hasUpper = /[A-Z]/.test(pwd);
      const hasLower = /[a-z]/.test(pwd);
      const hasNumber = /[0-9]/.test(pwd);
      const hasSpecial = /[^A-Za-z0-9]/.test(pwd);
      const typeCount = [hasUpper, hasLower, hasNumber, hasSpecial].filter(Boolean).length;
      return typeCount >= 2;
    },
    {
      message: 'Password must contain at least 2 of: uppercase letter, lowercase letter, number, or special character',
    }
  );

const credentialsSchema = z.object({
  username: z.string().min(2),
  password: passwordSchema,
});

authRoute.post('/register', validatedJson(credentialsSchema), async (c) => {
  // Rate limiting check
  const clientIp = getClientIp(c.req.raw);
  const rateLimitResult = await checkRateLimit(c.get('db'), clientIp, 'AUTH', c.env);

  if (!rateLimitResult.allowed) {
    return jsonError(
      c,
      'RATE_LIMIT_EXCEEDED',
      `Too many registration attempts. Please try again in ${rateLimitResult.retryAfter} seconds.`,
      429
    );
  }

  const data = c.req.valid('json');
  const existing = await getUserByUsername(c.get('db'), data.username);
  if (existing) return jsonError(c, 'USER_EXISTS', 'Username already exists.', 409);

  const user = await createUser(c.get('db'), { username: data.username, password: data.password });
  const session = await createSession(c.get('db'), user.id);
  return jsonOk(c, { user, token: session.token, expiresAt: session.expiresAt }, 201);
});

authRoute.post('/login', validatedJson(credentialsSchema), async (c) => {
  // Rate limiting check
  const clientIp = getClientIp(c.req.raw);
  const rateLimitResult = await checkRateLimit(c.get('db'), clientIp, 'AUTH', c.env);

  if (!rateLimitResult.allowed) {
    return jsonError(
      c,
      'RATE_LIMIT_EXCEEDED',
      `Too many login attempts. Please try again in ${rateLimitResult.retryAfter} seconds.`,
      429
    );
  }

  const data = c.req.valid('json');
  const existing = await getUserByUsername(c.get('db'), data.username);
  if (!existing) return jsonError(c, 'INVALID_CREDENTIALS', 'Invalid username or password.', 401);
  const ok = await verifyPassword(data.password, existing.passwordHash);
  if (!ok) return jsonError(c, 'INVALID_CREDENTIALS', 'Invalid username or password.', 401);
  const session = await createSession(c.get('db'), existing.user.id);
  return jsonOk(c, { user: existing.user, token: session.token, expiresAt: session.expiresAt });
});

authRoute.get('/me', async (c) => {
  const user = c.get('user');
  if (!user) return jsonError(c, 'UNAUTHORIZED', 'Not logged in.', 401);
  return jsonOk(c, { user });
});

const updateProfileSchema = z.object({
  allowThinking: z.boolean().optional(),
});

authRoute.put('/me', validatedJson(updateProfileSchema), async (c) => {
  const user = c.get('user');
  if (!user) return jsonError(c, 'UNAUTHORIZED', 'Not logged in.', 401);

  const data = c.req.valid('json');
  const { updateUser } = await import('../services/authService');
  const updatedUser = await updateUser(c.get('db'), user.id, data);

  if (!updatedUser) return jsonError(c, 'UPDATE_FAILED', 'Failed to update user profile.', 500);
  
  return jsonOk(c, { user: updatedUser });
});

authRoute.post('/logout', async (c) => {
  const token = parseAuthHeader(c.req.header('Authorization'));
  if (!token) return jsonError(c, 'INVALID_TOKEN', 'Missing auth token.', 400);
  await revokeSession(c.get('db'), token);
  return jsonOk(c, { success: true });
});

/**
 * CSRF Token endpoint
 * Explicitly fetches a CSRF token for state-changing operations.
 * This endpoint returns a fresh CSRF token and sets it as a cookie.
 *
 * Frontend should call this on app initialization to ensure CSRF token is available.
 */
authRoute.get('/csrf-token', async (c) => {
  // Generate a fresh CSRF token
  const token = crypto.randomUUID();

  // Check if the request is over HTTPS
  const isSecure = c.req.header('cf-visitor')?.includes('https') ||
                   c.req.url.startsWith('https://') ||
                   c.req.raw.url.startsWith('https://');

  // Set the cookie with Secure attribute only for HTTPS
  const secureFlag = isSecure ? 'Secure; ' : '';
  c.header('set-cookie', `csrf_token=${token}; ${secureFlag}SameSite=Strict; Path=/; Max-Age=3600`);

  return jsonOk(c, { token });
});
