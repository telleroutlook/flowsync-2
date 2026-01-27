import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';
import type { Bindings } from '../types';

let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export const getD1Db = (env: Bindings) => {
  if (!db) {
    db = drizzle(env.DB, { schema });
  }
  return db;
};
