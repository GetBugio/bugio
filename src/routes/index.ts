import { Router } from 'express';
import authRoutes from './auth.routes.js';
import ticketRoutes from './ticket.routes.js';
import settingsRoutes from './settings.routes.js';

const router = Router();

// Mount routes
router.use('/auth', authRoutes);
router.use('/tickets', ticketRoutes);
router.use('/settings', settingsRoutes);

// Health check endpoint
router.get('/health', (_req, res) => {
  res.json({
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
    },
  });
});

export default router;
