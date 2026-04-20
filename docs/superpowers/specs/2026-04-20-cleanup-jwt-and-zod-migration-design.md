# Cleanup post-JWT migration + migration Joi → Zod + fail-fast env validation

**Date:** 2026-04-20
**Status:** Proposed
**Context:** Preparing public release of the repository.

## Background

The repository is already public on GitHub and originally used Bearer/JWT authentication. In commit `70c25d3` the authentication was migrated to API key via the `x-api-key` header, but dead JWT/Bearer code and dependencies were left behind. In parallel, several configuration weaknesses were identified (silent fallback to `'password'` for `DB_PASSWORD`, inconsistent validation library choices, hand-written types that can drift from validators). This spec covers a single cleanup pass.

## Goals

1. Remove all dead JWT/Bearer code and dependencies from the runtime, configuration files, deployment manifests, and documentation.
2. Introduce a fail-fast environment variable validator using Zod, exposed as a typed `env` object that the rest of the application imports.
3. Migrate request body/params/query validation from Joi to Zod so the project has a single validation library.
4. Regenerate hand-written DTO types from Zod schemas using `z.infer<>`, establishing the schema as the single source of truth.
5. Preserve the public HTTP API contract (endpoints, status codes, response formats) exactly.

## Non-goals

- Introducing an automated test suite (project currently has none).
- Removing mongoose-related dead branches in `errorHandler.ts` (flagged but out of scope).
- Refactoring the error handler beyond removing JWT branches.
- Adding `validateParams` usage on GET endpoints that are currently unvalidated.
- Any architectural change (DB swap, service decomposition, DI framework).

## Architecture overview

New structure under `src/`:

```
src/
├── config/
│   ├── env.ts          [NEW]        Zod schema + typed `env` export; also owns dotenv.config()
│   └── swagger.ts      [EDITED]     reads env.HOST
├── middleware/
│   ├── validation.ts   [REWRITTEN]  Joi → Zod
│   ├── errorHandler.ts [EDITED]     JWT handlers removed, reads env.NODE_ENV
│   ├── auth.ts         [EDITED]     reads env.API_KEY, Authorization header dropped from CORS
│   └── ...
├── routes/
│   └── health.ts       [EDITED]     reads env.NODE_ENV
├── services/
│   ├── database.ts     [EDITED]     reads env.DB_*, no fallbacks
│   ├── redis.ts        [EDITED]     reads env.REDIS_URL
│   └── chartGenerator.ts [EDITED]   reads env.CHROMIUM_PATH
├── types/
│   └── api.ts          [REWRITTEN]  types inferred from Zod schemas
├── utils/
│   └── logger.ts       [EDITED]     reads env.LOG_LEVEL, env.NODE_ENV
└── index.ts            [EDITED]     imports env.ts first; reads env.PORT, env.ALLOWED_ORIGINS
```

**Data-flow change.** Before: `process.env.DB_PASSWORD || 'password'` (and similar patterns for other variables) scattered across 10 source files, so missing env yields a silently misconfigured runtime. After: a single import of `env.ts` calls `dotenv.config()` and parses `process.env` eagerly at module load; if any required variable is missing or invalid, the process exits with code 1 before Express, DB, or Redis are touched. All consumers import the typed `env` object rather than reading `process.env`.

**Import-order invariant.** `env.ts` is the first import in `src/index.ts`. `env.ts` itself starts with `import 'dotenv/config'` (side-effect import that calls `dotenv.config()` synchronously) so that `.env` values are loaded before the Zod schema parses `process.env`. Other modules must never read `process.env` directly; they import `env` from `src/config/env.ts`.

**Separation of concerns.**
- `config/env.ts` — environment variable validation and typing.
- `middleware/validation.ts` — incoming request payload validation.
- `types/api.ts` — DTO types, now inferred rather than hand-written.

## Component: `src/config/env.ts`

