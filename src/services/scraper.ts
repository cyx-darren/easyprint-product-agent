import FirecrawlApp from '@mendable/firecrawl-js';
import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';
import { ScrapedProduct } from '../types/product.js';
import { ScraperRowData } from '../types/sheets.js';
import { sheetsService } from './sheets.js';

interface FirecrawlExtractedData {
  name?: string;
  category?: string;
  colors?: string[];
}

interface CrawlPageData {
  url?: string;
  markdown?: string;
  extract?: FirecrawlExtractedData;
  metadata?: {
    title?: string;
    'og:title'?: string;
    ogTitle?: string;
    'og:description'?: string;
    ogDescription?: string;
    description?: string;
    sourceURL?: string;
    url?: string;
  };
}

interface CrawlResult {
  success: boolean;
  data?: CrawlPageData[];
}

interface CrawlStatusResult {
  status: string;
  data?: CrawlPageData[];
}

interface ScraperOptions {
  mode?: 'incremental' | 'full';
  dryRun?: boolean;
  categoryUrl?: string; // Optional: crawl only a specific category
  categoryName?: string; // Optional: category name for products
  limit?: number; // Max pages to crawl
}

class ScraperService {
  private firecrawl: FirecrawlApp;
  private baseUrl: string;
  private currentCategory: string = 'Uncategorized';

  constructor() {
    this.firecrawl = new FirecrawlApp({ apiKey: config.firecrawl.apiKey });
    this.baseUrl = config.magento.baseUrl;
  }

  /**
   * Run the scraper to crawl products from the Magento site
   * Can optionally target a specific category URL
   */
  async runScraper(
    options: ScraperOptions = {}
  ): Promise<{
    pagesCrawled: number;
    newProducts: number;
    updatedProducts: number;
    unchanged: number;
    errors: number;
  }> {
    const { mode = 'incremental', dryRun = false, categoryUrl, categoryName, limit = 100 } = options;
    const startTime = Date.now();
    const targetUrl = categoryUrl || this.baseUrl;

    // Set the category for this scrape run
    if (categoryName) {
      this.currentCategory = categoryName;
    } else if (categoryUrl) {
      // Extract category name from URL path
      this.currentCategory = this.deriveCategoryName(categoryUrl);
    } else {
      this.currentCategory = 'Uncategorized';
    }

    logger.info('Starting scraper', { mode, dryRun, targetUrl, limit, category: this.currentCategory });

    try {
      // Crawl the site or category
      const crawlResult = await this.crawlSite(targetUrl, categoryUrl, limit);

      if (!crawlResult.success || !crawlResult.data) {
        throw new Error('Crawl failed or returned no data');
      }

      // Parse crawled pages into products
      const scrapedProducts = this.parseProducts(crawlResult.data);
      logger.info('Parsed products from crawl', { count: scrapedProducts.length });

      if (dryRun) {
        logger.info('Dry run - not writing to sheet');
        return {
          pagesCrawled: crawlResult.data.length,
          newProducts: scrapedProducts.length,
          updatedProducts: 0,
          unchanged: 0,
          errors: 0,
        };
      }

      // Get existing products for comparison
      const existingUrls = await sheetsService.getExistingProductUrls();

      // Categorize products
      const newProducts: ScraperRowData[] = [];
      const updatedProducts: Array<{ rowNumber: number; data: Partial<ScraperRowData> }> = [];
      let unchanged = 0;

      for (const product of scrapedProducts) {
        const existingRow = existingUrls.get(product.url);

        if (!existingRow) {
          // New product
          newProducts.push(this.toScraperRowData(product));
        } else if (mode === 'full') {
          // Update existing product (only in full mode)
          updatedProducts.push({
            rowNumber: existingRow,
            data: {
              productName: product.name,
              category: product.category,
              colorsOnWebsite: product.colors.join(', '),
            },
          });
        } else {
          unchanged++;
        }
      }

      // Write new products
      if (newProducts.length > 0) {
        await sheetsService.appendProducts(newProducts);
      }

      // Update existing products (in full mode)
      for (const update of updatedProducts) {
        await sheetsService.updateProduct(update.rowNumber, update.data);
      }

      const duration = Date.now() - startTime;
      logger.info('Scraper completed', {
        duration,
        pagesCrawled: crawlResult.data.length,
        newProducts: newProducts.length,
        updatedProducts: updatedProducts.length,
        unchanged,
      });

      return {
        pagesCrawled: crawlResult.data.length,
        newProducts: newProducts.length,
        updatedProducts: updatedProducts.length,
        unchanged,
        errors: 0,
      };
    } catch (error) {
      logger.error('Scraper failed', { error });
      throw error;
    }
  }

