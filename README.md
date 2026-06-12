<p align="center">
  <img src="logo.svg" alt="RawChart logo" width="140" height="140">
</p>

<h1 align="center">RawChart</h1>

![CI](https://github.com/rawendil/raw-chart-service/actions/workflows/ci.yml/badge.svg)
![License](https://img.shields.io/github/license/rawendil/raw-chart-service)
![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)

A high-performance microservice for generating, storing, and serving interactive charts using Chart.js and Node.js.

## Features

- Interactive charts (bar, line, pie, and more) stored and served via REST API
- PNG export and embeddable HTML output
- API-key authentication, rate limiting, CORS, Helmet
- Redis caching and Swagger/OpenAPI docs
- Dockerized with multi-stage builds

## Tech Stack

Node.js · TypeScript · Express · PostgreSQL · Redis · Chart.js + Puppeteer · Docker

## Quick Start

```bash
git clone <repository-url>
cd rawchart-service
cp .env.example .env   # edit secrets
docker compose up -d
```

Services start on:

- API: <http://localhost:3000>
- Swagger docs: <http://localhost:3000/api/docs>
- PostgreSQL: `localhost:5433`
- Redis: `localhost:6380`

Health check: `curl http://localhost:3000/api/health`

### Deploying on Coolify

Use [docker-compose.coolify.yml](./docker-compose.coolify.yml) instead of the standalone file. It drops fixed container names, keeps Postgres/Redis on the internal network only, and `expose`s the app on port 3000 so Coolify's proxy can route a domain + TLS to it.

Set the environment variables in Coolify's UI rather than committing a `.env`. `DB_PASSWORD` and `API_KEY` are required and should stay **Runtime-only** (not Available at Buildtime, so they aren't baked into image layers) — the app won't start without them (zod env validation rejects a short/empty `API_KEY`, and Postgres refuses to boot without a password). If you expose the app publicly, set `ALLOWED_ORIGINS` to your domain. Everything else has a sensible default.

The standalone `docker-compose.yml` is unchanged and still works anywhere with a hand-written `.env`.

## Configuration

All settings are loaded from `.env` — see [.env.example](./.env.example) for the complete, documented list. Most important:

| Variable | Purpose |
|----------|---------|
| `API_KEY` | Required for protected endpoints (`x-api-key` header) |
| `DB_*` | PostgreSQL connection |
| `REDIS_URL` | Redis connection string |
| `ALLOWED_ORIGINS` | CORS allowlist |
| `PORT` | HTTP port (default `3000`) |
| `EXPIRED_CHART_CLEANUP_ENABLED` | Periodically delete charts past `expires_at` (`true`/`false`, default `true`) |
| `EXPIRED_CHART_CLEANUP_INTERVAL_MS` | How often the cleanup sweep runs (default `3600000` = 1h) |
| `EXPIRED_CHART_RETENTION_MS` | Grace period after `expires_at` before deletion; `0` = delete immediately |

## Usage

Generate a chart:

```bash
curl -X POST http://localhost:3000/api/charts/generate \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{
    "title": "Sales Report",
    "chartType": "bar",
    "data": {
      "labels": ["Jan", "Feb", "Mar"],
      "datasets": [{ "label": "Sales", "data": [100, 200, 150] }]
    }
  }'
```

Full endpoint reference, authentication details, and more examples: [docs/api.md](./docs/api.md).

## Development

- Local setup without Docker, scripts, and project layout: [docs/development.md](./docs/development.md)
- Interactive API explorer: <http://localhost:3000/api/docs>

## Themes

Charts support two built-in themes: `light` (default) and `dark`. Pass the `theme` field when generating a chart:

```bash
curl -X POST http://localhost:3000/api/charts/generate \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{
    "title": "Sales Report",
    "chartType": "bar",
    "theme": "dark",
    "data": { "labels": ["Jan", "Feb"], "datasets": [{ "label": "Sales", "data": [100, 200] }] }
  }'
```

### Adding a custom theme

Themes are defined in one place — [src/config/themes.ts](./src/config/themes.ts). To add a theme
(e.g. `"brand"`), add one entry to the `THEMES` map:

```ts
brand: {
  background: '#0b1020', // page + chart background
  text: '#e6e8ee',       // legend, axis ticks, embed heading
  mutedText: '#9aa3b2',  // embed description
  grid: '#243049',       // axis grid lines
  palette: ['#7aa2ff', '#ff6b6b', '#34d399', '#fbbf24', '#a78bfa', '#f472b6'],
},
```

Everything else derives from this map automatically: the `Theme` type, the request-validation
enum, the Swagger enum, the PNG renderer, and the embed page (which injects the colors into the
page for the browser script). No other file needs editing.

## Embed

Charts without a `shareToken` (public) can be embedded directly as an iframe:

```html
<iframe src="http://localhost:3000/api/charts/{hash}/embed" width="800" height="600" frameborder="0"></iframe>
```

For charts with a `shareToken`, append it as a query parameter:

```html
<iframe src="http://localhost:3000/api/charts/{hash}/embed?token={shareToken}" width="800" height="600" frameborder="0"></iframe>
```

The embed endpoint serves a self-contained HTML page (no external dependencies) with its own Content-Security-Policy header, safe for use in third-party sites.

## Expired-chart cleanup

Charts created with an `expiresAt` are hidden from all read endpoints once they expire, but their rows stay in the database until deleted. The service deletes them automatically: a background sweep runs **inside the app process** (no cron job, systemd unit, or server-side setup required) — it starts one pass immediately on boot and then repeats on a timer.

Configure it entirely via `.env`:

| Variable | Default | Purpose |
|----------|---------|---------|
| `EXPIRED_CHART_CLEANUP_ENABLED` | `true` | Master on/off switch. Set to `false` to disable the sweep entirely. |
| `EXPIRED_CHART_CLEANUP_INTERVAL_MS` | `3600000` (1h) | How often the sweep runs. |
| `EXPIRED_CHART_RETENTION_MS` | `0` | Grace period after `expires_at` before a row is deleted. `0` means delete as soon as it expires — it is **not** an off-switch (use `EXPIRED_CHART_CLEANUP_ENABLED=false` for that). |

Notes:

- The timer lives in the running process, so cleanup only happens while the app is up. After a restart it catches up on the first pass.
- `DELETE` lets PostgreSQL reuse the freed space; autovacuum reclaims it in the background. No manual `VACUUM` is needed under normal load.
- Charts without an `expiresAt` are never touched — they live until explicitly deleted via `DELETE /api/charts/:hash`.

## License

MIT — see [LICENSE](./LICENSE).
