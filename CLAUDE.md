# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # ts-node, no hot reload (use dev:watch for nodemon)
npm run build        # tsc -> dist/, then copy:static (see note below)
npm test             # jest (all suites under src/__tests__)
npx jest src/__tests__/middleware/auth.test.ts   # single test file
npx jest -t "rejects missing key"                 # single test by name
npm run lint         # eslint src/**/*.ts  (lint:fix to autofix)

docker compose up -d        # full stack: app + postgres(5433) + redis(6380)
npm run docker:rebuild      # compose down + up --build after code changes
npm run docker:logs
```

`npm run build` is more than `tsc`: `copy:static` also copies favicon/manifest assets into `dist/` and **bundles `node_modules/chart.js/dist/chart.umd.js` into `public/js/chart.js`**. Both the server-side renderer and the embed page depend on that bundled file existing, so a bare `tsc` is not enough to run the app.

CI (`.github/workflows/ci.yml`) runs **build + lint only on Node 18 & 20 — it does not run the test suite.** Run `npm test` locally before relying on it.

## Architecture

Express microservice that stores chart definitions in PostgreSQL and renders them as PNG (server-side) or interactive HTML (client-side). Single entry point [src/index.ts](src/index.ts) wraps everything in an `App` class.

**Service lifecycle & injection.** `App` constructs one `DatabaseService` and one `RedisService` at startup. A middleware attaches them to `req.app.locals`; route handlers pull them out via `getServices(req)` ([src/routes/charts.ts](src/routes/charts.ts)). Note `getServices` creates a **new `ChartGeneratorService` per request**, but it reuses the shared `RedisService`. Redis failure is non-fatal — the app logs a warning and runs without caching.

**No migration files.** Schema is created/evolved at startup by idempotent `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... IF EXISTS` statements in `DatabaseService.createTables()` ([src/services/database.ts](src/services/database.ts)). To change the schema, edit that method — there is no separate migration tool. Single table: `charts`. Reads do not write to the DB (there is no access logging).

**Two independent rendering paths — keep them in sync:**
- **PNG** ([src/services/chartGenerator.ts](src/services/chartGenerator.ts)): launches headless Chromium via Puppeteer (`CHROMIUM_PATH`, defaults to Alpine's `/usr/bin/chromium-browser`), inlines the bundled Chart.js into a generated HTML page, screenshots `#chart-container canvas`. Results are cached in Redis for 1h keyed by an md5 of data+options.
- **Embed HTML** ([src/views/embedPage.ts](src/views/embedPage.ts)): server-renders a self-contained page that loads `/js/chart.js` + `/js/embed-chart.js` and draws in the browser. Untrusted fields are escaped via [src/utils/html.ts](src/utils/html.ts); the route sets a strict per-response CSP.

Both paths derive colors/scales by `theme` independently, so theming logic is duplicated. Adding a theme requires edits across ~5 files — the procedure is documented in [README.md](README.md#adding-a-custom-theme) (only `light`/`dark` exist today).

**Access control** ([src/utils/access.ts](src/utils/access.ts)). Mutations (`POST /generate`, `PUT`, `DELETE`) require the single shared `x-api-key` ([src/middleware/auth.ts](src/middleware/auth.ts)) — there is no per-user auth. Reads are governed by `checkAccess`: a chart with `share_token === null` is fully public; otherwise the caller must supply the token (`?token=` query or `x-share-token` header) or the master `API_KEY`. Expired charts (`expires_at`) are treated as not-found.

**Expired-chart cleanup.** `App` runs a background sweep (started after `initializeDatabase()`, cleared in `stop()`) that deletes rows past `expires_at`, freeing DB space. Controlled by env: `EXPIRED_CHART_CLEANUP_ENABLED` (master on/off), `EXPIRED_CHART_CLEANUP_INTERVAL_MS` (sweep frequency), `EXPIRED_CHART_RETENTION_MS` (grace period after `expires_at`; `0` = delete immediately — not an off-switch).

**Validation & config.** Request bodies are validated by zod schemas in [src/middleware/validation.ts](src/middleware/validation.ts) (`validateBody(...)`). Environment is validated by zod in [src/config/env.ts](src/config/env.ts) and **the process exits on invalid/missing env** — import `env` from there rather than reading `process.env` directly. When adding a chart type or theme, update the zod enum here *and* the TS types in [src/types/database.ts](src/types/database.ts) *and* the renderers.

**API conventions.** The HTTP API is camelCase (`chartType`, `shareToken`, `expiresAt`); the DB is snake_case (`chart_type`, ...). Routes do this mapping by hand. All responses use the `ApiResponse` envelope `{ success, data | error }`. Charts are addressed by a random 16-byte hex `chart_hash`, not the UUID primary key.
