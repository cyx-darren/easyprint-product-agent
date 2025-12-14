import express from 'express';
import { router } from './api/routes.js';
import { errorMiddleware } from './api/middleware/error.js';
import { config } from './utils/config.js';
import { logger } from './utils/logger.js';

export function createServer() {
  const app = express();

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Request logging
  app.use((req, _res, next) => {
    logger.info('Incoming request', {
      method: req.method,
      path: req.path,
      body: req.body,
    });
    next();
  });

  // Routes
  app.use(router);

  // 404 handler
  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'The requested endpoint does not exist',
      },
    });
  });

  // Error handler
  app.use(errorMiddleware);

  return app;
}

export function startServer() {
  const app = createServer();

  app.listen(config.port, () => {
    logger.info(`Server started on port ${config.port}`, {
      env: config.nodeEnv,
      port: config.port,
    });
  });

  return app;
}
