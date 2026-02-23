import { Router, Request, Response } from 'express';
import { config } from '../config.js';
import {
  tenantExists,
  tenantNameAvailable,
  registerTenant,
  redeemCoupon,
} from '../db/registry.js';
import { initDatabase as initTenantDb } from '../db/connection.js';
import { tenantStorage } from '../db/connection.js';
import path from 'path';

const router = Router();

// Validate tenant name format
function isValidTenantName(name: string): boolean {
  return /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(name) && !name.includes('--');
}

// GET /api/register/check/:name - Check if a workspace name is available
router.get('/check/:name', (req: Request<{ name: string }>, res: Response) => {
  const { name } = req.params;
  const lower = name.toLowerCase();

  if (!isValidTenantName(lower)) {
    res.json({ available: false, reason: 'invalid_format' });
    return;
  }

  if ((config.reservedTenants as readonly string[]).includes(lower)) {
    res.json({ available: false, reason: 'reserved' });
    return;
  }

  const available = tenantNameAvailable(lower);
  res.json({ available, reason: available ? null : 'taken' });
});

// POST /api/register - Register a new tenant workspace
router.post('/', async (req: Request, res: Response) => {
  const { name, coupon } = req.body as { name?: string; coupon?: string };

  if (!name) {
    res.status(400).json({ success: false, error: 'Workspace name is required' });
    return;
  }

  const lower = name.toLowerCase();

  if (!isValidTenantName(lower)) {
    res.status(400).json({ success: false, error: 'Invalid workspace name. Use only lowercase letters, numbers, and hyphens (3-32 chars).' });
    return;
  }

  if ((config.reservedTenants as readonly string[]).includes(lower)) {
    res.status(400).json({ success: false, error: 'This workspace name is reserved.' });
    return;
  }

  if (tenantExists(lower)) {
    res.status(409).json({ success: false, error: 'This workspace name is already taken.' });
    return;
  }

  try {
    const tenant = registerTenant(lower);

    // Initialize the tenant's DB (create directory + tables)
    const dbPath = path.join(config.dataDir, lower, 'bugio.db');
    tenantStorage.run(lower, () => {
      initTenantDb(dbPath);
    });

    // Apply coupon if provided
    let couponApplied = false;
    if (coupon) {
      const result = redeemCoupon(coupon.toUpperCase(), lower);
      couponApplied = result.success;
    }

    const workspaceUrl = `https://${lower}.${config.baseDomain}`;

    res.status(201).json({
      success: true,
      data: {
        name: lower,
        status: tenant.status,
        trialEndsAt: tenant.trial_ends_at,
        workspaceUrl,
        couponApplied,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Registration failed';
    res.status(500).json({ success: false, error: message });
  }
});

export default router;
