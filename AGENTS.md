# Repository Guidelines

## Project Structure & Module Organization
- `worker/app.ts` is the Cloudflare Workers entry point for the Hono backend.
- `worker/` contains backend routes, services, and database schemas.
- `App.tsx` hosts the main UI state and page layout.
- `index.tsx` is the React entry point; `index.html` is the Vite HTML shell.
- `components/` contains UI modules (PascalCase files like `ChartGallery.tsx`, `AIChartGenerator.tsx`).
- `src/hooks/` contains custom React hooks for data management.
- `types.ts` centralizes shared TypeScript types and enums.
- `migrations_sqlite/` contains Drizzle/SQLite (D1) migration files.

## Build, Test, and Development Commands
- `npm install` — install dependencies.
- `npm run dev` — start the Vite dev server (frontend).
- `npm run dev:worker` — start the Workers backend server.
- `npm run build:prod` — build frontend assets for production.
- `npm run deploy` — deploy to Cloudflare Workers.
- `npm run lint` — type check with no emit.
- `npm run test` — run unit tests via Vitest.
- `npm run db:generate` — generate Drizzle migration files.
- `npm run db:push` — push schema changes to local database.
- `npm run db:migrate:prod` — run migrations on production database.
- `npm run db:studio` — open Drizzle Studio to inspect the database.

## Architecture & Tech Stack
- **Backend**: Cloudflare Workers + Hono.
- **Database**: Cloudflare D1 (via Drizzle ORM).
- **Frontend**: React 19 + Vite.
- **Charts**: ECharts 5.4.3
- **AI**: OpenAI-compatible API
- **Deployment**: Cloudflare Workers.

## Coding Style & Naming Conventions
- TypeScript + React with ES modules (`"type": "module"`).
- Indentation uses 2 spaces; JSX uses React's `react-jsx` transform.
- Component files are `PascalCase.tsx`; helpers/services are `camelCase.ts`.
- Prefer named exports for components in `components/` and keep types in `types.ts`.
- Path alias `@/*` resolves from the repo root (see `tsconfig.json`).
- Database tables use snake_case; TypeScript uses camelCase/PascalCase.

## Testing Guidelines
- Testing framework: **Vitest**.
- Tests are co-located with source files (e.g., `components/ChartGallery.test.tsx`, `worker/services/chartService.test.ts`).
- Ensure all business logic in `worker/services/` is covered by tests.
- Use `npm test` to run the suite.

## Commit & Pull Request Guidelines
- Commit messages follow Conventional Commits (e.g., `feat(charts): add draft approval`, `fix: validation`).
- PRs should include a clear description, how to test, and UI screenshots/GIFs for visual changes.
- Link related issues/tickets when applicable.

## Security & Configuration Tips
- Set `OPENAI_API_KEY` via `wrangler secret put` (never commit).
- Do not commit secrets or local env files.
- Keep external calls isolated in `worker/services/` and validate inputs before use.
- All API inputs are validated with Zod schemas.

## Chart-Specific Guidelines

### AI Chart Generation Workflow
1. User uploads data (CSV/JSON/Excel)
2. AI analyzes data and generates ECharts configs
3. Zod validation checks config validity
4. Invalid configs trigger AI self-correction (max 3 retries)
5. Valid configs are saved as drafts
6. User approves/rejects drafts
7. Approved drafts become actual chart configs

### Supported Chart Types
- line (折线图), bar (柱状图), pie (饼图)
- scatter (散点图), map (地图), radar (雷达图)
- gauge (仪表盘), funnel (漏斗图), heatmap (热力图)
- treemap (矩形树图), sankey (桑基图), graph (关系图)

### Export Formats
- **PNG/SVG**: Client-side via ECharts `getDataURL()`
- **JSON Bundle**: Complete project export for re-import
- **PPTX**: (Planned) Server-side with pptxgenjs
