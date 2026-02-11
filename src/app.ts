import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import routes from './routes/index.js';
import frontendRoutes from './routes/frontend.routes.js';
import type { ApiResponse } from './types/index.js';

export function createApp() {
  const app = express();

  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
  }));
  app.use(cors());

  // Rate limiting (only for unauthenticated users)
  app.use(
    rateLimit({
      windowMs: config.rateLimit.windowMs,
      max: config.rateLimit.max,
      message: { success: false, error: 'Too many requests, please try again later' },
      skip: (req) => {
        // Check Authorization header
        let token = req.headers.authorization?.startsWith('Bearer ')
          ? req.headers.authorization.substring(7)
          : undefined;
        // Check cookie (no cookie-parser needed)
        if (!token && req.headers.cookie) {
          const match = req.headers.cookie.match(/(?:^|;\s*)token=([^;]+)/);
          if (match) token = match[1];
        }
        if (!token) return false;
        try {
          jwt.verify(token, config.jwtSecret);
          return true;
        } catch {
          return false;
        }
      },
    })
  );

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Static files - use process.cwd() for base path
  const projectRoot = process.cwd();
  app.use(express.static(path.join(projectRoot, 'public')));

  // View engine setup - views are in src/views but compiled to dist/views
  app.set('view engine', 'ejs');
  app.set('views', path.join(projectRoot, 'src', 'views'));

  // API routes
  app.use('/api', routes);

  // Frontend routes
  app.use('/', frontendRoutes);

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
