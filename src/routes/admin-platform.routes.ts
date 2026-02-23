import { Router, Request, Response } from 'express';
import { requireAdminAuth, createAdminSession, destroyAdminSession } from '../middleware/admin-auth.middleware.js';
import { config } from '../config.js';
import {
  listTenants,
  getTenantRecord,
  updateTenantStatus,
  deleteTenant,
  getTenantStats,
  listCoupons,
  createCoupon,
  deleteCoupon,
  diagnoseDataDir,
  cleanupOrphanedTenants,
} from '../db/registry.js';
import type { CouponRecord } from '../db/registry.js';

const router = Router();

// POST /api/admin/login
router.post('/login', (req: Request, res: Response) => {
  const { token } = req.body as { token?: string };
  if (!token || token !== config.adminToken) {
    res.status(401).json({ success: false, error: 'Invalid admin token' });
    return;
  }

  const sessionToken = createAdminSession();
  res.cookie('admin_session', sessionToken, {
    httpOnly: true,
    secure: !config.isDev,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000, // 24h
  });
  res.json({ success: true, message: 'Logged in' });
});

// POST /api/admin/logout
router.post('/logout', requireAdminAuth, (req: Request, res: Response) => {
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const match = cookieHeader.match(/(?:^|;\s*)admin_session=([^;]+)/);
    if (match) destroyAdminSession(match[1]);
  }
  res.clearCookie('admin_session');
  res.json({ success: true, message: 'Logged out' });
});

// GET /api/admin/status - Check if authenticated
router.get('/status', requireAdminAuth, (_req: Request, res: Response) => {
  res.json({ success: true, authenticated: true });
});

// GET /api/admin/stats
router.get('/stats', requireAdminAuth, (_req: Request, res: Response) => {
  const stats = getTenantStats();
  res.json({ success: true, data: stats });
});

// GET /api/admin/tenants
router.get('/tenants', requireAdminAuth, (_req: Request, res: Response) => {
  const tenants = listTenants();
  res.json({ success: true, data: tenants });
});

// PATCH /api/admin/tenants/:name
router.patch('/tenants/:name', requireAdminAuth, (req: Request<{ name: string }>, res: Response) => {
  const { name } = req.params;
  const { status, trialEndsAt } = req.body as { status?: string; trialEndsAt?: string };

  const tenant = getTenantRecord(name);
  if (!tenant) {
    res.status(404).json({ success: false, error: 'Tenant not found' });
    return;
  }

  const validStatuses = ['trial', 'active', 'expired', 'cancelled'];
  if (status && !validStatuses.includes(status)) {
    res.status(400).json({ success: false, error: 'Invalid status' });
    return;
  }

  if (status) {
    updateTenantStatus(name, status as 'trial' | 'active' | 'expired' | 'cancelled', trialEndsAt);
  }

  res.json({ success: true, data: getTenantRecord(name) });
});

// DELETE /api/admin/tenants/:name
router.delete('/tenants/:name', requireAdminAuth, (req: Request<{ name: string }>, res: Response) => {
  const { name } = req.params;
  const deleted = deleteTenant(name);
  if (!deleted) {
    res.status(404).json({ success: false, error: 'Tenant not found' });
    return;
  }
  res.json({ success: true, message: `Tenant ${name} deleted` });
});

// GET /api/admin/coupons
router.get('/coupons', requireAdminAuth, (_req: Request, res: Response) => {
  const coupons = listCoupons();
  res.json({ success: true, data: coupons });
});

// POST /api/admin/coupons
router.post('/coupons', requireAdminAuth, (req: Request, res: Response) => {
  const { code, type, value, maxUses, expiresAt, stripeCouponId } = req.body as {
    code?: string;
    type?: CouponRecord['type'];
    value?: number;
    maxUses?: number;
    expiresAt?: string;
    stripeCouponId?: string;
  };

  if (!type || !['trial_extension', 'free_access', 'discount'].includes(type)) {
    res.status(400).json({ success: false, error: 'Invalid coupon type' });
    return;
  }

  try {
    const coupon = createCoupon({ code, type, value, maxUses, expiresAt, stripeCouponId });
    res.status(201).json({ success: true, data: coupon });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create coupon';
    res.status(400).json({ success: false, error: message });
  }
});

// DELETE /api/admin/coupons/:code
router.delete('/coupons/:code', requireAdminAuth, (req: Request<{ code: string }>, res: Response) => {
  const { code } = req.params;
  const deleted = deleteCoupon(code);
  if (!deleted) {
    res.status(404).json({ success: false, error: 'Coupon not found' });
    return;
  }
  res.json({ success: true, message: `Coupon ${code} deleted` });
});

// GET /api/admin/diagnose
router.get('/diagnose', requireAdminAuth, (_req: Request, res: Response) => {
  const result = diagnoseDataDir();
  res.json({ success: true, data: result });
});

// POST /api/admin/cleanup
router.post('/cleanup', requireAdminAuth, (_req: Request, res: Response) => {
  const orphaned = cleanupOrphanedTenants();
  res.json({ success: true, data: { orphaned, count: orphaned.length } });
});

export default router;
