import { Router, Request, Response } from 'express';
import { config } from '../config.js';
import { getTenantRecord, redeemCoupon } from '../db/registry.js';
import { tenantStorage } from '../db/connection.js';

const router = Router();

// GET /api/tenant/status - Get current tenant status (trial info, etc.)
router.get('/status', (_req: Request, res: Response) => {
  if (!config.isCloudhosted) {
    res.json({ success: true, data: { mode: 'selfhosted' } });
    return;
  }

  const tenantName = tenantStorage.getStore() || res.locals.tenant;
  if (!tenantName) {
    res.status(400).json({ success: false, error: 'No tenant context' });
    return;
  }

  const tenant = getTenantRecord(tenantName);
  if (!tenant) {
    res.status(404).json({ success: false, error: 'Tenant not found' });
    return;
  }

  let trialDaysLeft: number | null = null;
  if (tenant.status === 'trial' && tenant.trial_ends_at) {
    const diff = new Date(tenant.trial_ends_at).getTime() - Date.now();
    trialDaysLeft = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }

  res.json({
    success: true,
    data: {
      name: tenant.name,
      status: tenant.status,
      trialEndsAt: tenant.trial_ends_at,
      trialDaysLeft,
      hasStripe: !!tenant.stripe_customer_id,
      workspaceUrl: `https://${tenantName}.${config.baseDomain}`,
    },
  });
});

// POST /api/tenant/redeem - Redeem a coupon for the current tenant
router.post('/redeem', (req: Request, res: Response) => {
  if (!config.isCloudhosted) {
    res.status(400).json({ success: false, error: 'Coupons only available in cloud mode' });
    return;
  }

  const tenantName = tenantStorage.getStore() || res.locals.tenant;
  if (!tenantName) {
    res.status(400).json({ success: false, error: 'No tenant context' });
    return;
  }

  const { code } = req.body as { code?: string };
  if (!code) {
    res.status(400).json({ success: false, error: 'Coupon code is required' });
    return;
  }

  const result = redeemCoupon(code.toUpperCase(), tenantName);

  if (!result.success) {
    res.status(400).json({ success: false, error: result.error });
    return;
  }

  const tenant = getTenantRecord(tenantName);
  res.json({
    success: true,
    data: {
      type: result.type,
      newStatus: tenant?.status,
      trialEndsAt: tenant?.trial_ends_at,
    },
    message: 'Coupon redeemed successfully',
  });
});

export default router;
