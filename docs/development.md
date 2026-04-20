# Development

## Local setup without Docker

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy and edit env file:

   ```bash
   cp .env.example .env
   ```

3. Start PostgreSQL and Redis (example via Docker):

   ```bash
   docker run -d --name postgres \
     -e POSTGRES_DB=rawchart_service \
     -e POSTGRES_USER=postgres \
     -e POSTGRES_PASSWORD=password \
     -p 5433:5432 postgres:15-alpine

   docker run -d --name redis -p 6380:6379 redis:7-alpine
   ```

4. Run the service:

   ```bash
   npm run dev          # development with hot reload
   # or
   npm run build && npm start   # production build
   ```

## npm scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Start dev server with hot reload |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled production build |
| `npm test` | Run test suite |
| `npm run lint` / `lint:fix` | ESLint check / autofix |
| `npm run docker:build` | Build Docker image |
| `npm run docker:run` | Run the built image |
| `npm run docker:compose:up` / `:down` | Start/stop full stack |
| `npm run docker:rebuild` | Rebuild and restart services |
| `npm run docker:logs` | Follow Docker Compose logs |

## Project structure

```
src/
├── config/          # Configuration loaders
├── middleware/      # Express middleware
├── routes/          # API route handlers
├── services/        # Business logic
├── types/           # TypeScript type definitions
├── utils/           # Shared utilities
└── index.ts         # Application entry point

public/
└── js/              # Client-side JS for rendered charts
```

## Docker

Build and run just the service image (expects external DB/Redis):

```bash
docker build -t rawchart-service .

docker run -p 3000:3000 \
  -e DB_HOST=your-db-host \
  -e DB_PASSWORD=your-db-password \
  rawchart-service
```

Full stack (recommended):

```bash
docker compose up -d
```
