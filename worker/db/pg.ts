import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import type { Bindings } from '../types';

let pool: Pool | null = null;
let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

const resolveConnectionString = (env: Bindings) => {
  const connectionString = env.HYPERDRIVE?.connectionString;
  if (!connectionString) {
    throw new Error('HYPERDRIVE binding is missing a connection string.');
  }
  return connectionString;
};

export const getPgDb = (env: Bindings) => {
  if (!db) {
    const connectionString = resolveConnectionString(env);
    pool = new Pool({
      connectionString,
      connectionTimeoutMillis: 1_500,
      idleTimeoutMillis: 30_000,
      max: 5,
      query_timeout: 1_000,
    });
    pool.on('error', (error) => {
      console.error('pg_pool_error', {
        message: error instanceof Error ? error.message : String(error),
      });
    });
    db = drizzle(pool, { schema });
  }
  return db;
};

export const closePgDb = async () => {
  if (pool) {
    await pool.end();
    pool = null;
    db = null;
  }
};
