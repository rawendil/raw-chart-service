import { Request } from 'express';
import { checkAccess } from '../../utils/access';
import { env } from '../../config/env';

function mockReq(options: {
  apiKey?: string;
  tokenQuery?: string;
  shareTokenHeader?: string;
} = {}): Request {
  return {
    header: jest.fn((name: string) => {
      if (name === 'x-api-key') return options.apiKey;
      if (name === 'x-share-token') return options.shareTokenHeader;
      return undefined;
    }),
    query: options.tokenQuery !== undefined ? { token: options.tokenQuery } : {},
  } as unknown as Request;
}

describe('checkAccess', () => {
  describe('wykres publiczny (shareToken = null)', () => {
    it('zezwala bez żadnego tokenu', () => {
      expect(checkAccess(null, mockReq())).toBe(true);
    });

    it('zezwala nawet gdy przekazany token nie pasuje do niczego', () => {
      expect(checkAccess(null, mockReq({ tokenQuery: 'cokolwiek' }))).toBe(true);
    });
  });

  describe('wykres prywatny (shareToken ustawiony)', () => {
    const TOKEN = 'secret-123';

    it('odmawia gdy brak tokenu', () => {
      expect(checkAccess(TOKEN, mockReq())).toBe(false);
    });

    it('odmawia gdy błędny token w query', () => {
      expect(checkAccess(TOKEN, mockReq({ tokenQuery: 'wrong' }))).toBe(false);
    });

    it('odmawia gdy błędny x-share-token header', () => {
      expect(checkAccess(TOKEN, mockReq({ shareTokenHeader: 'wrong' }))).toBe(false);
    });

    it('zezwala z poprawnym tokenem w query (?token=)', () => {
      expect(checkAccess(TOKEN, mockReq({ tokenQuery: TOKEN }))).toBe(true);
    });

    it('zezwala z poprawnym x-share-token headerem', () => {
      expect(checkAccess(TOKEN, mockReq({ shareTokenHeader: TOKEN }))).toBe(true);
    });

    it('query ma pierwszeństwo przed headerem gdy oba podane', () => {
      expect(checkAccess(TOKEN, mockReq({ tokenQuery: TOKEN, shareTokenHeader: 'wrong' }))).toBe(true);
      expect(checkAccess(TOKEN, mockReq({ tokenQuery: 'wrong', shareTokenHeader: TOKEN }))).toBe(false);
    });

    it('zezwala adminowi przez poprawny x-api-key niezależnie od braku tokenu', () => {
      expect(checkAccess(TOKEN, mockReq({ apiKey: env.API_KEY }))).toBe(true);
    });

    it('odmawia gdy x-api-key jest niepoprawny', () => {
      expect(checkAccess(TOKEN, mockReq({ apiKey: 'invalid-key' }))).toBe(false);
    });

    it('odmawia gdy pusty string jako x-api-key', () => {
      expect(checkAccess(TOKEN, mockReq({ apiKey: '' }))).toBe(false);
    });
  });
});
