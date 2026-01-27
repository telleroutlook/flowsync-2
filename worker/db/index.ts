// Re-export everything for convenience
export * from './schema';
export { getD1Db as getDb } from './d1';
import { getD1Db } from './d1';

export type DrizzleDB = ReturnType<typeof getD1Db>;
