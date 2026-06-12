import { themeColorsSchema, parseCustomThemes } from '../../config/themeColors';

const valid = {
  background: '#ffffff',
  text: '#000000',
  mutedText: 'rgb(102, 102, 102)',
  grid: 'rgba(0, 0, 0, 0.1)',
  palette: ['#3b82f6', '#abc'],
};

describe('themeColorsSchema', () => {
  it('accepts valid hex/rgb/rgba colors', () => {
    expect(() => themeColorsSchema.parse(valid)).not.toThrow();
  });

  it.each(['red', 'red;}body{}', 'url(x)', 'expression(1)', ''])(
    'rejects non-whitelisted color %p',
    (bad) => {
      expect(() => themeColorsSchema.parse({ ...valid, text: bad })).toThrow();
    }
  );

  it('rejects an empty palette', () => {
    expect(() => themeColorsSchema.parse({ ...valid, palette: [] })).toThrow();
  });

  it('rejects a palette containing a bad color', () => {
    expect(() => themeColorsSchema.parse({ ...valid, palette: ['#fff', 'red'] })).toThrow();
  });

  it('rejects a missing field', () => {
    const { grid, ...missing } = valid;
    expect(() => themeColorsSchema.parse(missing)).toThrow();
  });

  it('rejects an unknown extra field', () => {
    expect(() => themeColorsSchema.parse({ ...valid, extra: '#fff' })).toThrow();
  });

  it('accepts rgb at the 255 boundary', () => {
    expect(() => themeColorsSchema.parse({ ...valid, text: 'rgb(255, 255, 255)' })).not.toThrow();
  });

  it('rejects an rgb channel above 255', () => {
    expect(() => themeColorsSchema.parse({ ...valid, text: 'rgb(999, 0, 0)' })).toThrow();
  });

  it.each(['rgba(0, 0, 0, 1)', 'rgba(0, 0, 0, 1.0)', 'rgba(0, 0, 0, 1.00)', 'rgba(0, 0, 0, .5)'])(
    'accepts valid alpha %p',
    (c) => {
      expect(() => themeColorsSchema.parse({ ...valid, grid: c })).not.toThrow();
    }
  );
});

describe('parseCustomThemes', () => {
  it('returns {} for undefined or empty', () => {
    expect(parseCustomThemes(undefined)).toEqual({});
    expect(parseCustomThemes('')).toEqual({});
    expect(parseCustomThemes('   ')).toEqual({});
  });

  it('parses a valid themes object', () => {
    const raw = JSON.stringify({ brand: valid });
    expect(parseCustomThemes(raw)).toEqual({ brand: valid });
  });

  it('throws on invalid JSON', () => {
    expect(() => parseCustomThemes('{not json')).toThrow();
  });

  it('throws on valid JSON with a bad theme shape', () => {
    expect(() => parseCustomThemes(JSON.stringify({ brand: { text: '#000' } }))).toThrow();
  });

  it('throws on an invalid theme name', () => {
    expect(() => parseCustomThemes(JSON.stringify({ 'Bad Name': valid }))).toThrow();
  });
});