  /**
   * Crawl the Magento site using Firecrawl
   * Uses a two-phase approach: scrape category/subcategory pages to find product links,
   * then scrape each product page individually.
   *
   * IMPORTANT: Always visits subcategory pages via "View All" links because the main
   * category page only shows a subset of products per subcategory (typically 5 items).
   */
  private async crawlSite(
    targetUrl: string,
    categoryUrl?: string,
    limit: number = 100
  ): Promise<CrawlResult> {
    logger.info('Starting Firecrawl scrape', { targetUrl, categoryUrl, limit });

    try {
      // Phase 1: Scrape the category page to get subcategory and product links
      const categoryResponse = await this.firecrawl.scrapeUrl(targetUrl, {
        formats: ['markdown', 'links'],
      });

      const categoryData = categoryResponse as unknown as {
        success?: boolean;
        markdown?: string;
        links?: string[];
        metadata?: Record<string, string>;
      };

      if (!categoryData.success) {
        throw new Error('Failed to scrape category page');
      }

      // Collect all product URLs using a Set to avoid duplicates
      const allProductUrls = new Set<string>();

      // Extract subcategory URLs (the "View All" links)
      const subcategoryUrls = this.extractSubcategoryUrls(categoryData.links || [], targetUrl);
      logger.info('Found subcategory URLs', { count: subcategoryUrls.length, urls: subcategoryUrls });

      // If we have subcategories, visit each one to get ALL products
      // This is important because the main category page only shows ~5 products per subcategory
      if (subcategoryUrls.length > 0) {
        for (const subUrl of subcategoryUrls) {
          if (allProductUrls.size >= limit) break;

          logger.info('Scraping subcategory for products', { url: subUrl });
          try {
            const subResponse = await this.firecrawl.scrapeUrl(subUrl, {
              formats: ['links'],
            });
            const subData = subResponse as unknown as { success?: boolean; links?: string[] };

            if (subData.success) {
              const subProductUrls = this.extractProductUrls(subData.links || [], limit);
              for (const url of subProductUrls) {
                allProductUrls.add(url);
              }
              logger.info('Found products in subcategory', {
                subcategory: subUrl,
                productsFound: subProductUrls.length,
                totalSoFar: allProductUrls.size
              });
            }
          } catch (error) {
            logger.warn('Failed to scrape subcategory', { url: subUrl, error });
          }
        }
      }

      // Also extract any product URLs directly from the main category page
      // (in case there are products not in subcategories)
      const mainPageProducts = this.extractProductUrls(categoryData.links || [], limit);
      for (const url of mainPageProducts) {
        allProductUrls.add(url);
      }

      const productUrls = Array.from(allProductUrls);
      logger.info('Total unique product URLs found', { count: productUrls.length, urls: productUrls.slice(0, 10) });

      // Phase 2: Scrape each product page
      const productPages: CrawlPageData[] = [];
      const urlsToScrape = productUrls.slice(0, limit);

      for (const productUrl of urlsToScrape) {
        try {
          logger.info('Scraping product', { url: productUrl });
          const productResponse = await this.firecrawl.scrapeUrl(productUrl, {
            formats: ['markdown'],
          });

          const productData = productResponse as unknown as {
            success?: boolean;
            markdown?: string;
            metadata?: Record<string, string>;
          };

          if (productData.success) {
            productPages.push({
              url: productUrl,
              markdown: productData.markdown,
              metadata: productData.metadata as CrawlPageData['metadata'],
            });
          }
        } catch (error) {
          logger.warn('Failed to scrape product', { url: productUrl, error });
        }
      }

      logger.info('Scraped product pages', { count: productPages.length });

      return {
        success: true,
        data: productPages,
      };
    } catch (error) {
      logger.error('Firecrawl scrape failed', { error });
      throw error;
    }
  }

  /**
   * Extract product URLs from a list of links
   */
  private extractProductUrls(links: string[], limit: number): string[] {
    const productUrls: string[] = [];
    const seenUrls = new Set<string>();

    for (const link of links) {
      if (productUrls.length >= limit) break;

      try {
        const url = new URL(link);
        // Only include links from easyprintsg.com domain
        if (!url.host.includes('easyprintsg.com')) continue;

        // Normalize URL (remove trailing slash, query params)
        const normalizedUrl = `${url.origin}${url.pathname}`.replace(/\/$/, '');

        // Skip if we've already seen this URL
        if (seenUrls.has(normalizedUrl)) continue;
        seenUrls.add(normalizedUrl);

        // Check if it's a product page
        if (this.isProductPage(link)) {
          productUrls.push(normalizedUrl);
        }
      } catch {
        // Invalid URL, skip
      }
    }

    return productUrls;
  }

