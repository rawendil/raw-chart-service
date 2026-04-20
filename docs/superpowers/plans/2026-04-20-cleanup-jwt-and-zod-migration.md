# Cleanup post-JWT + Joi→Zod + fail-fast env — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove dead JWT/Bearer code and dependencies, introduce Zod-based fail-fast environment variable validation, migrate request validation from Joi to Zod, and infer DTO types from Zod schemas.

**Architecture:** Single-pass sequenced cleanup. Create `src/config/env.ts` as the sole consumer of `process.env`; all other modules import the typed `env` object. Replace Joi with Zod in `src/middleware/validation.ts`, preserving the public HTTP API contract and the 400 error shape. Remove `bcryptjs`/`jsonwebtoken`/`joi` dependencies and all references across source, manifests, and docs.

**Tech Stack:** Node.js 18+, TypeScript 5.3, Express 4, Zod 3, Postgres (`pg`), Redis (optional), Puppeteer, Podman/Docker.

**Spec reference:** [docs/superpowers/specs/2026-04-20-cleanup-jwt-and-zod-migration-design.md](../specs/2026-04-20-cleanup-jwt-and-zod-migration-design.md)

**Testing strategy:** Project has no automated test suite. Each task is verified manually via `tsc --noEmit`, targeted `grep`, and when appropriate a curl smoke test. This is explicitly endorsed by the spec (no tests are added in this cleanup).

**Commit strategy:** One commit per task. Commits should compile cleanly (`tsc --noEmit` passes at every commit) — the migration order below is constructed to maintain this invariant.

**File structure after the work:**

```
src/
├── config/
│   ├── env.ts          [NEW]
│   └── swagger.ts      [EDITED: env.HOST]
├── middleware/
│   ├── validation.ts   [REWRITTEN: Joi → Zod]
│   ├── errorHandler.ts [EDITED: JWT branches removed, env.NODE_ENV]
│   ├── auth.ts         [EDITED: env.API_KEY]
│   ├── notFoundHandler.ts   unchanged
│   └── rateLimit.ts    unchanged
├── routes/
│   ├── charts.ts       unchanged (imports from validation.ts transparently)
│   └── health.ts       [EDITED: env.NODE_ENV]
├── services/
│   ├── database.ts     [EDITED: env.DB_*]
│   ├── redis.ts        [EDITED: env.REDIS_URL]
│   └── chartGenerator.ts [EDITED: env.CHROMIUM_PATH]
├── types/
│   └── api.ts          [REWRITTEN: z.infer<>]
├── utils/
│   └── logger.ts       [EDITED: env.LOG_LEVEL, env.NODE_ENV]
└── index.ts            [EDITED: env.ts first import, env.PORT, env.ALLOWED_ORIGINS, allowedHeaders]

[ROOT]
├── package.json          [EDITED: +zod, -joi, -jsonwebtoken, -bcryptjs, -@types/jsonwebtoken, -@types/bcryptjs]
├── podman-compose.yml    [EDITED: -JWT_*, +API_KEY]
├── kubernetes/deployment.yml  [EDITED: -JWT_*, +API_KEY]
├── README.md             [EDITED: Bearer → x-api-key]
└── .env.example          [EDITED: -BCRYPT_ROUNDS]
```

---

## Chunk 1: Dependencies and env.ts foundation

**Goal of this chunk:** Add Zod, create `src/config/env.ts`, verify the fail-fast mechanism works standalone before any module depends on it.

### Task 1: Add `zod` dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1.1: Install Zod**

Run:
```bash
npm install zod@^3.23.8
```

Expected: `package.json` gains `"zod": "^3.23.8"` in `dependencies`; `package-lock.json` updated.

- [ ] **Step 1.2: Verify install**

Run:
```bash
npm ls zod
```

Expected output contains `zod@3.x.x` (no `missing` / `invalid`).

- [ ] **Step 1.3: Commit**

```bash
git add package.json package-lock.json
git commit -m "Add zod dependency for env and request validation"
```

---

### Task 2: Create `src/config/env.ts`

**Files:**
- Create: `src/config/env.ts`

- [ ] **Step 2.1: Write the module**

Create `src/config/env.ts` with exactly this content:

