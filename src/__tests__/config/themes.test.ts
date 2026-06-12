import { THEMES, THEME_NAMES, ThemeColors, getThemeColors, BUILTIN_THEMES } from '../../config/themes';
import { themeSchema } from '../../middleware/validation';

describe('THEMES single source of truth', () => {
  const requiredFields: (keyof ThemeColors)[] = [
    'background',
    'text',
    'mutedText',
    'grid',
    'palette',
  ];

  it('exposes at least one theme', () => {
    expect(THEME_NAMES.length).toBeGreaterThan(0);
  });

  it.each(THEME_NAMES)('theme "%s" has every color field', (name) => {
    const theme = THEMES[name];
    for (const field of requiredFields) {
      expect(theme[field]).toBeDefined();
    }
  });

  it.each(THEME_NAMES)('theme "%s" has a non-empty palette', (name) => {
    expect(Array.isArray(THEMES[name].palette)).toBe(true);
    expect(THEMES[name].palette.length).toBeGreaterThan(0);
  });
});

describe('themeSchema derives from THEMES', () => {
  it.each(THEME_NAMES)('accepts "%s"', (name) => {
    expect(themeSchema.parse(name)).toBe(name);
  });

  it('rejects an unknown theme', () => {
    expect(() => themeSchema.parse('not-a-theme')).toThrow();
  });

  it('defaults to light', () => {
    expect(themeSchema.parse(undefined)).toBe('light');
  });
});

describe('getThemeColors', () => {
  it('returns the requested built-in theme', () => {
    expect(getThemeColors('dark')).toEqual(BUILTIN_THEMES.dark);
  });

  it('falls back to light for an unknown theme', () => {
    expect(getThemeColors('does-not-exist')).toEqual(THEMES.light);
  });
});

describe('CUSTOM_THEMES merge', () => {
  const original = process.env;
  beforeEach(() => {
    process.env = { ...original };
    jest.resetModules();
  });
  afterEach(() => {
    process.env = original;
    jest.resetModules();
  });

  it('adds a new custom theme and can override a built-in', () => {
    process.env.CUSTOM_THEMES = JSON.stringify({
      brand: { background: '#0b1020', text: '#e6e8ee', mutedText: '#9aa3b2', grid: '#243049', palette: ['#7aa2ff'] },
      light: { background: '#fafafa', text: '#111111', mutedText: '#666666', grid: '#eeeeee', palette: ['#123456'] },
    });
    jest.resetModules();
    const themes = require('../../config/themes');
    expect(themes.THEME_NAMES).toEqual(expect.arrayContaining(['light', 'dark', 'brand']));
    expect(themes.getThemeColors('brand').palette).toEqual(['#7aa2ff']);
    expect(themes.getThemeColors('light').background).toBe('#fafafa');
  });
});
