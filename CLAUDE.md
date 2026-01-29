# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FlowSync AI Studio is a data-driven project management application with:
- **Frontend**: React 19.2.3 + Vite 6.2.0
- **Backend**: Hono on Cloudflare Workers
- **Database**: Cloudflare D1 with Drizzle ORM
- **AI Integration**: OpenAI-compatible API for task/project assistance
- **Deployment**: Cloudflare Workers

The application features project/task management with multiple views (Kanban, List, Gantt), a draft-first workflow for changes, comprehensive audit logging with rollback capabilities, and AI-powered chat assistance.

## Development Commands

### Local Development
```bash
npm install                  # Install dependencies
npm run dev                  # Start frontend (http://localhost:5173)
npm run dev:worker           # Start Workers backend (http://127.0.0.1:8787)
```

Vite proxies `/api` requests to the Workers dev server at `http://127.0.0.1:8787`.

### Database Operations
```bash
npm run db:generate          # Generate migration files from schema changes
npm run db:push              # Push schema to database
npm run db:studio            # Open Drizzle Studio for database inspection
```

### Build & Deploy
```bash
npm run build:prod           # Production build (frontend assets)
npm run deploy               # Deploy to Cloudflare Workers
```

### Testing & Linting
```bash
npm run test                 # Run tests in watch mode
npm run test:run             # Run tests once
npm run lint                 # Type check with no emit
```

## Architecture

### Single Worker Architecture
- **Frontend assets** (Vite build): served from the Worker `assets` binding
- **Backend API** (Hono): REST API at `/api/*`, manages data persistence and business logic
- Frontend calls backend API via `services/apiService.ts`

### Data Flow
```
React Components → Custom Hooks → API Service → Backend Routes → Services → Database
```

Example: `TaskDetailPanel.tsx` → `useProjectData.ts` → `apiService.ts` → `/api/tasks` → `taskService.ts` → D1

### Key Directories
- `src/` - Frontend React code
  - `hooks/` - Custom React hooks (useProjectData, useDrafts, useAuditLogs, useChat, useExport)
  - `test/` - Test setup and utilities
- `worker/` - Backend API code
  - `routes/` - API route handlers (projects, tasks, drafts, audit, ai, system)
  - `services/` - Business logic layer
  - `db/` - Database schema and connection
- `components/` - React UI components (lazy-loaded views: KanbanBoard, ListView, GanttChart)

### Database Schema
All tables use `id` (text) as primary key:

- **projects** - Project metadata
- **tasks** - Task records with WBS, dates, dependencies, predecessors (jsonb)
- **drafts** - Pending change requests with actions (jsonb), status, createdBy
- **audit_logs** - Complete change history with before/after snapshots (jsonb)
- **observability_logs** - System monitoring logs

Timestamps use `bigint` mode for Unix milliseconds.

## Draft-First Workflow

The draft system is central to the architecture:

1. **Create draft**: `POST /api/drafts` with array of actions
2. **Apply draft**: `POST /api/drafts/:id/apply`
3. **Audit trail**: All changes logged to `audit_logs` table

Draft actions support:
- `{ type: 'create', entityType: 'task' | 'project', data: {...} }`
- `{ type: 'update', entityType: 'task' | 'project', id: string, data: {...} }`
- `{ type: 'delete', entityType: 'task' | 'project', id: string }`

Frontend hook: `useDrafts.ts` handles draft submission, approval, and discarding.

### Direct vs Drafted Changes
- **Drafted**: `POST /api/drafts` → `POST /api/drafts/:id/apply` (audit trail includes draftId)
- **Direct**: POST/PATCH/DELETE to `/api/projects` or `/api/tasks` (still audited, no draft flow)
- Both approaches write to audit logs with before/after snapshots

## API Response Format

Consistent JSON response structure:
```json
{
  "success": boolean,
  "data": T | null,
  "error": { "code": string, "message": string } | null
}
```

Error handling is centralized in `worker/app.ts` middleware.

## AI Integration

- **Provider**: OpenAI-compatible API (default: `https://api.openai.com/v1`)
- **Environment variables**:
  - `OPENAI_API_KEY` (required)
- **Route**: `POST /api/ai/chat`
- **Usage**: AI suggests actions that create drafts via `useChat.ts` hook

## Import/Export System

### Export Formats
CSV, TSV, JSON, Markdown - scope: active project or all projects

### Import Formats
JSON, CSV, TSV - strategies: Append or Merge by ID

Required CSV/TSV headers (case-insensitive):
```
project,id,title,status,priority,assignee,wbs,startDate,dueDate,completion,isMilestone,predecessors,description,createdAt
```

## Environment Setup

Local dev uses `.env`:
- `DB` binding configured in `wrangler.toml` for D1 (use `wrangler d1` for local migrations)
  - `OPENAI_API_KEY` - OpenAI API key (required)
  - `OPENAI_BASE_URL` - Custom OpenAI endpoint (optional, default: `https://api.openai.com/v1`)
  - `OPENAI_MODEL` - Model name (optional, default: `gpt-4`)

Production uses Cloudflare bindings:
- `DB` binding for D1 connectivity
- `OPENAI_API_KEY` via `wrangler secret put`
- `INIT_TOKEN` via `wrangler secret put` (used by `POST /api/system/init`)
- `OPENAI_BASE_URL` and `OPENAI_MODEL` in `wrangler.toml` `[vars]`

### Initialization
Run once after tables exist:
`POST /api/system/init` with header `X-Init-Token: <INIT_TOKEN>`

## Coding Conventions

- **Naming**: Tables use snake_case, TypeScript uses camelCase/PascalCase
- **Components**: PascalCase.tsx in `components/`
- **Services/Helpers**: camelCase.ts
- **Path alias**: `@/*` resolves from repo root
- **Indentation**: 2 spaces
- **Commit messages**: Conventional Commits format (e.g., `feat: add gantt zoom`)

## Key Architecture Patterns

1. **Service Layer Pattern**: Routes handle HTTP, services contain business logic, database queries abstracted
2. **Serializer Pattern**: Data transformation in `worker/services/serializers.ts`
3. **Lazy Loading**: View components (Kanban, List, Gantt) loaded on demand
4. **Constraint Validation**: `constraintService.ts` validates task dependencies, dates, circular references

## Important Notes

- All timestamps are Unix milliseconds in bigint format
- Draft warnings (e.g., constraint violations) are returned but don't block draft creation
- Audit logs support rollback via `POST /api/audit/:id/rollback`
- The Vite dev server runs on port 5173, proxying API calls to port 8787
- D1 connection is initialized in `worker/db/d1.ts` and injected into Hono context
