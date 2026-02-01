# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**ChartSync AI** is an AI-powered chart generation and export application with:
- **Frontend**: React 19.2.3 + Vite 6.2.0 + TypeScript
- **Backend**: Hono on Cloudflare Workers
- **Database**: Cloudflare D1 with Drizzle ORM
- **AI Integration**: OpenAI-compatible API for intelligent chart generation
- **Chart Rendering**: ECharts 5.4.3
- **Deployment**: Cloudflare Workers

The application features AI-driven chart generation from uploaded data, automatic ECharts configuration validation, draft approval workflow, and multi-format export (PNG, SVG, JSON Bundle, PPTX).

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
npm run db:push              # Push schema to local database
npm run db:migrate:prod      # Run migrations on production database
npm run db:studio            # Open Drizzle Studio for database inspection
```

### Build & Deploy
```bash
npm run build:prod           # Production build (frontend assets)
npm run deploy               # Deploy to Cloudflare Workers
```

### Testing & Linting
```bash
npm run lint                 # Type check with no emit
npm run test                 # Run tests in watch mode
npm run test:run             # Run tests once
```

## Architecture

### Single Worker Architecture
- **Frontend assets** (Vite build): served from the Worker `assets` binding
- **Backend API** (Hono): REST API at `/api/*`, manages data persistence and business logic
- Frontend calls backend API via custom hooks

### Data Flow
```
React Components → Custom Hooks → API Routes → Services → Database
```

Example: `AIChartGenerator.tsx` → `useAIChart.ts` → `/api/chart-ai/generate` → `chartAiService.ts` → D1

### Key Directories
- `src/` - Frontend React code
  - `hooks/` - Custom React hooks (useChartData, useChartExports, useAIChart, useChartDrafts, useAuditLogs)
- `worker/` - Backend API code
  - `routes/` - API route handlers (charts, chartAi, chartExports, chartAudit, dataSources, workspaces)
  - `services/` - Business logic layer (chartService, chartAiService, chartExportService, chartValidationService)
  - `db/` - Database schema and connection
- `components/` - React UI components (ChartProjectSidebar, ChartGallery, AIChartGenerator, ChartExportModal, ChartCanvas)

### Database Schema
All tables use `id` (text) as primary key:

**Chart System**:
- **chart_projects** - Chart project metadata
- **chart_configs** - Chart configurations with ECharts config
- **data_sources** - Uploaded data files (CSV, JSON, Excel, MD)
- **chart_drafts** - AI-generated drafts pending approval
- **chart_audit_logs** - Complete change history
- **chart_templates** - Predefined chart templates

**System**:
- **users** - User accounts
- **sessions** - User sessions
- **workspaces** - Workspace isolation
- **workspace_members** - Workspace membership
- **observability_logs** - System monitoring
- **rate_limits** - API rate limiting

Timestamps use `bigint` mode for Unix milliseconds.

## Core Features

### AI Chart Generation
1. **Data Upload**: Users upload CSV/JSON/Excel files
2. **AI Generation**: OpenAI API analyzes data and generates ECharts configs
3. **Auto-Validation**: Zod schemas validate generated configs
4. **Self-Correction**: Invalid configs trigger AI retry (max 3 attempts)
5. **Draft Approval**: Generated charts go through draft approval workflow

### Export System
- **PNG/SVG**: Client-side rendering via ECharts `getDataURL()`
- **JSON Bundle**: Complete chart project with all configs
- **PPTX**: (Planned) Server-side using pptxgenjs with client-rendered images

### Draft Workflow
1. AI generates charts → saves as `chart_drafts`
2. User previews in Chart Gallery
3. Approve: Creates actual `chart_configs`
4. Reject: Discards draft

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

## API Endpoints

### Data Sources
```
POST   /api/data-sources/upload              Upload and parse file
GET    /api/data-sources/project/:projectId  List project data sources
DELETE /api/data-sources/:id                 Delete data source
```

### Chart Projects
```
POST   /api/chart-projects                   Create project
GET    /api/chart-projects                   List workspace projects
PATCH  /api/chart-projects/:id               Update project
DELETE /api/chart-projects/:id               Delete project
```

### Chart Configs
```
POST   /api/charts                           Create chart
GET    /api/charts/project/:projectId        List project charts
GET    /api/charts/:id                       Get chart details
PATCH  /api/charts/:id                       Update chart config
DELETE /api/charts/:id                       Delete chart
POST   /api/charts/:id/validate              Validate ECharts config
```

### AI Generation
```
POST /api/chart-ai/generate                  AI generates charts from data
POST /api/chart-ai/chat                      AI chat to modify existing chart
```

### Chart Exports
```
POST /api/chart-exports/json-bundle          Export project as JSON
POST /api/chart-imports/json-bundle          Import JSON bundle
POST /api/chart-exports/pptx                  (Planned) Export as PPTX
```

### Audit Logs
```
GET  /api/chart-audit                         List audit logs (filtered/paginated)
GET  /api/chart-audit/:id                     Get single audit log
```

## AI Integration

- **Provider**: OpenAI-compatible API (default: `https://api.openai.com/v1`)
- **Environment variables**:
  - `OPENAI_API_KEY` (required, set via `wrangler secret put`)
  - `OPENAI_BASE_URL` (optional, in `wrangler.toml` `[vars]`)
  - `OPENAI_MODEL` (optional, default: `gpt-4`)
- **Route**: `POST /api/chart-ai/generate`
- **Features**:
  - Automatic chart type selection
  - Batch generation (1-10 charts per request)
  - Self-correction with validation feedback
  - Temperature adjustment (0.7 → 0.3) on retry

## Environment Setup

Local dev uses `.env`:
- `DB` binding configured in `wrangler.toml` for D1
- `OPENAI_API_KEY` - OpenAI API key (or compatible)
- `OPENAI_BASE_URL` - Custom OpenAI endpoint (optional)
- `OPENAI_MODEL` - Model name (optional, default: `gpt-4`)

Production uses Cloudflare bindings:
- `DB` binding for D1 connectivity
- `OPENAI_API_KEY` via `wrangler secret put`
- `OPENAI_BASE_URL` and `OPENAI_MODEL` in `wrangler.toml` `[vars]`

## Coding Conventions

- **Naming**: Tables use snake_case, TypeScript uses camelCase/PascalCase
- **Components**: PascalCase.tsx in `components/`
- **Services**: camelCase.ts in `worker/services/`
- **Routes**: camelCase.ts in `worker/routes/`
- **Path alias**: `@/*` resolves from repo root
- **Indentation**: 2 spaces
- **Commit messages**: Conventional Commits format (e.g., `feat(charts): add draft approval`)

## Supported Chart Types

ECharts 5.4.3 supports 12 chart types:
- **line**: 折线图
- **bar**: 柱状图
- **pie**: 饼图
- **scatter**: 散点图
- **map**: 地图
- **radar**: 雷达图
- **gauge**: 仪表盘
- **funnel**: 漏斗图
- **heatmap**: 热力图
- **treemap**: 矩形树图
- **sankey**: 桑基图
- **graph**: 关系图

## Validation

Chart configs are validated using Zod schemas in `worker/services/chartValidationService.ts`:
- Required field checks
- Type validation for ECharts options
- Structural integrity checks
- Custom business rules

## Important Notes

- All timestamps are Unix milliseconds in bigint format
- AI-generated charts require approval before appearing in gallery
- Drafts can be approved or rejected (no rollback needed)
- The Vite dev server runs on port 5173, proxying API calls to port 8787
- D1 connection is initialized in `worker/db/d1.ts` and injected into Hono context
- Client-side rendering required for PPT export (Workers don't have DOM)

## Security

- ✅ All API inputs validated with Zod schemas
- ✅ File upload type and size restrictions
- ✅ Workspace-level data isolation
- ✅ CSRF protection with timing-safe comparison
- ✅ Rate limiting on AI endpoints
- ✅ Audit logging for all chart operations
