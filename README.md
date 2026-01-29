<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# FlowSync AI Studio App

FlowSync is a data-driven project management app with a Cloudflare Workers backend,
Cloudflare D1 persistence via Drizzle, and a React/Vite frontend served as
static assets from the same Worker. The backend supports draft-first changes, audit
logging, and rollback via audit snapshots.

**Deployment Platform:** Cloudflare Workers

## Run Locally (Optional)

**Prerequisites:** Node.js, Cloudflare D1

1. Install dependencies:
   `npm install`
2. Copy environment variables:
   `cp .env.example .env`
3. Configure `.env`:
   - Required: `OPENAI_API_KEY`
   - Optional: `OPENAI_BASE_URL` (default: `https://api.openai.com/v1`)
   - Optional: `OPENAI_MODEL` (default: `gpt-4`)
4. Apply database migrations (local D1):
   `npm run db:migrate:local`
5. Start local development:
   - Frontend: `npm run dev` (http://localhost:5173)
   - Workers backend: `npm run dev:worker` (http://127.0.0.1:8787)

Vite proxies `/api` to the Workers dev server.

### Database (D1)
Migrations are managed via Drizzle Kit:

```bash
# Generate migration (if schema changes)
npm run db:generate

# Apply migrations to local D1
npm run db:migrate:local

# Open database studio
npm run db:studio
```

## Docs

- `docs/cloudflare-migration-plan.md`
- `docs/cloudflare-deploy.md`

## Deploy to Cloudflare Workers

1. Build the frontend assets:
   `npm run build:prod`

2. Configure D1 binding and secrets:
   - Set `DB` binding in `wrangler.toml`
   - Create a D1 database and set `database_id`
   - `wrangler secret put OPENAI_API_KEY`
   - `wrangler secret put INIT_TOKEN` (used by `/api/system/init`)
   - `OPENAI_BASE_URL` and `OPENAI_MODEL` are configured in `wrangler.toml` `[vars]`

3. Deploy:
   `npm run deploy`

4. Initialize base data (one-time):
   - Call `POST /api/system/init` with header `X-Init-Token: <INIT_TOKEN>`
   - This creates the public workspace and seed data if missing

### Production Database
- Apply SQL migrations from `migrations_sqlite/*.sql` to the target D1 database before calling `/api/system/init` (`npm run db:migrate:prod`).

## API Notes
- Draft-first flow: `POST /api/drafts` then `POST /api/drafts/:id/apply`
- Audit log + rollback: `GET /api/audit` and `POST /api/audit/:id/rollback`
- Direct write APIs still exist for `/api/projects` and `/api/tasks` (POST/PATCH/DELETE) and are audited,
  but do not go through the draft approval flow.

## Data Export & Import

### Export
- Formats: CSV, TSV, JSON, Markdown
- Scope: Active project or All projects

### Import
- Formats: JSON, CSV, TSV
- Strategy: Append (add new tasks) or Merge by ID (overwrite tasks with matching IDs)
- Required headers for CSV/TSV (case-insensitive, matches export columns):
  `rowType,projectId,project,projectDescription,projectIcon,projectCreatedAt,projectUpdatedAt,id,title,status,priority,assignee,wbs,startDate,dueDate,completion,isMilestone,predecessors,description,createdAt,updatedAt`
- `rowType` supports `project` or `task` so project-only rows can be restored.
- JSON import expects version 2 files (the current export format).

## Internationalization (i18n)
- UI strings live in `src/i18n/translations.ts` (English + Chinese).
- Use `useI18n()` in components/hooks to access `t`, `locale`, and `setLocale`.
- Locale persists in localStorage under `flowsync:locale`.
