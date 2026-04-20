# RawChart

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

## Configuration

All settings are loaded from `.env` — see [.env.example](./.env.example) for the complete, documented list. Most important:

| Variable | Purpose |
|----------|---------|
| `API_KEY` | Required for protected endpoints (`x-api-key` header) |
| `DB_*` | PostgreSQL connection |
| `REDIS_URL` | Redis connection string |
| `ALLOWED_ORIGINS` | CORS allowlist |
| `PORT` | HTTP port (default `3000`) |

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

## License

MIT — see [LICENSE](./LICENSE).
