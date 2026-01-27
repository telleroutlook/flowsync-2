# Cloudflare Deployment & Debug Guide

This document covers local development, deployment, and debugging for the Cloudflare Workers runtime.

## 1) Prerequisites

- Cloudflare account with Workers + Hyperdrive enabled
- Wrangler installed (`npm i -g wrangler` or use `npx wrangler`)
- PostgreSQL reachable by Hyperdrive (already configured via tunnel)

## 2) Configure Wrangler

Update `wrangler.toml`:
- `[[hyperdrive]]` -> set the correct `id`
- `localConnectionString` can be set for local development only (do not commit real passwords)

## 3) Secrets (Required)

The only runtime secrets used by the Worker are:

```bash
wrangler secret put OPENAI_API_KEY
wrangler secret put INIT_TOKEN
```

Notes:
- `OPENAI_BASE_URL` and `OPENAI_MODEL` are not secrets. They are configured in `wrangler.toml` under `[vars]`.
- Database credentials are managed by Hyperdrive. The Worker does **not** read `DATABASE_URL` at runtime.
- `INIT_TOKEN` is required for `POST /api/system/init` (one-time initialization).

## 4) Local vs Production Config

Local development:
- Use `.env` for `OPENAI_API_KEY` and `DATABASE_URL` (or a dev-only `localConnectionString` in `wrangler.toml`).
- Run `npm run dev` + `npm run dev:worker`.

Production (Cloudflare):
- Use `wrangler secret put` for `OPENAI_API_KEY`.
- Use `wrangler secret put` for `INIT_TOKEN`.
- Configure `OPENAI_BASE_URL` and `OPENAI_MODEL` in `wrangler.toml` `[vars]`.
- Hyperdrive handles database credentials; no `DATABASE_URL` in production.

## 5) Local Development

Terminal A (Workers API):
```bash
npm run dev:worker
```

Terminal B (Vite UI):
```bash
npm run dev
```

Vite proxies `/api/*` to `http://127.0.0.1:8787`.

## 6) Database SQL Migrations (Required)

Cloudflare Workers + Hyperdrive does **not** run migrations automatically. You must apply the SQL migrations to the target PostgreSQL database **before** calling the init endpoint.

The migrations live in `migrations/*.sql` and are intended to be applied in order:

1. `migrations/0000_icy_spitfire.sql`
2. `migrations/0001_auth_workspace.sql`

Example using `psql` (run from a trusted machine with DB access):
```bash
psql "$DATABASE_URL" -f migrations/0000_icy_spitfire.sql
psql "$DATABASE_URL" -f migrations/0001_auth_workspace.sql
```

Notes:
- The Hyperdrive database is usually not directly reachable from this machine. Run these commands from the same network/VPC as the database.
- If the database runs locally on this host (e.g., Docker), you can pipe the SQL into the Postgres container:
  ```bash
  cat migrations/0000_icy_spitfire.sql | docker exec -i <postgres-container> psql -U <user> -d <db> -v ON_ERROR_STOP=1
  cat migrations/0001_auth_workspace.sql | docker exec -i <postgres-container> psql -U <user> -d <db> -v ON_ERROR_STOP=1
  ```
- Migrations are idempotent only where explicitly written (e.g., `ON CONFLICT DO NOTHING`); do not re-run arbitrarily.

## 7) Build & Deploy

Build UI assets:
```bash
npm run build:prod
```

Deploy:
```bash
npm run deploy
```

Initialize base data (one-time):
```bash
curl -X POST \
  -H "X-Init-Token: <INIT_TOKEN>" \
  https://<your-worker-domain>/api/system/init
```

What init does:
- Creates the `public` workspace if missing.
- Seeds default projects/tasks if the database is empty.

## 8) Directus / Cloudflare Tunnel Connectivity Checks

Use these to confirm the Directus API and the tunneled Postgres endpoint are reachable.

Directus API health (expect 200):
```bash
curl -sS -o /dev/null -w "%{http_code}\n" https://db.workchatly.com/server/info
```

Postgres over tunnel (replace values, keep `connect_timeout`):
```bash
psql "postgresql://<user>:<password>@<tunnel-host>:5432/<db>?sslmode=require&connect_timeout=10" -c "select 1;"
```

If your Postgres TLS is self-signed, add a CA file:
```bash
PGSSLROOTCERT=/path/to/server.crt psql "postgresql://<user>:<password>@<tunnel-host>:5432/<db>?sslmode=require&connect_timeout=10" -c "select 1;"
```

## 9) Common Debug Commands

View live Worker logs:
```bash
wrangler tail
```

Verify your Cloudflare account:
```bash
wrangler whoami
```

List deployments:
```bash
wrangler deployments list
```

## 10) Runtime Checklist

- `OPENAI_API_KEY` is set via `wrangler secret`
- `INIT_TOKEN` is set via `wrangler secret`
- Hyperdrive binding is configured and the `id` is correct
- `wrangler.toml` assets directory points to `dist`
- `npm run build:prod` executed before deploy

## 11) Known Gotchas

- Do not commit database passwords to `wrangler.toml`.
- Hyperdrive requires `nodejs_compat_v2` for `pg`.
- Apply SQL migrations from `migrations/*.sql` to the Hyperdrive database before first init.