```ts
import 'dotenv/config'; // side-effect import: loads .env before schema parses
import { z } from 'zod';

const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('localhost'), // used by src/config/swagger.ts
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),

  // Database — secrets have no default; presence enforced.
  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_NAME: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  DB_POOL_MAX: z.coerce.number().int().positive().default(20),
  DB_IDLE_TIMEOUT: z.coerce.number().int().nonnegative().default(30000),
  DB_CONNECTION_TIMEOUT: z.coerce.number().int().positive().default(2000),

  // Auth — minimum length 16 chars to reject placeholders like "x", "test".
  API_KEY: z.string().min(16, 'API_KEY must be at least 16 characters'),

  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'verbose', 'debug']).default('info'),

  // Redis — optional. Empty string treated as unset (graceful degradation preserved).
  REDIS_URL: z
    .union([z.string().url(), z.literal('')])
    .optional()
    .transform(v => (v ? v : undefined)),

  // Puppeteer
  CHROMIUM_PATH: z.string().default('/usr/bin/chromium-browser'),

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(100),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
export type Env = z.infer<typeof envSchema>;
```

**Design decisions:**

- `safeParse` + `process.exit(1)` rather than `parse` throwing. Rationale: we want a controlled, human-readable log listing every missing/invalid variable at once, not a Zod stacktrace mid-bootstrap.
- `z.coerce.number()` handles the fact that `process.env` values are always strings.
- No defaults for `DB_PASSWORD` or `API_KEY`; missing them causes exit.
- `API_KEY.min(16)` is a heuristic guard against placeholder values. Chosen as the smallest threshold that blocks obvious placeholders (`"x"`, `"test"`) without forcing long keys in development. **Operational note:** any existing deployment with a shorter `API_KEY` will fail to start after upgrade (see Risks).
- `REDIS_URL` accepts either a valid URL or an empty string (coerced to `undefined`). Missing/empty preserves current graceful-degradation behaviour; a malformed non-empty value fails fast at startup.
- `HOST` is added because `src/config/swagger.ts` reads `process.env.HOST` and `podman-compose.yml` sets it.
- `dotenv/config` is imported inside `env.ts` (not in `index.ts`), so any module that imports `env` gets a loaded `.env` even if `index.ts` has not run (e.g. future tools/scripts).
- Defaults for non-secret variables (ports, timeouts, origins) are retained for ergonomics.
- `BCRYPT_ROUNDS` is removed from `.env.example` as bcrypt is being removed.

## Component: `src/middleware/validation.ts` (Joi → Zod)

Public surface is preserved: `validateBody`, `validateParams`, `validateQuery`, plus the exported schemas. Only imports change in `routes/charts.ts`.

**Schemas — 1:1 behavioural mapping of current Joi definitions:**

```ts
import { z } from 'zod';

export const chartTypeSchema = z.enum([
  'line', 'bar', 'pie', 'doughnut', 'radar', 'polarArea', 'scatter', 'bubble', 'mixed'
]);

export const themeSchema = z.enum(['light', 'dark', 'custom']).default('light');

export const datasetSchema = z.object({
  label: z.string(),
  data: z.array(z.number()),
  backgroundColor: z.union([z.string(), z.array(z.string())]).optional(),
  borderColor: z.union([z.string(), z.array(z.string())]).optional(),
  borderWidth: z.number().int().min(0).max(10).optional(),
  fill: z.boolean().optional(),
  type: z.enum(['line', 'bar']).optional(),
});

export const chartDataSchema = z.object({
  labels: z.array(z.string()),
  datasets: z.array(datasetSchema).min(1),
});

export const chartConfigSchema = z.object({
  type: chartTypeSchema,
  options: z.object({
    responsive: z.boolean().optional(),
    maintainAspectRatio: z.boolean().optional(),
    plugins: z.object({
      legend: z.object({
        display: z.boolean().optional(),
        position: z.enum(['top', 'bottom', 'left', 'right']).optional(),
      }).optional(),
      title: z.object({
        display: z.boolean().optional(),
        text: z.string().optional(),
      }).optional(),
    }).optional(),
    scales: z.record(z.unknown()).optional(),
    elements: z.record(z.unknown()).optional(),
  }).optional(),
});

export const generateChartSchema = z.object({
  title: z.string().max(255).optional(),
  description: z.string().max(1000).optional(),
  chartType: chartTypeSchema,
  data: chartDataSchema,
  width: z.number().int().min(100).max(4000).default(800),
  height: z.number().int().min(100).max(4000).default(600),
  theme: themeSchema,
  isPublic: z.boolean().default(false),
  expiresAt: z.coerce.date().refine(d => d > new Date(), 'expiresAt must be in the future').optional(),
  chartConfig: chartConfigSchema.optional(),
});

export const updateChartSchema = z.object({
  title: z.string().max(255).optional(),
  description: z.string().max(1000).optional(),
  data: chartDataSchema.optional(),
  width: z.number().int().min(100).max(4000).optional(),
  height: z.number().int().min(100).max(4000).optional(),
  theme: themeSchema.optional(),
  isPublic: z.boolean().optional(),
  expiresAt: z.coerce.date().refine(d => d > new Date(), 'expiresAt must be in the future').optional(),
  chartConfig: chartConfigSchema.optional(),
}).refine(o => Object.keys(o).length >= 1, { message: 'At least one field must be provided' });
```

