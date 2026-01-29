import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { jsonError, jsonOk } from './helpers';
import { createSession, createUser, getUserByUsername, parseAuthHeader, revokeSession, verifyPassword } from '../services/authService';
import type { Variables } from '../types';

export const authRoute = new Hono<{ Variables: Variables }>();

const credentialsSchema = z.object({
  username: z.string().min(2),
  password: z.string()
    .min(12, 'Password must be at least 12 characters long')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
});

authRoute.post('/register', zValidator('json', credentialsSchema), async (c) => {
  const data = c.req.valid('json');
  const existing = await getUserByUsername(c.get('db'), data.username);
  if (existing) return jsonError(c, 'USER_EXISTS', 'Username already exists.', 409);
  const user = await createUser(c.get('db'), { username: data.username, password: data.password });
  const session = await createSession(c.get('db'), user.id);
  return jsonOk(c, { user, token: session.token, expiresAt: session.expiresAt }, 201);
});

authRoute.post('/login', zValidator('json', credentialsSchema), async (c) => {
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

authRoute.put('/me', zValidator('json', updateProfileSchema), async (c) => {
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
