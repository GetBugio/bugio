import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import routes from './routes/index.js';
import type { ApiResponse } from './types/index.js';

export function createApp() {
  const app = express();

  // Security middleware
  app.use(helmet());
  app.use(cors());

  // Rate limiting
  app.use(
    rateLimit({
      windowMs: config.rateLimit.windowMs,
      max: config.rateLimit.max,
      message: { success: false, error: 'Too many requests, please try again later' },
    })
  );

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // API routes
  app.use('/api', routes);

  // 404 handler
  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      error: 'Not found',
    } as ApiResponse);
  });

  // Error handler
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('Unhandled error:', err);

    res.status(500).json({
      success: false,
      error: config.isDev ? err.message : 'Internal server error',
    } as ApiResponse);
  });

  return app;
}