**Middleware factory — preserves the current 400 error format:**

```ts
import { Request, Response, NextFunction } from 'express';
import { ZodType } from 'zod';
import { Logger } from '../utils/logger';

const logger = new Logger();

type Source = 'body' | 'params' | 'query';

function validate(source: Source, schema: ZodType) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const details = result.error.issues.map(issue => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));

      logger.warn(`${source} validation failed`, { errors: details });

      res.status(400).json({
        success: false,
        error: `${source[0].toUpperCase()}${source.slice(1)} validation failed`,
        details,
      });
      return;
    }

    (req as any)[source] = result.data;
    next();
  };
}

export const validateBody   = (schema: ZodType) => validate('body', schema);
export const validateParams = (schema: ZodType) => validate('params', schema);
export const validateQuery  = (schema: ZodType) => validate('query', schema);
```

**Design decisions:**

- Identical response shape `{success, error, details: [{field, message}]}` to avoid any breaking change for API consumers.
- `safeParse` avoids try/catch; consistent with `env.ts`.
- `req[source] = result.data` mirrors current behaviour (assigning the stripped/coerced payload back). Zod's `z.object({...})` strips unknown keys by default, matching Joi's `stripUnknown: true`.
- DRY via a single internal `validate(source, schema)` helper — Joi version currently duplicates the middleware body three times.

## Dead-code removal

### `src/types/api.ts`

Replace hand-written `GenerateChartRequest`, `UpdateChartRequest`, `ChartData` interfaces with:

```ts
import { z } from 'zod';
import { generateChartSchema, updateChartSchema, chartDataSchema } from '../middleware/validation';

export type GenerateChartRequest = z.infer<typeof generateChartSchema>;
export type UpdateChartRequest = z.infer<typeof updateChartSchema>;
export type ChartData = z.infer<typeof chartDataSchema>;
```

`ChartResponse` and `ApiResponse<T>` remain hand-written — they are not derived from validators.

### `src/services/database.ts`

Replace raw `process.env.X || 'fallback'` reads with `env.X` imports. No `parseInt`. No string fallbacks. Pool config is fully typed.

### `src/middleware/auth.ts`

Import `env.API_KEY` directly. Remove the `if (!expectedApiKey) return 500` branch — env is guaranteed present by the time any request arrives.

### `src/middleware/errorHandler.ts`

- Remove the `JsonWebTokenError` and `TokenExpiredError` branches (lines 47–57 in current file).
- Replace `process.env.NODE_ENV === 'development'` at line 61 with `env.NODE_ENV === 'development'`.
- Mongoose branches (`CastError`, `MongoError`, `ValidationError`) are left in place (out of scope — project uses `pg`, these are dead but not part of this cleanup).

### `src/index.ts`