  /**
   * Extract subcategory URLs from links
   */
  private extractSubcategoryUrls(links: string[], parentUrl: string): string[] {
    const subcategoryUrls: string[] = [];
    const seenUrls = new Set<string>();

    try {
      const parentPath = new URL(parentUrl).pathname.replace(/\/$/, '');

      for (const link of links) {
        try {
          const url = new URL(link);
          // Only include links from easyprintsg.com domain
          if (!url.host.includes('easyprintsg.com')) continue;

          const linkPath = url.pathname.replace(/\/$/, '');

          // Subcategories are nested under the parent path
          // e.g., /corporate-gifts/travel-lifestyle/luggage is a subcategory of /corporate-gifts/travel-lifestyle
          if (
            linkPath.startsWith(parentPath + '/') &&
            linkPath !== parentPath &&
            !seenUrls.has(linkPath)
          ) {
            seenUrls.add(linkPath);
            subcategoryUrls.push(`${url.origin}${linkPath}`);
          }
        } catch {
          // Invalid URL, skip
        }
      }
    } catch {
      // Invalid parent URL
    }

    return subcategoryUrls;
  }

  /**
   * Wait for async crawl to complete
   */
  private async waitForCrawlCompletion(crawlId: string): Promise<CrawlResult> {
    const maxAttempts = 60;
    const pollInterval = 5000;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));

      try {
        const statusResponse = await this.firecrawl.checkCrawlStatus(crawlId);

        // Cast to unknown first to handle response shape
        const status = statusResponse as unknown as CrawlStatusResult;

        if (status && status.status === 'completed') {
          return {
            success: true,
            data: status.data || [],
          };
        }

        if (status && status.status === 'failed') {
          throw new Error('Crawl failed');
        }

        logger.debug('Crawl still in progress', { attempt, status: status?.status });
      } catch (error) {
        logger.error('Error checking crawl status', { error });
      }
    }

    throw new Error('Crawl timed out');
  }

  /**
   * Parse crawled pages into structured products
   */
  private parseProducts(pages: CrawlPageData[]): ScrapedProduct[] {
    const products: ScrapedProduct[] = [];

    for (const page of pages) {
      // Get URL from top level or metadata
      const pageUrl = page.url || page.metadata?.sourceURL || page.metadata?.url;

      // Skip non-product pages
      if (!pageUrl || !this.isProductPage(pageUrl)) {
        logger.debug('Skipping non-product page', { url: pageUrl });
        continue;
      }

      // Try to extract product data from metadata first, then markdown
      const productData = this.extractProductData(page);

      if (productData) {
        products.push({
          name: productData.name,
          category: productData.category || 'Uncategorized',
          url: this.extractPath(pageUrl),
          colors: productData.colors,
          scrapedAt: new Date().toISOString(),
          sourceUrl: pageUrl,
        });
        logger.info('Parsed product', { name: productData.name, url: pageUrl });
      }
    }

    return products;
  }

  /**
   * Extract product data from page metadata and markdown
   */
  private extractProductData(
    page: CrawlPageData
  ): { name: string; category: string; colors: string[] } | null {
    const metadata = page.metadata;
    const markdown = page.markdown || '';

    // Extract product name from metadata
    const name = metadata?.ogTitle || metadata?.['og:title'] || metadata?.title || '';
    if (!name) {
      return null;
    }

    // Extract colors from og:description or markdown
    const description = metadata?.ogDescription || metadata?.['og:description'] || markdown;
    const colors = this.extractColors(description);

    // Try to extract category from URL path
    const category = this.extractCategoryFromUrl(page.url || '');

    return { name, category, colors };
  }

  /**
   * Extract colors from product description text
   */
  private extractColors(text: string): string[] {
    // Look for "Available Colours:" or "Available Colors:" pattern (handles markdown bold)
    const colorsMatch = text.match(/\*?\*?Available Colou?rs?:?\*?\*?\s*([^\n*]+)/i);
    if (colorsMatch) {
      return this.parseColorList(colorsMatch[1]);
    }

    // Look for "Color:" or "Colour:" pattern (handles markdown bold)
    const colorMatch = text.match(/\*?\*?Colou?rs?:?\*?\*?\s*([^\n*]+)/i);
    if (colorMatch) {
      return this.parseColorList(colorMatch[1]);
    }

    // Look for colors after "Colors Available:" pattern
    const colorsAvailableMatch = text.match(/Colou?rs? Available:?\s*([^\n*]+)/i);
    if (colorsAvailableMatch) {
      return this.parseColorList(colorsAvailableMatch[1]);
    }

    return [];
  }

  /**
   * Parse a color list string into individual colors
   */
  private parseColorList(colorString: string): string[] {
    // Replace " and " with comma for consistent splitting
    const normalized = colorString.replace(/\s+and\s+/gi, ', ');

    return normalized
      .split(/[,&]/)
      .map((c) => c.trim())
      .filter((c) => {
        if (c.length === 0) return false;
        // Filter out non-color strings
        const lowerC = c.toLowerCase();
        if (lowerC === 'and' || lowerC === 'or') return false;
        // Filter out if it's too long (likely not a color)
        if (c.length > 50) return false;
        return true;
      });
  }

  /**
   * Get the category for the current scrape run
   */
  private extractCategoryFromUrl(_url: string): string {
    return this.currentCategory;
  }

  /**
   * Derive a human-readable category name from a URL
   */
  private deriveCategoryName(url: string): string {
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname;

      // Get the last segment of the path and make it readable
      const segments = path.split('/').filter((s) => s.length > 0);
      if (segments.length > 0) {
        const lastSegment = segments[segments.length - 1];
        // Convert "travel-lifestyle" to "Travel & Lifestyle"
        return lastSegment
          .split('-')
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ')
          .replace(' And ', ' & ');
      }
      return 'Uncategorized';
    } catch {
      return 'Uncategorized';
    }
  }

  /**
   * Check if a URL is a product page (not category, about, etc.)
   * EasyPrint product URLs are typically single-segment paths like /product-name
   * e.g., /pvc-luggage-tag, /portable-weighing-scale
   */
  private isProductPage(url: string): boolean {
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname.toLowerCase();

      // Exclude common non-product pages
      const excludePatterns = [
        '/corporate-gifts/', // Category pages (multi-segment)
        '/business-stationery/',
        '/large-format-print/',
        '/category/',
        '/cart',
        '/checkout',
        '/customer/',
        '/about',
        '/contact',
        '/faq',
        '/privacy',
        '/terms',
        '/blog',
        '/news',
        '/search',
        '/catalogsearch/',
        '/wishlist/',
        '/media/',
        '/static/',
        '/pub/',
        '/quotation/',
        '/our-recent-projects',
        '/latest-gifts',
        '/popular-gifts',
        '/trending-gifts',
        '/order-tracking',
        '/shippingandreturn',
      ];

      for (const pattern of excludePatterns) {
        if (path.includes(pattern)) {
          return false;
        }
      }

      // Product URLs are single-segment paths like /pvc-luggage-tag
      const segments = path.split('/').filter((s) => s.length > 0);

      // Product pages: single segment with a slug (typically contains hyphen)
      if (segments.length === 1 && segments[0] !== '') {
        const slug = segments[0];

        // Exclude homepage and common static pages
        const excludeSingleSegment = [
          'home', 'index', 'login', 'register', 'account',
          'lanyard', 'flyer', // These are category pages without hyphens
        ];
        if (excludeSingleSegment.includes(slug)) {
          return false;
        }

        // Product slugs typically contain hyphens
        // e.g., pvc-luggage-tag, portable-weighing-scale
        if (slug.includes('-')) {
          return true;
        }

        // Some products might not have hyphens but are still valid
        // Check if it's not a known category
        return true;
      }

      // Also match traditional patterns
      return (
        path.includes('/products/') ||
        path.includes('/product/') ||
        (path.endsWith('.html') && !path.includes('/cms/'))
      );
    } catch {
      return false;
    }
  }

  /**
   * Extract path from full URL
   */
  private extractPath(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.pathname;
    } catch {
      return url;
    }
  }

  /**
   * Convert ScrapedProduct to ScraperRowData for sheets
   */
  private toScraperRowData(product: ScrapedProduct): ScraperRowData {
    return {
      productName: product.name,
      category: product.category,
      websiteUrl: product.url,
      otherNames: '', // VA fills this
      colorsOnWebsite: product.colors.join(', '),
    };
  }
}

export const scraperService = new ScraperService();
