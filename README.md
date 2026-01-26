<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# FlowSync AI Studio App

FlowSync is a data-driven project management app with a Cloudflare Workers backend,
PostgreSQL persistence via Drizzle + Hyperdrive, and a React/Vite frontend served as
static assets from the same Worker. The backend supports draft-first changes, audit
logging, and rollback via audit snapshots.

**Deployment Platform:** Cloudflare Workers

## Run Locally

**Prerequisites:** Node.js, PostgreSQL

1. Install dependencies:
   `npm install`
2. Copy environment variables:
   `cp .env.example .env`
3. Configure `.env`:
   - Required: `DATABASE_URL` (PostgreSQL connection string for local dev)
   - Required: `OPENAI_API_KEY`
   - Optional: `OPENAI_BASE_URL` (default: `https://api.openai.com/v1`)
   - Optional: `OPENAI_MODEL` (default: `gpt-4`)
4. Setup database:
   `npm run db:push`
5. Start local development:
   - Frontend: `npm run dev` (http://localhost:5173)
   - Workers backend: `npm run dev:worker` (http://127.0.0.1:8787)

Vite proxies `/api` to the Workers dev server.

### Database (PostgreSQL)
Migrations are managed via Drizzle Kit:

```bash
# Generate migration (if schema changes)
npm run db:generate

# Push schema to database
npm run db:push

# Open database studio
npm run db:studio
```

## Docs

- `docs/cloudflare-migration-plan.md`
- `docs/cloudflare-deploy.md`

## Deploy to Cloudflare Workers

1. Build the frontend assets:
   `npm run build:prod`

2. Configure Hyperdrive binding and secrets:
   - Set `HYPERDRIVE` binding in Cloudflare
   - `wrangler secret put OPENAI_API_KEY`
   - `OPENAI_BASE_URL` and `OPENAI_MODEL` are configured in `wrangler.toml` `[vars]`

3. Deploy:
   `npm run deploy`

## API Notes
- Draft-first flow: `POST /api/drafts` then `POST /api/drafts/:id/apply`
- Audit log + rollback: `GET /api/audit` and `POST /api/audit/:id/rollback`
- Direct write APIs still exist for `/api/projects` and `/api/tasks` (POST/PATCH/DELETE) and are audited,
  but do not go through the draft approval flow.

## Data Export & Import

### Export
- Formats: CSV, TSV, JSON, Markdown, PDF
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
