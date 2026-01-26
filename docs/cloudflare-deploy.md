# Cloudflare Deployment & Debug Guide

This document covers local development, deployment, and debugging for the Cloudflare Workers runtime.

## 1) Prerequisites

- Cloudflare account with Workers + Hyperdrive enabled
- Wrangler installed (`npm i -g wrangler` or use `npx wrangler`)
- PostgreSQL reachable by Hyperdrive (already configured via tunnel)

## 2) Configure Wrangler

Update `wrangler.toml`:
- `[[hyperdrive]]` -> set the correct `id`
- `localConnectionString` -> for local dev only (do **not** commit secrets)

## 3) Secrets (Required)

Based on `flowsync-1/.env`, the only runtime secret used by the Worker is:

```bash
wrangler secret put OPENAI_API_KEY
```

Notes:
- `OPENAI_BASE_URL` and `OPENAI_MODEL` are not secrets. They are configured in `wrangler.toml` under `[vars]`.
- Database credentials are managed by Hyperdrive. The Worker does **not** read `DATABASE_URL` at runtime.

## 4) Local vs Production Config

Local development:
- Use `.env` for `OPENAI_API_KEY` and `DATABASE_URL`.
- Run `npm run dev` + `npm run dev:worker`.

Production (Cloudflare):
- Use `wrangler secret put` for `OPENAI_API_KEY`.
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

## 6) Build & Deploy

Build UI assets:
```bash
npm run build:prod
```

Deploy:
```bash
npm run deploy
```

## 7) Common Debug Commands

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

## 8) Runtime Checklist

- `OPENAI_API_KEY` is set via `wrangler secret`
- Hyperdrive binding is configured and the `id` is correct
- `wrangler.toml` assets directory points to `dist`
- `npm run build:prod` executed before deploy

## 9) Known Gotchas

- Do not commit database passwords to `wrangler.toml`.
- Hyperdrive requires `nodejs_compat_v2` for `pg`.
- If `wrangler dev` cannot connect to Postgres, verify tunnel/Hyperdrive status and local connection string.
