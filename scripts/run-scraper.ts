import dotenv from 'dotenv';
dotenv.config();

import { scraperService } from '../src/services/index.js';
import { logger } from '../src/utils/logger.js';

async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  const mode = (args.find((a) => a.startsWith('--mode='))?.split('=')[1] || 'incremental') as
    | 'incremental'
    | 'full';
  const dryRun = args.includes('--dry-run');
  const categoryUrl = args.find((a) => a.startsWith('--category='))?.split('=')[1];
  const limit = parseInt(args.find((a) => a.startsWith('--limit='))?.split('=')[1] || '100', 10);

  // Show help
  if (args.includes('--help')) {
    console.log(`
Usage: npm run scrape -- [options]

Options:
  --mode=incremental|full   Scraping mode (default: incremental)
  --category=<url>          Only scrape a specific category URL
  --limit=<number>          Max pages to crawl (default: 100)
  --dry-run                 Don't write to Google Sheets
  --help                    Show this help message

Examples:
  npm run scrape -- --category=https://www.easyprintsg.com/corporate-gifts/travel-lifestyle --dry-run
  npm run scrape -- --mode=full --limit=50
`);
    process.exit(0);
  }

  logger.info('Running scraper...', { mode, dryRun, categoryUrl, limit });

  try {
    const stats = await scraperService.runScraper({ mode, dryRun, categoryUrl, limit });

    logger.info('Scraper completed successfully', stats);
    console.log('\nScraper Results:');
    console.log(`  Pages crawled: ${stats.pagesCrawled}`);
    console.log(`  New products: ${stats.newProducts}`);
    console.log(`  Updated products: ${stats.updatedProducts}`);
    console.log(`  Unchanged: ${stats.unchanged}`);
    console.log(`  Errors: ${stats.errors}`);

    if (dryRun) {
      console.log('\n(Dry run - no changes written to sheet)');
    }
  } catch (error) {
    logger.error('Scraper failed', { error });
    process.exit(1);
  }
}

main();
