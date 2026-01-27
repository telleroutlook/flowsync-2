# Cloudflare Deployment & Debug Guide

This document covers local development, deployment, and debugging for the Cloudflare Workers runtime.

## 1) Prerequisites

- Cloudflare account with Workers + D1 enabled
- Wrangler installed (`npm i -g wrangler` or use `npx wrangler`)

## 2) Configure Wrangler

Update `wrangler.toml`:
- `[[d1_databases]]` -> set `binding`, `database_name`, and `database_id`
- `migrations_dir` should point to `migrations_sqlite`

## 3) Secrets (Required)

The only runtime secrets used by the Worker are:

```bash
wrangler secret put OPENAI_API_KEY
wrangler secret put INIT_TOKEN
```

Notes:
- `INIT_TOKEN` is required for `POST /api/system/init` (one-time initialization).
- `OPENAI_BASE_URL` and `OPENAI_MODEL` are configured in `wrangler.toml` `[vars]`.

## 4) Local vs Production Config

Local development:
- Run `npm run dev` + `npm run dev:worker`.
- Apply D1 migrations locally with Wrangler (see next section).

Production (Cloudflare):
- Use `wrangler secret put` for `OPENAI_API_KEY` and `INIT_TOKEN`.
- Configure `OPENAI_BASE_URL` and `OPENAI_MODEL` in `wrangler.toml` `[vars]`.
- Apply D1 migrations to the remote database (see next section).

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

## 6) Database Migrations (Required)

Cloudflare D1 does **not** run migrations automatically. You must apply the SQL migrations to the target D1 database **before** calling the init endpoint.

Local (D1 in Miniflare):
```bash
npx wrangler d1 migrations apply flowsync --local
```

Production (D1 in Cloudflare):
```bash
npx wrangler d1 migrations apply flowsync --remote
```

Notes:
- Migrations live in `migrations_sqlite/*.sql` and must be applied in order.
- Migrations are idempotent only where explicitly written; do not re-run arbitrarily.

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

## 8) Common Debug Commands

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

## 9) Runtime Checklist

- `OPENAI_API_KEY` is set via `wrangler secret`
- `INIT_TOKEN` is set via `wrangler secret`
- `DB` binding is configured and the `database_id` is correct
- `wrangler.toml` assets directory points to `dist`
- `npm run build:prod` executed before deploy
- `migrations_sqlite/*.sql` applied to D1 before first init

## 10) Known Gotchas

- Do not commit secrets to `wrangler.toml`.
- D1 migrations must be applied before the first init call.
