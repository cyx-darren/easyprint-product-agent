import { Request, Response, NextFunction } from 'express';
import { config } from '../../utils/config.js';
import { logger } from '../../utils/logger.js';

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Get API key from header or query parameter
  const apiKey = req.headers['x-api-key'] as string || req.query.api_key as string;

  if (!apiKey) {
    logger.warn('Missing API key', { path: req.path, ip: req.ip });
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing API key. Provide X-API-Key header or api_key query parameter.',
      },
    });
    return;
  }

  if (apiKey !== config.apiKey) {
    logger.warn('Invalid API key', { path: req.path, ip: req.ip });
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid API key.',
      },
    });
    return;
  }

  next();
}
