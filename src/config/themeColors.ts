import { z } from 'zod';

// Strict color whitelist. These values are inlined into the embed page CSS, the injected
// theme JSON, and the Chart.js config rendered inside Puppeteer, so untrusted input must be
// constrained to real color literals (no CSS/HTML injection vectors).
const colorSchema = z
  .string()
  .regex(
    /^(#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6}|rgb\(\s*(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\s*,\s*(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\s*,\s*(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\s*\)|rgba\(\s*(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\s*,\s*(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\s*,\s*(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\s*,\s*(0(\.\d+)?|1(\.0+)?|\.\d+)\s*\))$/,
    'must be a hex (#rgb/#rrggbb), rgb(), or rgba() color'
  );

export interface ThemeColors {
  background: string; // page + chart background
  text: string; // legend + axis ticks + embed page heading
  mutedText: string; // embed page description
  grid: string; // axis grid lines
  palette: string[]; // dataset colors, cycled
}

export const themeColorsSchema = z
  .object({
    background: colorSchema,
    text: colorSchema,
    mutedText: colorSchema,
    grid: colorSchema,
    palette: z.array(colorSchema).min(1),
  })
  .strict();

export const themeNameSchema = z.string().regex(/^[a-z0-9_-]+$/, 'theme name must be [a-z0-9_-]');

// Pure parser used by env.ts. Returns {} for empty input; THROWS (SyntaxError or ZodError)
// on any invalid input so the caller can fail-fast.
export function parseCustomThemes(raw?: string): Record<string, ThemeColors> {
  if (!raw || raw.trim() === '') {
    return {};
  }
  const parsed: unknown = JSON.parse(raw);
  return z.record(themeNameSchema, themeColorsSchema).parse(parsed);
}
