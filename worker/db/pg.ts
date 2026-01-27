import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import type { Bindings } from '../types';

let pool: Pool | null = null;
let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

const MAX_QUERY_RETRIES = 2;
const BASE_RETRY_DELAY_MS = 120;
const MAX_RETRY_DELAY_MS = 1500;

const RETRYABLE_PG_ERROR_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EPIPE',
  'ENETUNREACH',
  'EHOSTUNREACH',
  '08001',
  '08003',
  '08004',
  '08006',
  '08007',
  '08P01',
  '57P01',
  '57P02',
  '57P03',
  '53300',
]);

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const getRetryDelay = (attempt: number, retryAfterHeader?: string | null) => {
  if (retryAfterHeader) {
    const retryAfterSeconds = Number(retryAfterHeader);
    if (!Number.isNaN(retryAfterSeconds) && retryAfterSeconds > 0) {
      return Math.min(retryAfterSeconds * 1000, MAX_RETRY_DELAY_MS);
    }
  }
  const jitter = Math.floor(Math.random() * 120);
  const delay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt) + jitter;
  return Math.min(delay, MAX_RETRY_DELAY_MS);
};

const getErrorCode = (error: unknown): string | null => {
  if (!error || typeof error !== 'object') return null;
  if ('code' in error && typeof (error as { code?: unknown }).code === 'string') {
    return (error as { code: string }).code;
  }
  return null;
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return String(error);
};

const isRetryablePgError = (error: unknown) => {
  const code = getErrorCode(error);
  if (code && RETRYABLE_PG_ERROR_CODES.has(code)) return true;
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes('terminating connection') ||
    message.includes('connection terminated') ||
    message.includes('could not connect') ||
    message.includes('timeout') ||
    message.includes('socket hang up')
  );
};

const isReadOnlyQuery = (queryText?: string) => {
  if (!queryText) return false;
  const normalized = queryText.trim().toLowerCase();
  if (!normalized) return false;
  const firstWord = normalized.split(/\s+/)[0];
  if (firstWord === 'select' || firstWord === 'show' || firstWord === 'explain') {
    return true;
  }
  if (firstWord === 'with') {
    return !/(insert|update|delete|merge|alter|create|drop|truncate)\s/.test(normalized);
  }
  return false;
};

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
    const retryPool = pool as Pool & { __retryWrapped?: boolean };
    if (!retryPool.__retryWrapped) {
      const originalQuery: Pool['query'] = pool.query.bind(pool);
      const wrappedQuery = (async (...args: Parameters<Pool['query']>) => {
        const firstArg = args[0];
        const queryText = typeof firstArg === 'string'
          ? firstArg
          : (firstArg && typeof firstArg === 'object' && 'text' in firstArg
            ? (firstArg as { text?: string }).text
            : undefined);
        const canRetry = isReadOnlyQuery(queryText);

        let lastError: unknown;
        for (let attempt = 0; attempt <= MAX_QUERY_RETRIES; attempt += 1) {
          try {
            return await originalQuery(...args);
          } catch (error) {
            lastError = error;
            if (!canRetry || !isRetryablePgError(error) || attempt === MAX_QUERY_RETRIES) {
              throw error;
            }
            const delayMs = getRetryDelay(attempt);
            console.warn('db_retry', {
              attempt: attempt + 1,
              delayMs,
              code: getErrorCode(error),
              message: getErrorMessage(error),
            });
            await sleep(delayMs);
          }
        }
        throw lastError;
      }) as Pool['query'];
      pool.query = wrappedQuery;
      retryPool.__retryWrapped = true;
    }
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
