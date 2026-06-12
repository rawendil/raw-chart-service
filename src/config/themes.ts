import { env } from './env';
import { ThemeColors } from './themeColors';

export type { ThemeColors };

// Built-in themes. CUSTOM_THEMES (env) is merged over these at startup; a custom theme with
// the same name overrides the built-in.
export const BUILTIN_THEMES = {
  light: {
    background: '#ffffff',
    text: '#000000',
    mutedText: '#666666',
    grid: '#e5e7eb',
    palette: ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'],
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
