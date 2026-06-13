import { env } from './env';
import { ThemeColors } from './themeColors';

export type { ThemeColors };

// Built-in themes. CUSTOM_THEMES (env) is merged over these at startup; a custom theme with
// the same name overrides the built-in.
export const BUILTIN_THEMES = {
  light: {
    // Brand palette (teal #13ada5). Mirrors the source project's light-mode --chart-1..5,
    // text #0f2a2a, border #dde8e8.
    background: '#ffffff',
    text: '#0f2a2a',
    mutedText: '#5a6e6e',
    grid: '#dde8e8',
    palette: ['#13ada5', '#3b82f6', '#c98a12', '#7c6fd1', '#cf5f7e'],
  },
  dark: {
    background: '#1a1a1a',
    text: '#ffffff',
    mutedText: '#cccccc',
    grid: '#374151',
    palette: ['#60a5fa', '#f87171', '#34d399', '#fbbf24', '#a78bfa', '#f472b6'],
  },
} satisfies Record<string, ThemeColors>;

// Effective registry: built-ins overlaid with operator-supplied themes.
export const THEMES: Record<string, ThemeColors> = { ...BUILTIN_THEMES, ...env.CUSTOM_THEMES };

// Theme names are dynamic (runtime config), so Theme is a plain string validated at the boundary.
export type Theme = string;

export const THEME_NAMES = Object.keys(THEMES);

// Single accessor for renderers; falls back to light if an unknown name slips through.
export function getThemeColors(name: string): ThemeColors {
  return THEMES[name] ?? THEMES.light;
}
