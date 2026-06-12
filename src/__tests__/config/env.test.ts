describe('env — expired-chart cleanup config', () => {
  const original = process.env;

  afterEach(() => {
    process.env = original;
    jest.resetModules();
  });

  async function loadEnv(overrides: Record<string, string>) {
    jest.resetModules();
    process.env = { ...original, ...overrides };
    const mod = await import('../../config/env');
    return mod.env;
  }

  it("parses EXPIRED_CHART_CLEANUP_ENABLED='false' as boolean false", async () => {
    const env = await loadEnv({ EXPIRED_CHART_CLEANUP_ENABLED: 'false' });
    expect(env.EXPIRED_CHART_CLEANUP_ENABLED).toBe(false);
  });

  it('defaults EXPIRED_CHART_CLEANUP_ENABLED to true when unset', async () => {
    const env = await loadEnv({});
    expect(env.EXPIRED_CHART_CLEANUP_ENABLED).toBe(true);
  });

  it('treats EXPIRED_CHART_RETENTION_MS=0 as a real value, not an off-switch', async () => {
    const env = await loadEnv({ EXPIRED_CHART_RETENTION_MS: '0' });
    expect(env.EXPIRED_CHART_RETENTION_MS).toBe(0);
  });

  it('coerces EXPIRED_CHART_RETENTION_MS from a string', async () => {
    const env = await loadEnv({ EXPIRED_CHART_RETENTION_MS: '120000' });
    expect(env.EXPIRED_CHART_RETENTION_MS).toBe(120_000);
  });
});

describe('env — CUSTOM_THEMES', () => {
  const original = process.env;

  beforeEach(() => {
    process.env = { ...original };
    jest.resetModules();
  });

  afterEach(() => {
    process.env = original;
    jest.resetModules();
  });

  it('defaults to {} when unset', () => {
    delete process.env.CUSTOM_THEMES;
    const { env } = require('../../config/env');
    expect(env.CUSTOM_THEMES).toEqual({});
  });

  it('parses a valid themes object', () => {
    process.env.CUSTOM_THEMES = JSON.stringify({
      brand: {
        background: '#0b1020',
        text: '#e6e8ee',
        mutedText: '#9aa3b2',
        grid: '#243049',
        palette: ['#7aa2ff', '#ff6b6b'],
      },
    });
    const { env } = require('../../config/env');
    expect(env.CUSTOM_THEMES.brand.palette).toEqual(['#7aa2ff', '#ff6b6b']);
  });

  it('aborts startup on invalid CUSTOM_THEMES', () => {
    process.env.CUSTOM_THEMES = '{not valid json';
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code})`);
    }) as never);
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.resetModules();
    expect(() => require('../../config/env')).toThrow('process.exit(1)');
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });
});
