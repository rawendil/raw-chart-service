import { DatabaseService } from '../../services/database';

describe('DatabaseService.deleteExpiredCharts', () => {
  let db: DatabaseService;
  let querySpy: jest.SpyInstance;

  beforeEach(() => {
    db = new DatabaseService();
    querySpy = jest.spyOn(db, 'query').mockResolvedValue({ rowCount: 0 });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('deletes charts past expires_at and returns the deleted count', async () => {
    querySpy.mockResolvedValue({ rowCount: 3 });

    const deleted = await db.deleteExpiredCharts(0);

    expect(deleted).toBe(3);
    const [sql, params] = querySpy.mock.calls[0];
    expect(sql).toContain('DELETE FROM charts');
    expect(sql).toContain('expires_at IS NOT NULL');
    expect(params[0]).toBeInstanceOf(Date);
  });

  it('returns 0 when the driver reports a null rowCount', async () => {
    querySpy.mockResolvedValue({ rowCount: null });

    expect(await db.deleteExpiredCharts(0)).toBe(0);
  });

  it('applies the retention grace period to the deletion cutoff', async () => {
    const retentionMs = 60_000;
    const before = Date.now();

    await db.deleteExpiredCharts(retentionMs);

    const after = Date.now();
    const cutoff = (querySpy.mock.calls[0][1][0] as Date).getTime();
    expect(cutoff).toBeGreaterThanOrEqual(before - retentionMs);
    expect(cutoff).toBeLessThanOrEqual(after - retentionMs);
  });
});
