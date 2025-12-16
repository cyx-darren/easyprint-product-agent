import { Router, Request, Response } from 'express';
import { authMiddleware } from './middleware/auth.js';
import { searchProducts, checkAvailability, checkMultiAvailability, getSynonyms, resolveTerms } from './controllers/product.js';
import { runScraper } from './controllers/scraper.js';
import { refreshCache } from './controllers/cache.js';
import { cacheService } from '../services/index.js';
import { HealthCheckResponse } from '../types/api.js';

const router = Router();

// Health check (no auth required)
router.get('/health', (_req: Request, res: Response) => {
  const cacheStatus = cacheService.getStatus();

  const response: HealthCheckResponse = {
    status: cacheStatus.isInitialized ? 'ok' : 'error',
    timestamp: new Date().toISOString(),
    cache: {
      products: cacheStatus.products,
      synonyms: cacheStatus.synonyms,
      lastRefresh: cacheStatus.lastRefresh,
    },
  };

  res.json(response);
});

// Protected routes
router.use(authMiddleware);

// Product endpoints
router.post('/api/product/search', searchProducts);
router.post('/api/product/availability', checkAvailability);
router.post('/api/product/availability-multi', checkMultiAvailability);
router.post('/api/product/resolve', resolveTerms);
router.get('/api/product/synonyms', getSynonyms);

// Scraper endpoints
router.post('/api/scraper/run', runScraper);

// Cache endpoints
router.post('/api/cache/refresh', refreshCache);

export { router };
