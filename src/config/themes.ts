// Single source of truth for chart theme colors. Add a theme = add one entry here;
// the Theme type, validation enum, Swagger enum, and both render paths derive from this.
export interface ThemeColors {
  background: string; // page + chart background
  text: string; // legend + axis ticks + embed page heading
  mutedText: string; // embed page description
  grid: string; // axis grid lines
  palette: string[]; // dataset colors, cycled
}

export const THEMES = {
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

export type Theme = keyof typeof THEMES;

export const THEME_NAMES = Object.keys(THEMES) as [Theme, ...Theme[]];