```ts
import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('localhost'),
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),

  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_NAME: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  DB_POOL_MAX: z.coerce.number().int().positive().default(20),
  DB_IDLE_TIMEOUT: z.coerce.number().int().nonnegative().default(30000),
  DB_CONNECTION_TIMEOUT: z.coerce.number().int().positive().default(2000),

  API_KEY: z.string().min(16, 'API_KEY must be at least 16 characters'),

  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'verbose', 'debug']).default('info'),

  REDIS_URL: z
    .union([z.string().url(), z.literal('')])
    .optional()
    .transform((v) => (v ? v : undefined)),

  CHROMIUM_PATH: z.string().default('/usr/bin/chromium-browser'),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(100),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:');
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
export type Env = z.infer<typeof envSchema>;
```

- [ ] **Step 2.2: Type-check**

Run:
```bash
npx tsc --noEmit
```

Expected: no new errors related to `env.ts`. Pre-existing project errors (if any) unchanged.

- [ ] **Step 2.3: Manual verification — fail-fast on missing vars**

Run (in a scratch shell, do NOT modify `.env`):
```bash
env -i PATH="$PATH" npx ts-node -e "require('./src/config/env')"
```

Expected output (order may vary, must include these fields):
```
Invalid environment variables:
  DB_HOST: <some message>
  DB_NAME: <some message>
  DB_USER: <some message>
  DB_PASSWORD: <some message>
  API_KEY: <some message>
```

Process exits with code 1 (`echo $?` after the command prints `1`).

- [ ] **Step 2.4: Manual verification — success path**

Ensure `.env` exists (copy from `.env.example` if not) and contains all required vars with `API_KEY` ≥ 16 chars.

Run:
```bash
npx ts-node -e "const { env } = require('./src/config/env'); console.log('OK', env.NODE_ENV, env.DB_HOST, 'API_KEY len:', env.API_KEY.length);"
```

Expected: `OK development <host> API_KEY len: <N>` where N ≥ 16. Exit code 0.

- [ ] **Step 2.5: Commit**

```bash
git add src/config/env.ts
git commit -m "Add src/config/env.ts with Zod-based fail-fast env validation"
```

---

### Task 3: Update `.env.example` — remove `BCRYPT_ROUNDS`

**Files:**
- Modify: `.env.example`

- [ ] **Step 3.1: Remove the `# Security` / `BCRYPT_ROUNDS` block**

Edit `.env.example` to remove lines 20-22 (the `# Security` comment and `BCRYPT_ROUNDS=12` entry) and the blank line that follows.

Resulting file must not contain the string `BCRYPT`.

- [ ] **Step 3.2: Verify**

Run:
```bash
grep -i bcrypt .env.example
```

Expected: no output.

- [ ] **Step 3.3: Commit**

```bash
git add .env.example
git commit -m "Remove BCRYPT_ROUNDS from .env.example (unused after JWT removal)"
```

---

## Chunk 2: Request validation (Joi → Zod) and type regeneration

**Goal of this chunk:** Replace `src/middleware/validation.ts` with a Zod implementation that preserves the public behaviour. Regenerate `src/types/api.ts` from Zod schemas. Remove `joi` from `package.json`.

### Task 4: Rewrite `src/middleware/validation.ts`

**Files:**
- Modify: `src/middleware/validation.ts` (full rewrite)

- [ ] **Step 4.1: Replace file contents**

Overwrite `src/middleware/validation.ts` with:

