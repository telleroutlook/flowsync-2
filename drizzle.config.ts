import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './worker/db/schema.ts',
  out: './migrations_sqlite',
  dialect: 'sqlite',
  dbCredentials: {
    url: 'file:./local.db',
  },
});
