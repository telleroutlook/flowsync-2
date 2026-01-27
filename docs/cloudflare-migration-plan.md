# FlowSync -> Cloudflare Workers Migration Plan

> **Status**: Completed. The project now runs on Cloudflare Workers with D1-backed SQLite and Vite static assets.

Scope: migrate both frontend and backend to run on Cloudflare Workers with D1 for persistence.

This plan assumed:
- The backend was Hono running on Node (`src/server.ts`).
- The frontend was a Vite SPA.

---

## 1) Goals and Acceptance Criteria

Goals:
- Single Cloudflare Worker handles API (`/api/*`) and serves frontend assets.
- D1 connectivity via Cloudflare D1 binding.
- No Node-only APIs at runtime (Workers-compatible).
- Lint/typecheck/tests pass.
- Production deployment via `wrangler deploy`.

Acceptance criteria (met):
- `wrangler dev` serves both UI and API locally (optional).
- API endpoints return expected data and auth works.
- Frontend loads and can perform core flows (projects, tasks, drafts, audit, auth).
- D1 successfully connects to the Worker.
- One-time init endpoint exists for public workspace + seed data (`POST /api/system/init`).

---

## 2) Repository Structure Changes

Add:
- `wrangler.toml`
- `worker/index.ts` (Workers entry)
- `worker/db/d1.ts` updated for D1/Workers
- `docs/cloudflare-migration-plan.md` (this plan)

Modify:
- `package.json` scripts for `wrangler dev` / `wrangler deploy`
- `worker/utils/bigmodelAuth.ts` (remove Node crypto/Buffer)
- `worker/services/authService.ts` (remove Buffer fallbacks)
- `worker/types.ts` (add D1 binding type)
- `worker/app.ts` (attach `env` correctly)
- `vite.config.ts` (static assets config for Worker build)

Remove or keep (decision):
- `src/server.ts` (Node-only entry) becomes unused in prod. Keep for local Node dev only if needed.

---

## 3) Backend Runtime Migration (Workers)

### 3.1 Add Worker entry
- Create `worker/index.ts` as the Worker fetch handler:
  - Build the Hono app using `createApp`.
  - Construct DB connection using `env.DB`.
  - Pass `env` into `createApp`.

### 3.2 Replace Node-specific runtime pieces
- `worker/utils/bigmodelAuth.ts`:
  - Replace `crypto.createHmac` + `Buffer` with Web Crypto (HMAC SHA-256) and base64url helpers.
- `worker/services/authService.ts`:
  - Remove `Buffer` fallbacks in `toBase64` and `fromBase64`.
  - Use `btoa` / `atob` only (Workers provide them).

### 3.3 Environment bindings
- Update `worker/types.ts`:
  - Add `DB` binding type for D1.
  - Keep `OPENAI_*` as bindings.
- Ensure `createApp` and middleware use `c.env` bindings (Workers standard).

---

## 4) Database + D1

### 4.1 Update driver
- Use `drizzle-orm/d1` with `sqlite` schema definitions.

### 4.2 Refactor DB connection for Workers
- Implement `worker/db/d1.ts` to:
  - Accept `env` binding instead of `process.env`.
  - Use `env.DB` for D1.
  - Avoid `process.env` / `VCAP_SERVICES` logic.

---

## 5) Frontend + Static Assets in Workers

Preferred approach: Workers Static Assets
- Build assets to `dist/` using Vite.
- Configure `wrangler.toml` with `assets` directory.
- Worker routes:
  - `/api/*` -> Hono app
  - everything else -> `env.ASSETS.fetch(request)`

---

## 6) Wrangler Configuration

Create `wrangler.toml` with:
- `name`, `main`, `compatibility_date`
- `compatibility_flags = ["nodejs_compat_v2"]`
- D1 binding
- Static assets binding

Example fields to include:
- `d1_databases` binding named `DB`
- `assets` directory set to `dist`

---

## 7) Scripts and Tooling Updates

Update `package.json` scripts:
- `dev` -> `vite`
- `build` -> `vite build`
- `deploy` -> `wrangler deploy`
- Keep `test` and `lint` as-is

Add a script for Workers local dev if needed:
- `dev:worker`: `wrangler dev`

---

## 8) Secrets and Config

- Store `OPENAI_API_KEY` via `wrangler secret put`.
- `DB` binding configured in Cloudflare dashboard; local D1 is managed by `wrangler d1`.

---

## 9) Testing and Verification Plan

Unit tests:
- `npm test`

Runtime tests (local):
- `wrangler dev` and open UI
- `GET /api/projects`
- Auth flow: login -> session -> CRUD project

Runtime tests (staging/prod):
- `wrangler deploy` and re-test endpoints
- Check DB write/read consistency

---

## 10) Cutover Strategy

1. Deploy new Worker to a staging domain.
2. Verify API + UI workflows.
3. Point production DNS to Worker.
4. Monitor errors and latency.

Rollback plan:
- Keep old Node server deployment until new Worker is stable.

---

## 11) Work Breakdown (Concrete Tasks)

Phase 1: Prep
- [x] Remove Node entry `src/server.ts` from prod flow.
- [x] Add `wrangler.toml` with D1 and assets config.

Phase 2: Runtime changes
- [x] Add `worker/index.ts` fetch entry.
- [x] Update `worker/db/d1.ts` for D1 env.
- [x] Update `worker/types.ts` bindings (including `INIT_TOKEN`).
- [x] Replace Node crypto usage in `worker/utils/bigmodelAuth.ts`.
- [x] Remove Buffer fallback from `worker/services/authService.ts`.

Phase 3: Frontend assets
- [x] Ensure Vite build outputs to `dist/`.
- [x] Add assets routing in Worker for SPA.

Phase 4: Scripts and CI
- [x] Update `package.json` scripts to use `wrangler`.
- [x] Adjust dev/prod docs in `README.md`.

Phase 5: Validate
- [x] `npm run lint`
- [x] `npm test`
- [x] `wrangler dev` manual checks
- [x] `wrangler deploy` to staging

---

## 12) Open Questions (Resolved)

- Switched to Workers-only dev via `npm run dev:worker`.
- Single Worker serves both API and UI assets.
