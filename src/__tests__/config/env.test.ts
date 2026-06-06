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
