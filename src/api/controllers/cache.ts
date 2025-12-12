import { Request, Response, NextFunction } from 'express';
import { cacheService } from '../../services/index.js';
import { CacheRefreshResponse } from '../../types/api.js';

/**
 * POST /api/cache/refresh
 * Force refresh the cache from Google Sheets
 */
export async function refreshCache(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await cacheService.refresh();

    const response: CacheRefreshResponse = {
      productsLoaded: result.productsLoaded,
      synonymsLoaded: result.synonymsLoaded,
      refreshTimeMs: result.refreshTimeMs,
    };

    res.json({ success: true, data: response });
  } catch (error) {
    next(error);
  }
}