```ts
import { Request, Response, NextFunction } from 'express';
import { z, ZodType } from 'zod';
import { Logger } from '../utils/logger';

const logger = new Logger();

export const chartTypeSchema = z.enum([
  'line', 'bar', 'pie', 'doughnut', 'radar', 'polarArea', 'scatter', 'bubble', 'mixed',
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
  options: z
    .object({
      responsive: z.boolean().optional(),
      maintainAspectRatio: z.boolean().optional(),
      plugins: z
        .object({
          legend: z
            .object({
              display: z.boolean().optional(),
              position: z.enum(['top', 'bottom', 'left', 'right']).optional(),
            })
            .optional(),
          title: z
            .object({
              display: z.boolean().optional(),
              text: z.string().optional(),
            })
            .optional(),
        })
        .optional(),
      scales: z.record(z.unknown()).optional(),
      elements: z.record(z.unknown()).optional(),
    })
    .optional(),
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
  expiresAt: z
    .coerce.date()
    .refine((d) => d > new Date(), 'expiresAt must be in the future')
    .optional(),
  chartConfig: chartConfigSchema.optional(),
});

export const updateChartSchema = z
  .object({
    title: z.string().max(255).optional(),
    description: z.string().max(1000).optional(),
    data: chartDataSchema.optional(),
    width: z.number().int().min(100).max(4000).optional(),
    height: z.number().int().min(100).max(4000).optional(),
    theme: themeSchema.optional(),
    isPublic: z.boolean().optional(),
    expiresAt: z
      .coerce.date()
      .refine((d) => d > new Date(), 'expiresAt must be in the future')
      .optional(),
    chartConfig: chartConfigSchema.optional(),
  })
  .refine((o) => Object.keys(o).length >= 1, {
    message: 'At least one field must be provided',
  });

type Source = 'body' | 'params' | 'query';

function validate(source: Source, schema: ZodType) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));

      logger.warn(`${source} validation failed`, { errors: details });

      const label = source[0].toUpperCase() + source.slice(1);
      res.status(400).json({
        success: false,
        error: `${label} validation failed`,
        details,
      });
      return;
    }

    (req as Record<string, unknown>)[source] = result.data;
    next();
  };
}

export const validateBody = (schema: ZodType) => validate('body', schema);
export const validateParams = (schema: ZodType) => validate('params', schema);
export const validateQuery = (schema: ZodType) => validate('query', schema);
```

- [ ] **Step 4.2: Type-check**

Run:
```bash
npx tsc --noEmit
```

Expected: **zero errors**. The rewritten `validation.ts` compiles cleanly, and neither `types/api.ts` nor `routes/charts.ts` import from validation.ts in a way that exposes Joi-specific types — the hand-written interfaces in `types/api.ts` still satisfy `routes/charts.ts`. The Joi-derived type drift will only surface in Task 5 when we replace those interfaces with Zod inferences.

If any errors appear in `validation.ts` itself, stop and diagnose before proceeding.

- [ ] **Step 4.3: Commit**

```bash
git add src/middleware/validation.ts
git commit -m "Rewrite validation.ts using Zod (public API preserved)"
```

---

### Task 5: Regenerate `src/types/api.ts` from Zod schemas

**Files:**
- Modify: `src/types/api.ts`

- [ ] **Step 5.1: Read current file**

Read `src/types/api.ts` to identify:
- Which types are derived from validator shapes (`GenerateChartRequest`, `UpdateChartRequest`, `ChartData`) — these become `z.infer<...>`.
- Which are hand-written response/envelope types (`ChartResponse`, `ApiResponse<T>`) — these stay hand-written.

- [ ] **Step 5.2: Rewrite the file**

Replace the request-side interfaces with Zod inferences. Keep `ChartResponse`, `ApiResponse<T>`, and all other response/envelope types (`PaginatedResponse`, `ValidationError`, `ErrorResponse`) unchanged.

**Delete** the now-unused internal helper interfaces `Dataset` and `ChartConfig` — they are superseded by inference from `datasetSchema` and `chartConfigSchema`. Verified by grep: no other module imports them from `types/api.ts` (`types/database.ts` has its own copies; `chartGenerator.ts` imports from `chart.js`).

The new top of the file should read:

```ts
import { z } from 'zod';
import {
  generateChartSchema,
  updateChartSchema,
  chartDataSchema,
} from '../middleware/validation';

export type GenerateChartRequest = z.infer<typeof generateChartSchema>;
export type UpdateChartRequest = z.infer<typeof updateChartSchema>;
export type ChartData = z.infer<typeof chartDataSchema>;

// Response and envelope types remain hand-written below.
```

Then keep the existing definitions of: `ChartResponse`, `ApiResponse<T>`, `PaginatedResponse`, `ValidationError`, `ErrorResponse`. Any other response/envelope types in the file are preserved verbatim.

- [ ] **Step 5.3: Type-check**

Run:
```bash
npx tsc --noEmit
```

