import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import path from 'path';
import { requireAdminAuth, createAdminSession, destroyAdminSession } from '../middleware/admin-auth.middleware.js';
import { config } from '../config.js';
import { tenantStorage, getDatabase, initDatabase as initTenantDb } from '../db/connection.js';
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
  tenantExists,
  getRegistry,
} from '../db/registry.js';
import type { CouponRecord } from '../db/registry.js';

const router = Router();

const VALID_STATUSES = ['trial', 'active', 'expired', 'cancelled'];

function isValidTenantName(name: string): boolean {
  return /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(name) && !name.includes('--');
}

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
    maxAge: 24 * 60 * 60 * 1000,
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

// GET /api/admin/status
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

// PATCH /api/admin/tenants/:name - Update tenant status
router.patch('/tenants/:name', requireAdminAuth, (req: Request, res: Response) => {
  const name = req.params.name as string;
  const { status, trialEndsAt } = req.body as { status?: string; trialEndsAt?: string };

  const tenant = getTenantRecord(name);
  if (!tenant) {
    res.status(404).json({ success: false, error: 'Tenant not found' });
    return;
  }

  if (status && !VALID_STATUSES.includes(status)) {
    res.status(400).json({ success: false, error: 'Invalid status' });
    return;
  }

  if (status) {
    updateTenantStatus(name, status as 'trial' | 'active' | 'expired' | 'cancelled', trialEndsAt);
  }

  res.json({ success: true, data: getTenantRecord(name) });
});

// DELETE /api/admin/tenants/:name
router.delete('/tenants/:name', requireAdminAuth, (req: Request, res: Response) => {
  const name = req.params.name as string;
  const deleted = deleteTenant(name);
  if (!deleted) {
    res.status(404).json({ success: false, error: 'Tenant not found' });
    return;
  }
  res.json({ success: true, message: `Tenant ${name} deleted` });
});

// POST /api/admin/provision - Create a new tenant (bypasses reserved names)
router.post('/provision', requireAdminAuth, async (req: Request, res: Response) => {
  const { name, adminEmail, adminPassword, status = 'active' } = req.body as {
    name?: string;
    adminEmail?: string;
    adminPassword?: string;
    status?: string;
  };

  if (!name || typeof name !== 'string') {
    res.status(400).json({ success: false, error: 'Tenant name is required' });
    return;
  }

  const lower = name.toLowerCase().trim();

  if (!isValidTenantName(lower)) {
    res.status(400).json({ success: false, error: 'Invalid name. Use lowercase letters, numbers, hyphens (3-32 chars).' });
    return;
  }

  if (tenantExists(lower)) {
    res.status(409).json({ success: false, error: `Tenant "${lower}" already exists` });
    return;
  }

  try {
    const db = getRegistry();
    const resolvedStatus = VALID_STATUSES.includes(status) ? status : 'active';
    const trialEndsAt = resolvedStatus === 'trial'
      ? new Date(Date.now() + config.trialDays * 86400000).toISOString()
      : null;

    db.prepare('INSERT INTO tenants (name, status, trial_ends_at) VALUES (?, ?, ?)').run(
      lower, resolvedStatus, trialEndsAt
    );

    // Initialize tenant DB
    const dbPath = path.join(config.dataDir, lower, 'bugio.db');
    tenantStorage.run(lower, () => {
      initTenantDb(dbPath);
    });

    // Create admin user if credentials provided
    if (adminEmail && adminPassword) {
      const hash = await bcrypt.hash(adminPassword, 10);
      tenantStorage.run(lower, () => {
        const tenantDb = getDatabase();
        tenantDb.prepare(
          'INSERT INTO users (email, password_hash, role, email_verified, email_verified_at) VALUES (?, ?, ?, 1, ?)'
        ).run(adminEmail, hash, 'admin', new Date().toISOString());
      });
    }

    const workspaceUrl = `https://${lower}.${config.baseDomain}`;
    res.status(201).json({ success: true, data: { name: lower, status: resolvedStatus, workspaceUrl } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Provision failed';
    res.status(500).json({ success: false, error: message });
  }
});

// POST /api/admin/tenants/:name/reset-password - Reset tenant admin password
router.post('/tenants/:name/reset-password', requireAdminAuth, async (req: Request, res: Response) => {
  const name = req.params.name as string;
  const { newPassword } = req.body as { newPassword?: string };

  if (!newPassword || newPassword.length < 6) {
    res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
    return;
  }

  if (!tenantExists(name)) {
    res.status(404).json({ success: false, error: 'Tenant not found' });
    return;
  }

  try {
    const hash = await bcrypt.hash(newPassword, 10);
    let adminEmail: string | null = null;

    tenantStorage.run(name, () => {
      const tenantDb = getDatabase();
      const admin = tenantDb.prepare("SELECT id, email FROM users WHERE role = 'admin' LIMIT 1").get() as { id: number; email: string } | undefined;
      if (admin) {
        tenantDb.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, admin.id);
        adminEmail = admin.email;
      }
    });

    if (!adminEmail) {
      res.status(404).json({ success: false, error: 'No admin user found in this tenant' });
      return;
    }

    res.json({ success: true, data: { adminEmail }, message: 'Password reset successfully' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Reset failed';
    res.status(500).json({ success: false, error: message });
  }
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
router.delete('/coupons/:code', requireAdminAuth, (req: Request, res: Response) => {
  const code = req.params.code as string;
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
