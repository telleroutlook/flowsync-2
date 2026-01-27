# FlowSync -> Cloudflare Workers Migration Plan

> **Status**: Completed. The project now runs on Cloudflare Workers with Hyperdrive-backed PostgreSQL and Vite static assets.

Scope: migrate both frontend and backend to run on Cloudflare Workers with Hyperdrive for PostgreSQL.

This plan assumed:
- The backend was Hono running on Node (`src/server.ts`).
- The DB was PostgreSQL accessed via `pg` and Drizzle.
- The frontend was a Vite SPA.

---

## 1) Goals and Acceptance Criteria

Goals:
- Single Cloudflare Worker handles API (`/api/*`) and serves frontend assets.
- PostgreSQL connectivity via Cloudflare Hyperdrive binding.
- No Node-only APIs at runtime (Workers-compatible).
- Lint/typecheck/tests pass.
- Production deployment via `wrangler deploy`.

Acceptance criteria (met):
- `wrangler dev` serves both UI and API locally (optional).
- API endpoints return expected data and auth works.
- Frontend loads and can perform core flows (projects, tasks, drafts, audit, auth).
- Hyperdrive successfully connects to the Postgres instance.
- One-time init endpoint exists for public workspace + seed data (`POST /api/system/init`).

---

## 2) Repository Structure Changes

Add:
- `wrangler.toml`
- `worker/index.ts` (Workers entry)
- `worker/db/pg.ts` updated for Hyperdrive/Workers
- `docs/cloudflare-migration-plan.md` (this plan)

Modify:
- `package.json` scripts for `wrangler dev` / `wrangler deploy`
- `worker/utils/bigmodelAuth.ts` (remove Node crypto/Buffer)
- `worker/services/authService.ts` (remove Buffer fallbacks)
- `worker/types.ts` (add Hyperdrive binding type)
- `worker/app.ts` (attach `env` correctly)
- `vite.config.ts` (static assets config for Worker build)

Remove or keep (decision):
- `src/server.ts` (Node-only entry) becomes unused in prod. Keep for local Node dev only if needed.

---

## 3) Backend Runtime Migration (Workers)

### 3.1 Add Worker entry
- Create `worker/index.ts` as the Worker fetch handler:
  - Build the Hono app using `createApp`.
  - Construct DB connection using `env.HYPERDRIVE.connectionString`.
  - Pass `env` into `createApp`.

### 3.2 Replace Node-specific runtime pieces
- `worker/utils/bigmodelAuth.ts`:
  - Replace `crypto.createHmac` + `Buffer` with Web Crypto (HMAC SHA-256) and base64url helpers.
- `worker/services/authService.ts`:
  - Remove `Buffer` fallbacks in `toBase64` and `fromBase64`.
  - Use `btoa` / `atob` only (Workers provide them).

### 3.3 Environment bindings
- Update `worker/types.ts`:
  - Add `HYPERDRIVE` binding type.
  - Keep `OPENAI_*` as bindings.
- Ensure `createApp` and middleware use `c.env` bindings (Workers standard).

---

## 4) Database + Hyperdrive

### 4.1 Update PostgreSQL driver
- Bump `pg` to `>= 8.16.3` (Hyperdrive requirement).
- Ensure `nodejs_compat_v2` flag in `wrangler.toml`.

### 4.2 Refactor DB connection for Workers
- Update `worker/db/pg.ts` to:
  - Accept `env` binding instead of `process.env`.
  - Use `env.HYPERDRIVE.connectionString`.
  - Avoid `process.env` / `VCAP_SERVICES` logic.

### 4.3 Pool lifecycle
- Workers are short-lived; keep a global pool with lazy init.
- Ensure `closePgDb` exists for local tests if needed.

---

## 5) Frontend + Static Assets in Workers

Preferred approach: Workers Static Assets
- Build assets to `dist/` using Vite.
- Configure `wrangler.toml` with `assets` directory.
- Worker routes:
  - `/api/*` -> Hono app
  - everything else -> `env.ASSETS.fetch(request)`

Alternative approach: Cloudflare Vite plugin
- Use `@cloudflare/vite-plugin` for unified build.
- Only if static assets integration is preferred by the team.

---

## 6) Wrangler Configuration

Create `wrangler.toml` with:
- `name`, `main`, `compatibility_date`
- `compatibility_flags = ["nodejs_compat_v2"]`
- Hyperdrive binding
- Static assets binding
- `vars` for `OPENAI_BASE_URL`, `OPENAI_MODEL` (secrets for `OPENAI_API_KEY`)

Example fields to include:
- `hyperdrive` binding named `HYPERDRIVE`
- `assets` directory set to `dist`

---

## 7) Scripts and Tooling Updates

Update `package.json` scripts:
- `dev` -> `wrangler dev --local` (or `wrangler dev`)
- `build` -> `vite build`
- `deploy` -> `wrangler deploy`
- Keep `test` and `lint` as-is

Add a script for Workers local dev if needed:
- `dev:worker`: `wrangler dev` (with local Hyperdrive connection string)

---

## 8) Secrets and Config

- Store `OPENAI_API_KEY` via `wrangler secret put`.
- `OPENAI_BASE_URL` and `OPENAI_MODEL` can be set in `wrangler.toml` vars.
- `HYPERDRIVE` binding configured in Cloudflare dashboard; local string set in `wrangler.toml` for dev.

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
- [x] Upgrade `pg` dependency.
- [x] Add `wrangler.toml` with Hyperdrive and assets config.

Phase 2: Runtime changes
- [x] Add `worker/index.ts` fetch entry.
- [x] Update `worker/db/pg.ts` for Hyperdrive env.
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
- SAP BTP references are deprecated in this repo.