Expected: zero errors. If TypeScript complains about structural mismatches in `src/routes/charts.ts`, that means the Joi→Zod mapping diverged from the hand-written types — investigate (usually an `optional()` vs required mismatch).

- [ ] **Step 5.4: Commit**

```bash
git add src/types/api.ts
git commit -m "Infer request DTOs from Zod schemas in types/api.ts"
```

---

### Task 6: Remove Joi from dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 6.1: Verify no remaining Joi imports**

Run:
```bash
grep -rn "from 'joi'\|require('joi')\|import Joi" src/
```

Expected: no output. If any, fix them before continuing.

- [ ] **Step 6.2: Uninstall**

Run:
```bash
npm uninstall joi
```

- [ ] **Step 6.3: Verify**

Run:
```bash
npm ls joi
```

Expected: output indicates `(empty)` or no `joi` package. Also:

```bash
grep -c '"joi"' package.json
```

Expected: `0`.

- [ ] **Step 6.4: Type-check**

Run:
```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 6.5: Commit**

```bash
git add package.json package-lock.json
git commit -m "Remove joi dependency (migrated to zod)"
```

---

## Chunk 3: Migrate all `process.env` consumers to `env`

**Goal of this chunk:** Every file that reads `process.env` now imports `env` from `src/config/env.ts`. Remove silent fallbacks (`|| 'password'`, `|| 'localhost'`, etc.). After this chunk, `grep -r "process\.env\." src/` returns only matches in `src/config/env.ts`.

**Order rationale:** start with leaf services (no downstream dependencies on each other), finish with `index.ts` which establishes the import-order invariant for the whole app.

### Task 7: Migrate `src/services/database.ts`

**Files:**
- Modify: `src/services/database.ts`

- [ ] **Step 7.1: Edit imports and pool config**

Add at the top (after existing imports):
```ts
import { env } from '../config/env';
```

Replace the `new Pool({ ... })` block (currently lines 10-19) with:
```ts
this.pool = new Pool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  database: env.DB_NAME,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  max: env.DB_POOL_MAX,
  idleTimeoutMillis: env.DB_IDLE_TIMEOUT,
  connectionTimeoutMillis: env.DB_CONNECTION_TIMEOUT,
});
```

No more `process.env`, no more `parseInt`, no more `|| 'fallback'`.

- [ ] **Step 7.2: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 7.3: Verify no `process.env` left in file**

Run: `grep -n "process\.env" src/services/database.ts`
Expected: no output.

- [ ] **Step 7.4: Commit**

```bash
git add src/services/database.ts
git commit -m "Migrate database.ts to typed env; remove silent fallbacks"
```

---

### Task 8: Migrate `src/middleware/auth.ts`

**Files:**
- Modify: `src/middleware/auth.ts`

- [ ] **Step 8.1: Edit**

Add import:
```ts
import { env } from '../config/env';
```

In the middleware body:
- Remove the line `const expectedApiKey = process.env.API_KEY;`.
- Remove the `if (!expectedApiKey) { ... return; }` block (no longer needed — env guarantees presence).
- Replace the comparison `apiKey !== expectedApiKey` with `apiKey !== env.API_KEY`.

- [ ] **Step 8.2: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 8.3: Verify**

Run: `grep -n "process\.env" src/middleware/auth.ts`
Expected: no output.

- [ ] **Step 8.4: Commit**

```bash
git add src/middleware/auth.ts
git commit -m "Migrate auth.ts to typed env"
```

---

### Task 9: Migrate `src/middleware/errorHandler.ts` (also drop JWT branches)

**Files:**
- Modify: `src/middleware/errorHandler.ts`

- [ ] **Step 9.1: Edit imports**

Add at the top:
```ts
import { env } from '../config/env';
```

- [ ] **Step 9.2: Remove JWT branches**

Delete both `if` blocks in `src/middleware/errorHandler.ts` (around lines 48-56):
```ts
if (err.name === 'JsonWebTokenError') { ... }
if (err.name === 'TokenExpiredError') { ... }
```

Both are string comparisons on `err.name` — neither imports from `jsonwebtoken`, so removing them does not create a compile dependency.

- [ ] **Step 9.3: Replace `process.env.NODE_ENV` usage**

On the line that currently reads:
```ts
...(process.env.NODE_ENV === 'development' && { stack: err.stack })
```

Replace with:
```ts
...(env.NODE_ENV === 'development' && { stack: err.stack })
```

- [ ] **Step 9.4: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 9.5: Verify**

Run:
```bash
grep -niE "process\.env|jsonwebtoken|tokenexpired" src/middleware/errorHandler.ts
```
Expected: no output.

- [ ] **Step 9.6: Commit**

```bash
git add src/middleware/errorHandler.ts
git commit -m "Drop JWT branches from errorHandler; use typed env"
```

---

### Task 10: Migrate `src/services/redis.ts`

**Files:**
- Modify: `src/services/redis.ts`

- [ ] **Step 10.1: Edit**

Add import:
```ts
import { env } from '../config/env';
```

Replace:
```ts
url: process.env.REDIS_URL || 'redis://localhost:6379'
```

with:
```ts
url: env.REDIS_URL ?? 'redis://localhost:6379'
```

(`??` not `||` — matches the fact that `env.REDIS_URL` is `string | undefined`, never empty string.)

- [ ] **Step 10.2: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 10.3: Verify**

Run: `grep -n "process\.env" src/services/redis.ts`
Expected: no output.

- [ ] **Step 10.4: Commit**

```bash
git add src/services/redis.ts
git commit -m "Migrate redis.ts to typed env"
```

---

### Task 11: Migrate `src/services/chartGenerator.ts`

**Files:**
- Modify: `src/services/chartGenerator.ts`

- [ ] **Step 11.1: Edit**

Add import:
```ts
import { env } from '../config/env';
```

Replace:
```ts
executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium-browser',
```

with:
```ts
executablePath: env.CHROMIUM_PATH,
```

(The default lives in the env schema.)

- [ ] **Step 11.2: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 11.3: Verify**

Run: `grep -n "process\.env" src/services/chartGenerator.ts`
Expected: no output.

- [ ] **Step 11.4: Commit**

```bash
git add src/services/chartGenerator.ts
git commit -m "Migrate chartGenerator.ts to typed env"
```

---

### Task 12: Migrate `src/routes/health.ts`

**Files:**
- Modify: `src/routes/health.ts`

- [ ] **Step 12.1: Edit**

Add import:
```ts
import { env } from '../config/env';
```

Replace both occurrences of:
```ts
process.env.NODE_ENV === 'development'
```
with:
```ts
env.NODE_ENV === 'development'
```

- [ ] **Step 12.2: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 12.3: Verify**

Run: `grep -n "process\.env" src/routes/health.ts`
Expected: no output.

- [ ] **Step 12.4: Commit**

```bash
git add src/routes/health.ts
git commit -m "Migrate health.ts to typed env"
```

---

### Task 13: Migrate `src/utils/logger.ts`

**Files:**
- Modify: `src/utils/logger.ts`

- [ ] **Step 13.1: Edit**

Add import:
```ts
import { env } from '../config/env';
```

Replace:
- `process.env.LOG_LEVEL || 'info'` with `env.LOG_LEVEL`.
- `process.env.NODE_ENV !== 'production'` with `env.NODE_ENV !== 'production'`.

- [ ] **Step 13.2: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 13.3: Verify**

Run: `grep -n "process\.env" src/utils/logger.ts`
Expected: no output.

- [ ] **Step 13.4: Commit**

```bash
git add src/utils/logger.ts
git commit -m "Migrate logger.ts to typed env"
```

---

### Task 14: Migrate `src/config/swagger.ts`

**Files:**
- Modify: `src/config/swagger.ts`

- [ ] **Step 14.1: Edit**

Add import:
```ts
import { env } from './env';
```

Replace:
```ts
url: `http://${process.env.HOST || 'localhost'}:3000`,
```

with:
```ts
url: `http://${env.HOST}:${env.PORT}`,
```

(Using `env.PORT` also — the hardcoded `3000` was incorrect if `PORT` is set to something else.)

- [ ] **Step 14.2: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 14.3: Verify**

Run: `grep -n "process\.env" src/config/swagger.ts`
Expected: no output.

- [ ] **Step 14.4: Commit**

```bash
git add src/config/swagger.ts
git commit -m "Migrate swagger.ts to typed env"
```

---

### Task 15: Migrate `src/index.ts` (final source file)

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 15.1: Add env import as the FIRST import**

At the very top of the file (line 1), before `import 'reflect-metadata';`, add:
```ts
import { env } from './config/env';
```

This must be the first non-comment line. It ensures env validation runs before any other module is loaded.

- [ ] **Step 15.2: Remove `dotenv.config()`**

In the `initializeConfig()` method, remove the line:
```ts
dotenv.config();
```

Then remove the import at the top:
```ts
import dotenv from 'dotenv';
```

(`dotenv/config` is now loaded as a side effect inside `env.ts`.)

- [ ] **Step 15.3: Replace `process.env` reads**

Replace:
```ts
origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
```
with:
```ts
origin: env.ALLOWED_ORIGINS.split(','),
```

Replace:
```ts
const port = process.env.PORT || 3000;
```
with:
```ts
const port = env.PORT;
```

- [ ] **Step 15.4: Update CORS `allowedHeaders`**

In the CORS config, change:
```ts
allowedHeaders: ['Content-Type', 'Authorization']
```
to:
```ts
allowedHeaders: ['Content-Type', 'x-api-key']
```

- [ ] **Step 15.5: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors. If `dotenv` import is flagged as unused somewhere else, clean it up.

- [ ] **Step 15.6: Verify `process.env` is fully centralised**

Run:
```bash
grep -rn "process\.env\." src/
```
Expected: output contains ONLY matches inside `src/config/env.ts`.

- [ ] **Step 15.7: Smoke test — app starts**

**Prerequisites:**
1. Postgres and Redis must be running locally. If not: `podman-compose up -d postgres redis`.
2. `.env` must be populated with all required vars (see `.env.example`). `API_KEY` must be ≥ 16 characters.

Run:
```bash
npx ts-node src/index.ts &
SERVER_PID=$!
sleep 3
curl -sf http://localhost:3000/api/health && echo "OK" || echo "FAIL"
kill $SERVER_PID 2>/dev/null || true
```

Expected: `OK` printed. If `FAIL`: check that the prerequisites above are met, then inspect the server stderr.

- [ ] **Step 15.8: Commit**

```bash
git add src/index.ts
git commit -m "Migrate index.ts to typed env; drop dotenv.config(); fix CORS allowedHeaders"
```

---

## Chunk 4: Dead-code/config cleanup and final verification

**Goal of this chunk:** Remove `bcryptjs`, `jsonwebtoken`, and their `@types/*` from deps. Clean up manifest files (`podman-compose.yml`, `kubernetes/deployment.yml`), documentation (`README.md`). Run the full Definition-of-Done checklist.

### Task 16: Remove `bcryptjs`, `jsonwebtoken`, and `@types/*`

**Files:**
- Modify: `package.json`

- [ ] **Step 16.1: Verify no remaining imports**

Run:
```bash
grep -rEn "bcrypt|jsonwebtoken|jwt\\.sign|jwt\\.verify|JsonWebTokenError|TokenExpiredError" src/
```
Expected: no output. If any, fix or flag them before uninstalling.

- [ ] **Step 16.2: Uninstall**

Run:
```bash
npm uninstall bcryptjs jsonwebtoken @types/bcryptjs @types/jsonwebtoken
```

- [ ] **Step 16.3: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 16.4: Verify**

Run:
```bash
for pkg in bcryptjs jsonwebtoken @types/bcryptjs @types/jsonwebtoken; do
  echo -n "$pkg: "
  grep -c "\"$pkg\"" package.json
done
```
Expected: every line ends in `0`.

- [ ] **Step 16.5: Commit**

```bash
git add package.json package-lock.json
git commit -m "Remove bcryptjs and jsonwebtoken (dead deps after JWT→API-key migration)"
```

---

### Task 17: Clean up `podman-compose.yml`

**Files:**
- Modify: `podman-compose.yml`

- [ ] **Step 17.1: Edit the `app` service `environment:` block**

Locate the `app:` service's `environment:` map. Make these changes:

- Remove:
  ```yaml
  JWT_SECRET: your-super-secret-jwt-key-change-in-production
  JWT_EXPIRES_IN: 24h
  ```
- Add (anywhere in the same `environment:` block, suggested after `DB_PASSWORD`):
  ```yaml
  API_KEY: change-me-in-production-min-16-chars
  ```

`HOST: localhost` stays as-is (it is a valid env variable in the schema).

- [ ] **Step 17.2: Verify**

Run:
```bash
grep -iE "jwt|bearer|bcrypt" podman-compose.yml
```
Expected: no output.

```bash
grep "API_KEY" podman-compose.yml
```
Expected: one line, value length ≥ 16 chars (after the colon/space).

- [ ] **Step 17.3: Commit**

```bash
git add podman-compose.yml
git commit -m "Replace JWT_SECRET/JWT_EXPIRES_IN with API_KEY in podman-compose"
```

---

### Task 18: Clean up `kubernetes/deployment.yml`

**Files:**
- Modify: `kubernetes/deployment.yml`

- [ ] **Step 18.1: Remove JWT env entries in the Deployment**

In `spec.template.spec.containers[0].env:`, delete these two entries:
```yaml
- name: JWT_SECRET
  valueFrom:
    secretKeyRef:
      name: chart-service-secrets
      key: JWT_SECRET
- name: JWT_EXPIRES_IN
  value: "24h"
```

- [ ] **Step 18.2: Add `API_KEY` env entry in the Deployment**

Insert in the same `env:` list (e.g. after `DB_PASSWORD`):
```yaml
- name: API_KEY
  valueFrom:
    secretKeyRef:
      name: chart-service-secrets
      key: API_KEY
```

- [ ] **Step 18.3: Update the Secret**

In the `Secret` manifest at the bottom of the file, in `data:`:
- Remove the line `JWT_SECRET: "your-jwt-secret-key"`.
- Add `API_KEY: "change-me-in-production-min-16-chars"` in the same style as the other placeholders.

(Note: the existing placeholders are plain strings under `data:`, which is technically invalid — `data:` expects base64. Fixing that convention is out of scope; we follow the existing pattern.)

- [ ] **Step 18.4: Verify**

Run:
```bash
grep -iE "jwt|bearer|bcrypt" kubernetes/deployment.yml
```
Expected: no output.

```bash
grep -c "API_KEY" kubernetes/deployment.yml
```
Expected: `2` (env entry + Secret data key).

- [ ] **Step 18.5: Commit**

```bash
git add kubernetes/deployment.yml
git commit -m "Replace JWT_SECRET with API_KEY in k8s deployment and Secret"
```

---

### Task 19: Update `README.md`

**Files:**
- Modify: `README.md`

- [ ] **Step 19.1: Fix the curl example**

Locate the `curl` example (currently around line 203) and change:
```bash
-H "Authorization: Bearer your-token" \
```
to:
```bash
-H "x-api-key: your-api-key" \
```

- [ ] **Step 19.2: Review the Authentication section for Bearer/JWT wording**

Read the `## Authentication` section (around line 115). Ensure it describes only the API-key flow. If any text mentions Bearer tokens, JWT, or `Authorization` header, remove/replace it.

- [ ] **Step 19.3: Verify**

Run:
```bash
grep -iE "jwt|bearer|bcrypt" README.md
```
Expected: no output.

- [ ] **Step 19.4: Commit**

```bash
git add README.md
git commit -m "Update README: replace Bearer example with x-api-key"
```

---

### Task 20: Full Definition-of-Done verification

**Files:** none (verification-only).

- [ ] **Step 20.1: tsc clean**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 20.2: No Joi / JWT / bcrypt in deps**

Run:
```bash
for pkg in joi jsonwebtoken bcryptjs @types/jsonwebtoken @types/bcryptjs; do
  echo -n "$pkg: "
  npm ls "$pkg" 2>&1 | grep -E "$pkg@" || echo "not present"
done
```
Expected: every line prints `not present`.

- [ ] **Step 20.3: Zod present**

Run: `npm ls zod`
Expected: `zod@3.x.x` present.

- [ ] **Step 20.4: `process.env` centralised**

Run:
```bash
grep -rn "process\.env\." src/
```
Expected: only matches inside `src/config/env.ts`.

- [ ] **Step 20.5: JWT/Bearer/bcrypt purged**

Run:
```bash
grep -rEin "(jwt|jsonwebtoken|bcrypt|bearer)" \
  src/ .env.example podman-compose.yml kubernetes/ README.md
```
Expected: no output. (The `docs/superpowers/` tree is NOT scanned — those docs are allowed to reference JWT historically.)

- [ ] **Step 20.6: Fail-fast on missing env (negative smoke test)**

Run:
```bash
API_KEY="" npx ts-node src/index.ts
echo "Exit code: $?"
```
Expected: process exits with code 1, prints a line like `API_KEY: API_KEY must be at least 16 characters`. Exit code `1`.

- [ ] **Step 20.7: Short API_KEY rejected**

Run:
```bash
API_KEY="short" npx ts-node src/index.ts
echo "Exit code: $?"
```
Expected: exit code 1 with the same `API_KEY` error.

- [ ] **Step 20.7a: Missing DB vars rejected**

For each of `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, run with that variable unset (others valid) and verify exit 1 + error listing the missing var. Example for `DB_PASSWORD`:
```bash
env -u DB_PASSWORD npx ts-node -e "require('./src/config/env')"
echo "Exit: $?"
```
Expected: `Invalid environment variables:` followed by `DB_PASSWORD: <message>`, exit code `1`. Repeat for the other three.

- [ ] **Step 20.7b: index.ts invariants**

Verify `src/index.ts` satisfies the structural DoD requirements:

```bash
head -1 src/index.ts
```
Expected first line: `import { env } from './config/env';`

```bash
grep -n "dotenv\.config\|import dotenv" src/index.ts
```
Expected: no output (dotenv is not referenced in index.ts any more).

```bash
grep -nE "allowedHeaders" src/index.ts
```
Expected output shows `'x-api-key'` and does NOT contain `'Authorization'`.

- [ ] **Step 20.8: Containerised smoke test**

Run:
```bash
podman-compose down
podman-compose up -d --build
sleep 15
podman ps --format "table {{.Names}} {{.Status}}"
```
Expected: all three services show `Up` (and `healthy` if the image reports health).

- [ ] **Step 20.9: API smoke test — generate chart**

Read the `API_KEY` value from the running compose config. With that key:

```bash
API_KEY=$(grep "API_KEY:" podman-compose.yml | head -1 | awk -F': ' '{print $2}')

curl -si -X POST http://localhost:3000/api/charts/generate \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{
    "title": "Smoke test",
    "chartType": "bar",
    "data": {"labels": ["A","B"], "datasets": [{"label": "L", "data": [1, 2]}]},
    "isPublic": true
  }' | head -20
```

Expected: HTTP 201 + JSON body with `success: true`, `data.chart_hash`, `data.access_url`, `data.png_url`, etc.

- [ ] **Step 20.10: Validation error shape preserved**

```bash
curl -si -X POST http://localhost:3000/api/charts/generate \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{}'
```
Expected: HTTP 400 + JSON body matching `{success: false, error: "Body validation failed", details: [...]}` where each `details[]` entry has `field` and `message`.

- [ ] **Step 20.11: Teardown**

```bash
podman-compose down
```

- [ ] **Step 20.12: Final commit (if anything was touched during verification)**

If no files changed during verification, skip. Otherwise:
```bash
git status
# review, then:
git add -A
git commit -m "Verification pass"
```

---

## Done

When every checkbox above is ticked and the Task 20 verification passes end-to-end, the cleanup is complete and the branch is ready for whatever the next step is (PR, direct push, etc.).

**Sanity sweep — common pitfalls:**

- If `npx tsc --noEmit` starts failing mid-chunk, do NOT keep committing. Stop, diagnose. The plan's order is designed to keep compilation green at every commit.
- If any migration step's `grep` check for `process.env` returns a match, it means you missed an occurrence — search more broadly before committing.
- `express-async-errors` side effect import (if present in `src/index.ts`) must remain; don't confuse it with removable imports.
- `dotenv.config()` removal from `index.ts` is load-bearing: if any module still relies on `index.ts` loading env, it will break. All such modules are migrated to import `env` directly.