- Add `import './config/env'` as the **first** import, before anything else.
- Remove the existing `dotenv.config()` call from `initializeConfig()` — now owned by `env.ts`.
- Replace `process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000']` (line 56) with `env.ALLOWED_ORIGINS.split(',')`.
- Replace `process.env.PORT || 3000` (line 206) with `env.PORT`.
- Update `allowedHeaders` in CORS config (line 59): drop `'Authorization'`, keep `'Content-Type'`, add `'x-api-key'`. This aligns with the API-key-only authentication model.

### `src/services/redis.ts`

Replace `process.env.REDIS_URL || 'redis://localhost:6379'` (line 11) with `env.REDIS_URL ?? 'redis://localhost:6379'`. The local fallback is acceptable here because Redis is optional and `env.REDIS_URL` is validated (empty/unset → `undefined`, otherwise valid URL).

### `src/services/chartGenerator.ts`

Replace `process.env.CHROMIUM_PATH || '/usr/bin/chromium-browser'` (line 97) with `env.CHROMIUM_PATH` (default in schema already handles the fallback).

### `src/routes/health.ts`

Replace `process.env.NODE_ENV === 'development'` at lines 85 and 174 with `env.NODE_ENV === 'development'`.

### `src/utils/logger.ts`

Replace `process.env.LOG_LEVEL || 'info'` (line 8) with `env.LOG_LEVEL` and `process.env.NODE_ENV !== 'production'` (line 27) with `env.NODE_ENV !== 'production'`.

### `src/config/swagger.ts`

Replace `process.env.HOST || 'localhost'` (line 12) with `env.HOST`.

### `package.json`

Remove: `bcryptjs`, `jsonwebtoken`, `joi`, `@types/bcryptjs`, `@types/jsonwebtoken`.
Add: `zod`.

### `podman-compose.yml`

- Remove `JWT_SECRET` and `JWT_EXPIRES_IN` from the `app` service environment.
- Add `API_KEY: change-me-in-production-min-16-chars` (placeholder passes the `min(16)` check).
- Keep `HOST: localhost` as it is now a valid env var (present in schema).

### `kubernetes/deployment.yml`

- Remove `JWT_SECRET` and `JWT_EXPIRES_IN` env entries in the Deployment.
- Remove the `JWT_SECRET` key from the `chart-service-secrets` Secret.
- Add `API_KEY` to both (env entry referencing `secretKeyRef`, and the key under `data:`).
- Follow the existing placeholder style in the `Secret` (current values like `"your-db-password"` are plaintext placeholders under `data:`, which is technically invalid as `data:` expects base64). **Fixing the base64/`stringData:` issue is out of scope** — this spec only adds/removes keys in the existing broken style. Users deploying to real clusters are expected to either base64-encode their values or switch the Secret to `stringData:` themselves.

### `README.md`

- Replace the example `-H "Authorization: Bearer your-token"` with `-H "x-api-key: your-api-key"`.
- Review the entire "Authentication" section for any remaining Bearer/JWT references and update them to the API-key model. The section should describe only the `x-api-key` header flow.

### `.env.example`

Remove the `# Security` / `BCRYPT_ROUNDS=12` lines.

## Preserved behaviour

- All HTTP endpoints, paths, status codes, and response shapes are unchanged.
- The 400 validation error payload keeps the exact shape `{success: false, error: string, details: [{field, message}]}`.
- The `expiresAt` rule (must be in the future) is preserved; only the error string may differ slightly.
- `REDIS_URL` remains optional; graceful degradation when Redis is unavailable is preserved (empty string or unset → `undefined` → local fallback in `redis.ts`).
- Swagger `ApiKeyAuth` scheme (header `x-api-key`) remains the documented authentication method; no changes to OpenAPI security definitions.
- The manual `chart_type`/`chart_data` presence check in `src/routes/charts.ts:97-103` is **left in place** (redundant after validation, but out of scope — harmless).

## Verification (manual)

The project has no automated tests and this spec does not add any. Verification is a manual checklist performed after each implementation step.

