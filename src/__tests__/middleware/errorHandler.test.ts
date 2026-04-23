// jest.mock jest hoistowany przed importami — musi być przed importem errorHandler
jest.mock('../../config/env', () => ({
  env: { NODE_ENV: 'test' },
}));

import { Request, Response, NextFunction } from 'express';
import { env } from '../../config/env';
import { errorHandler, AppError } from '../../middleware/errorHandler';

function mockReq() {
  return {
    originalUrl: '/test',
    method: 'GET',
    ip: '127.0.0.1',
    app: { locals: {} },
  } as unknown as Request;
}

function mockRes() {
  const res = {
    status: jest.fn(),
    json: jest.fn(),
  } as unknown as Response;
  (res.status as jest.Mock).mockReturnValue(res);
  return res;
}

describe('errorHandler', () => {
  afterEach(() => {
    (env as { NODE_ENV: string }).NODE_ENV = 'test';
  });

  it('używa statusCode z błędu gdy podany', () => {
    const err: AppError = Object.assign(new Error('Not found'), { statusCode: 404 });
    const res = mockRes();

    errorHandler(err, mockReq(), res, jest.fn() as unknown as NextFunction);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('używa 500 gdy brak statusCode', () => {
    const err: AppError = new Error('Unexpected');
    const res = mockRes();

    errorHandler(err, mockReq(), res, jest.fn() as unknown as NextFunction);

    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('zawsze zwraca success: false z komunikatem błędu', () => {
    const err: AppError = new Error('Something went wrong');
    const res = mockRes();

    errorHandler(err, mockReq(), res, jest.fn() as unknown as NextFunction);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Something went wrong',
      })
    );
  });

  it('zawiera stack w trybie development', () => {
    (env as { NODE_ENV: string }).NODE_ENV = 'development';
    const err: AppError = new Error('Dev error');
    const res = mockRes();

    errorHandler(err, mockReq(), res, jest.fn() as unknown as NextFunction);

    const call = (res.json as jest.Mock).mock.calls[0][0];
    expect(call).toHaveProperty('stack');
  });

  it('nie zawiera stack w trybie production', () => {
    (env as { NODE_ENV: string }).NODE_ENV = 'production';
    const err: AppError = new Error('Prod error');
    const res = mockRes();

    errorHandler(err, mockReq(), res, jest.fn() as unknown as NextFunction);

    const call = (res.json as jest.Mock).mock.calls[0][0];
    expect(call).not.toHaveProperty('stack');
  });
});
