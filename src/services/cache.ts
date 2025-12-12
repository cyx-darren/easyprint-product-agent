import { Product, Synonym } from '../types/product.js';
import { sheetsService } from './sheets.js';
import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';

class CacheService {
  private products: Product[] = [];
  private synonyms: Synonym[] = [];
  private lastRefresh: Date | null = null;
  private refreshInterval: NodeJS.Timeout | null = null;
  private isInitialized: boolean = false;

  /**
   * Initialize the cache by loading data from sheets
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('Cache already initialized');
      return;
    }

    await this.refresh();

    // Set up periodic refresh
    this.refreshInterval = setInterval(() => {
      this.refresh().catch((error) => {
        logger.error('Periodic cache refresh failed', { error });
      });
    }, config.cache.refreshIntervalMs);

    this.isInitialized = true;
    logger.info('Cache initialized with periodic refresh', {
      intervalMs: config.cache.refreshIntervalMs,
    });
  }

  /**
   * Refresh the cache from Google Sheets
   */
  async refresh(): Promise<{ productsLoaded: number; synonymsLoaded: number; refreshTimeMs: number }> {
    const startTime = Date.now();
    logger.info('Refreshing cache from sheets');

    try {
      const [products, synonyms] = await Promise.all([
        sheetsService.getProducts(),
        sheetsService.getSynonyms(),
      ]);

      this.products = products;
      this.synonyms = synonyms;
      this.lastRefresh = new Date();

      const refreshTimeMs = Date.now() - startTime;

      logger.info('Cache refreshed', {
        products: products.length,
        synonyms: synonyms.length,
        refreshTimeMs,
      });

      return {
        productsLoaded: products.length,
        synonymsLoaded: synonyms.length,
        refreshTimeMs,
      };
    } catch (error) {
      logger.error('Failed to refresh cache', { error });
      throw error;
    }
  }

  /**
   * Get all products from cache
   */
  getProducts(): Product[] {
    return this.products;
  }

  /**
   * Get all synonyms from cache
   */
  getSynonyms(): Synonym[] {
    return this.synonyms;
  }

  /**
   * Get cache status
   */
  getStatus(): {
    products: number;
    synonyms: number;
    lastRefresh: string;
    isInitialized: boolean;
  } {
    return {
      products: this.products.length,
      synonyms: this.synonyms.length,
      lastRefresh: this.lastRefresh?.toISOString() || 'never',
      isInitialized: this.isInitialized,
    };
  }

  /**
   * Stop the cache refresh interval
   */
  stop(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
      logger.info('Cache refresh interval stopped');
    }
  }
}

export const cacheService = new CacheService();
