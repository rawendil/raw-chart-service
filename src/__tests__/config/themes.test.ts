import { THEMES, THEME_NAMES, ThemeColors } from '../../config/themes';

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
