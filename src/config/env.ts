import 'dotenv/config';
import { z } from 'zod';
import { parseCustomThemes } from './themeColors';

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

  // Periodic deletion of charts past their expires_at.
  EXPIRED_CHART_CLEANUP_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  EXPIRED_CHART_CLEANUP_INTERVAL_MS: z.coerce.number().int().positive().default(3600000),
  // Grace period after expires_at before a row is deleted; 0 = delete as soon as expired.
  EXPIRED_CHART_RETENTION_MS: z.coerce.number().int().nonnegative().default(0),

  // Optional JSON object of extra themes, merged over the built-ins at startup.
  // Invalid JSON / shape / color aborts startup (via the safeParse + process.exit below).
  CUSTOM_THEMES: z
    .string()
    .optional()
    .transform((raw, ctx) => {
      try {
        return parseCustomThemes(raw);
      } catch (e) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `CUSTOM_THEMES is invalid: ${e instanceof Error ? e.message : String(e)}`,
        });
        return z.NEVER;
      }
    }),
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
