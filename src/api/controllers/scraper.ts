import { Request, Response, NextFunction } from 'express';
import { scraperService, cacheService } from '../../services/index.js';
import { createError } from '../middleware/error.js';
import { ScraperRunRequest, ScraperRunResponse } from '../../types/api.js';

/**
 * POST /api/scraper/run
 * Run the scraper to update products from website
 */
export async function runScraper(
  req: Request<{}, {}, ScraperRunRequest>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { mode = 'incremental', dryRun = false, categoryUrl, limit = 100 } = req.body;

    if (mode !== 'incremental' && mode !== 'full') {
      throw createError(
        'Invalid mode. Must be "incremental" or "full".',
        400,
        'INVALID_REQUEST',
        { field: 'mode', allowed: ['incremental', 'full'] }
      );
    }

    const startedAt = new Date().toISOString();

    // Run the scraper
    const stats = await scraperService.runScraper({ mode, dryRun, categoryUrl, limit });

    const completedAt = new Date().toISOString();

    // Refresh cache after scraper completes (unless dry run)
    if (!dryRun) {
      await cacheService.refresh();
    }

    const response: ScraperRunResponse = {
      mode,
      startedAt,
      completedAt,
      stats: {
        pagesCrawled: stats.pagesCrawled,
        newProducts: stats.newProducts,
        updatedProducts: stats.updatedProducts,
        unchanged: stats.unchanged,
        errors: stats.errors,
      },
    };

    res.json({ success: true, data: response });
  } catch (error) {
    next(error);
  }
}
