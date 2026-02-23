import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import apiRoutes from './routes/index.js';
import frontendRoutes from './routes/frontend.routes.js';
import registrationRoutes from './routes/registration.routes.js';
import adminPlatformRoutes from './routes/admin-platform.routes.js';
import { tenantMiddleware } from './middleware/tenant.middleware.js';
import { trialGuard } from './middleware/trial-guard.middleware.js';
import { requireAdminAuth } from './middleware/admin-auth.middleware.js';
import { tenantStorage } from './db/connection.js';
import { getT, parseLangFromCookie } from './services/i18n.service.js';
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
        let token = req.headers.authorization?.startsWith('Bearer ')
          ? req.headers.authorization.substring(7)
          : undefined;
        if (!token && req.headers.cookie) {
          const match = req.headers.cookie.match(/(?:^|;\s*)token=([^;]+)/);
          if (match) token = match[1];
        }
        if (!token) return false;
        try {
          jwt.verify(token, config.sessionSecret);
          return true;
        } catch {
          return false;
        }
      },
    })
  );

  // Stripe webhook needs raw body - mount before json parser
  app.use('/api/billing/webhook', express.raw({ type: 'application/json' }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Static files
  const projectRoot = process.cwd();
  app.use(express.static(path.join(projectRoot, 'public')));

  // View engine setup
  app.set('view engine', 'ejs');
  app.set('views', path.join(projectRoot, 'src', 'views'));

  if (config.isCloudhosted) {
    // ─── Cloudhosted: Hostname-based routing ───────────────────────────────────

    // Build admin sub-router: handles admin.getbugio.com
    const adminSubRouter = express.Router();
    adminSubRouter.get('/login', (req, res) => {
      const lang = parseLangFromCookie(req.headers.cookie);
      const t = getT(lang);
      res.render('platform-admin', { t, lang, config, page: 'login', authenticated: false });
    });
    // Admin API routes (POST /login, GET /stats, etc.) - no /api/ prefix needed for admin subdomain
    adminSubRouter.use('/api', adminPlatformRoutes);
    // Dashboard and all other authenticated routes
    adminSubRouter.use('/', requireAdminAuth, (req, res, next) => {
      const lang = parseLangFromCookie(req.headers.cookie);
      const t = getT(lang);
      // GET / → dashboard
      if (req.method === 'GET') {
        return res.render('platform-admin', { t, lang, config, page: 'dashboard', authenticated: true });
      }
      next();
    });

    // Build tenant sub-router: handles {tenant}.getbugio.com
    const tenantSubRouter = express.Router();
    tenantSubRouter.use('/api', apiRoutes);
    tenantSubRouter.use('/', frontendRoutes);

    // Minimal router for the base domain: registration API only (LP is served by web_bugio)
    const baseRouter = express.Router();
    baseRouter.use('/api/register', registrationRoutes);
    baseRouter.use('/api/health', (_req, res) => res.json({ success: true, data: { status: 'healthy', mode: config.mode } }));
    baseRouter.use('/', (_req, res) => res.status(404).json({ success: false, error: 'Not found' }));

    app.use((req, res, next) => {
      const host = req.hostname.split(':')[0];
      const base = config.baseDomain;

      // Base domain: getbugio.com or www.getbugio.com → registration API only
      if (host === base || host === `www.${base}`) {
        return baseRouter(req, res, next);
      }

      // admin.getbugio.com
      if (host === `admin.${base}`) {
        return adminSubRouter(req, res, next);
      }

      // {tenant}.getbugio.com - wrap in tenant context + trial guard
      return tenantMiddleware(req, res, () => {
        trialGuard(req, res, () => {
          tenantSubRouter(req, res, next);
        });
      });
    });

  } else {
    // ─── Selfhosted: Single-tenant mode ────────────────────────────────────────

    // Wrap all requests in default tenant context
    app.use((_req, _res, next) => {
      tenantStorage.run(config.defaultTenant, next);
    });

    // API routes
    app.use('/api', apiRoutes);

    // Frontend routes
    app.use('/', frontendRoutes);
  }

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
