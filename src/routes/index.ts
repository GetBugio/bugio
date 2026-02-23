import { Router } from 'express';
import authRoutes from './auth.routes.js';
import ticketRoutes from './ticket.routes.js';
import settingsRoutes from './settings.routes.js';
import registrationRoutes from './registration.routes.js';
import tenantStatusRoutes from './tenant-status.routes.js';
import billingRoutes from './billing.routes.js';
import adminPlatformRoutes from './admin-platform.routes.js';
import { config } from '../config.js';

const router = Router();

// Mount core routes (always available)
router.use('/auth', authRoutes);
router.use('/tickets', ticketRoutes);
router.use('/settings', settingsRoutes);

// Mount cloudhosted-only routes
if (config.isCloudhosted) {
  router.use('/register', registrationRoutes);
  router.use('/tenant', tenantStatusRoutes);
  router.use('/billing', billingRoutes);
  router.use('/admin', adminPlatformRoutes);
}

// Health check endpoint
router.get('/health', (_req, res) => {
  res.json({
    success: true,
    data: {
      status: 'healthy',
      mode: config.mode,
      timestamp: new Date().toISOString(),
    },
  });
});

export default router;
