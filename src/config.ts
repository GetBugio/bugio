import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
  // Server
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: process.env.NODE_ENV !== 'production',

  // Deployment Mode
  mode: (process.env.MODE || 'selfhosted') as 'selfhosted' | 'cloudhosted',
  isCloudhosted: process.env.MODE === 'cloudhosted',

  // JWT
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',

  // Database (selfhosted: single DB path)
  databasePath: process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'bugio.db'),

  // Data directory (cloudhosted: per-tenant DBs live here)
  dataDir: process.env.DATA_DIR || path.join(process.cwd(), 'data'),

  // Cloudhosted: multi-tenancy
  baseDomain: process.env.BASE_DOMAIN || 'getbugio.com',
  defaultTenant: process.env.DEFAULT_TENANT || 'default',
  allowAutoProvision: process.env.ALLOW_AUTO_PROVISION === 'true',
  adminToken: process.env.ADMIN_TOKEN || '',

  // Reserved tenant names (cannot be registered)
  reservedTenants: ['www', 'admin', 'docs', 'api', 'app', 'mail', 'smtp', 'ftp', 'dev', 'staging', 'test', 'demo', 'bugio', 'default'],

  // Trial
  trialDays: 14,

  // Stripe
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    priceId: process.env.STRIPE_PRICE_ID || '',
    isConfigured: !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID),
  },

  // SMTP
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'noreply@bugio.local',
  },

  // Admin
  adminEmail: process.env.ADMIN_EMAIL || 'admin@bugio.local',

  // Rate limiting
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    anonymousTicketMax: 5, // limit anonymous ticket creation
  },

  // Pagination defaults
  pagination: {
    defaultLimit: 20,
    maxLimit: 100,
  },
} as const;

export type Config = typeof config;