| Step | Verification |
|---|---|
| 1. Zod added, Joi removed | `npm install` clean, `npm ls joi` empty, `npm ls zod` reports v3+ |
| 2. `config/env.ts` present | `tsc --noEmit` green; negative: `API_KEY="" npm run dev` → exits 1 with readable error; positive: valid `.env` → app starts |
| 3. `validation.ts` rewritten | `tsc --noEmit` green; negative curl: `POST /api/charts/generate` with missing `chartType` → 400 with `details[].field = "chartType"`; positive curl → 201 |
| 4. `types/api.ts` inferred | `tsc --noEmit` green (main test — TS catches any drift) |
| 5. `database.ts` without fallbacks | App starts with valid env; without `DB_PASSWORD` exits 1 with env error |
| 6. JWT cleanup | (bash) `grep -rE -i "(jwt\|jsonwebtoken\|bcrypt\|bearer)" src/ .env.example podman-compose.yml kubernetes/ README.md` → no matches |
| 6b. `process.env` centralised | `grep -r "process\.env\." src/` → only matches in `src/config/env.ts` |
| 7. README fixed | Sections *Authentication* and *Chart Usage Examples* reviewed |
| 8. Final smoke test | `podman-compose down && podman-compose up -d --build` — all 3 services healthy; `/api/health/detailed` → 200; `POST /api/charts/generate` with valid `API_KEY` → 201; returned URLs (`/png`, `/embed`, `/json`) resolve |

## Definition of Done

- `tsc --noEmit` passes.
- `npm ls` shows no `joi`, `jsonwebtoken`, `bcryptjs`, or their `@types/*`; shows `zod` in dependencies.
- `grep -r "process\.env\." src/` returns results only in `src/config/env.ts`.
- `grep -rEi "(jwt|jsonwebtoken|bcrypt|bearer)" src/ .env.example podman-compose.yml kubernetes/ README.md` returns no matches.
- App refuses to start without `DB_PASSWORD`, `DB_HOST`, `DB_NAME`, `DB_USER`, or `API_KEY`.
- App refuses to start with `API_KEY` shorter than 16 characters.
- `POST /api/charts/generate` still works against the documented contract (verified via curl).
- 400 validation responses keep the current shape: `{success: false, error: string, details: [{field: string, message: string}]}`.
- `src/index.ts` imports `./config/env` as its first statement; `dotenv.config()` is no longer called from `index.ts`.
- CORS `allowedHeaders` in `index.ts` includes `'x-api-key'` and does not include `'Authorization'`.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| `env.ts` parses `process.env` at import time — surprises if tests import modules without env | Not applicable (no tests). If added later, use a test `.env` loaded before other imports. |
| `expiresAt` error message differs from the Joi version | Acceptable; message is explicitly customised via `refine(..., 'expiresAt must be in the future')`. |
| Someone clones repo without `.env` | `env.ts` exits 1 with a clear error listing missing vars; `README.md` already instructs `cp .env.example .env`. |
| k8s `Secret` definition change requires re-apply in clusters | Documented in the Implementation Plan; consumers must update their cluster Secret. |
| **Breaking change — short `API_KEY` values** | The new `min(16)` rule means any existing deployment with an `API_KEY` shorter than 16 chars will fail to start after upgrade. Mitigation: call this out in the release notes / README. The shipped `.env.example` placeholder (`your-super-secret-api-key-here`, 29 chars) already complies. |
| **Breaking change — malformed `REDIS_URL`** | Previously tolerated at runtime (Redis connect fails silently). Now fails fast at startup. Empty/unset still works. Mitigation: release notes; operators should verify `REDIS_URL` format or leave it empty. |
| Import order mistake (`env.ts` not first) | Documented explicitly as an invariant in the Architecture section; verified by step 2 of the manual checklist (`API_KEY="" npm run dev` must exit 1). |

## Open questions

None at spec time. All scope decisions confirmed during brainstorming:
- Approach A (all changes in one sequenced pass).
- Fail-fast env validation with Zod schema.
- Replace Joi with Zod (do not keep both).
- Full JWT/bcrypt dead-code removal (not keep-for-future).
