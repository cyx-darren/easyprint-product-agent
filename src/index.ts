import { startServer } from './server.js';
import { cacheService } from './services/index.js';
import { logger } from './utils/logger.js';

async function main() {
  try {
    logger.info('Starting Product Agent...');

    // Initialize cache (loads data from Google Sheets)
    logger.info('Initializing cache from Google Sheets...');
    await cacheService.initialize();

    // Start HTTP server
    startServer();

    logger.info('Product Agent is ready!');
  } catch (error) {
    logger.error('Failed to start Product Agent', { error });
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down...');
  cacheService.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down...');
  cacheService.stop();
  process.exit(0);
});

main();
