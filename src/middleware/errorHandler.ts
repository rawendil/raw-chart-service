import { Request, Response, NextFunction } from 'express';
import { Logger } from '../utils/logger';
import { env } from '../config/env';

const logger = new Logger();

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  let error = { ...err };
  error.message = err.message;

  // Log error
  logger.error('Error occurred', {
    error: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip
  });

  res.status(error.statusCode || 500).json({
    success: false,
    error: error.message || 'Server Error',
    ...(env.NODE_ENV === 'development' && { stack: err.stack })
  });
};