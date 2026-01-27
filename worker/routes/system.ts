import { Hono } from 'hono';
import { jsonError, jsonOk } from './helpers';
import { ensureSeedData } from '../services/seedService';
import type { Variables, Bindings } from '../types';

export const systemRoute = new Hono<{ Bindings: Bindings; Variables: Variables }>();

systemRoute.post('/init', async (c) => {
  const token = c.req.header('X-Init-Token');
  const expected = c.env?.INIT_TOKEN;
  if (!expected || token !== expected) {
    return jsonError(c, 'UNAUTHORIZED', 'Invalid init token.', 401);
  }

  try {
    await ensureSeedData(c.get('db'));
    return jsonOk(c, { ok: true });
  } catch (error) {
    return jsonError(c, 'INIT_FAILED', error instanceof Error ? error.message : 'Init failed.', 400);
  }
});
