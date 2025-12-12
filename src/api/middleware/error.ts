import { Request, Response, NextFunction } from 'express';
import { logger } from '../../utils/logger.js';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
  details?: Record<string, unknown>;
}

export function errorMiddleware(
  err: AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err.statusCode || 500;
  const code = err.code || 'INTERNAL_ERROR';
  const message = err.message || 'An unexpected error occurred';

  logger.error('Request error', {
    path: req.path,
    method: req.method,
    statusCode,
    code,
    message,
    stack: err.stack,
  });

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      details: err.details,
    },
  });
}

export function createError(
  message: string,
  statusCode: number = 500,
  code: string = 'INTERNAL_ERROR',
  details?: Record<string, unknown>
): AppError {
  const error: AppError = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  error.details = details;
  return error;
}
