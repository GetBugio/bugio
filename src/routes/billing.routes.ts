import { Router, Request, Response } from 'express';
import { config } from '../config.js';
import {
  getTenantRecord,
  updateTenantStripe,
  updateTenantStripeById,
  getTenantByStripeSubscription,
  updateTenantStatus,
  getDiscountCouponForTenant,
} from '../db/registry.js';
import { tenantStorage } from '../db/connection.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

function getStripe() {
  if (!config.stripe.isConfigured) throw new Error('Stripe not configured');
  // Dynamic import to avoid loading stripe when not configured
  const Stripe = require('stripe');
  return new Stripe(config.stripe.secretKey, { apiVersion: '2023-10-16' });
}

// GET /api/billing/status
router.get('/status', (_req: Request, res: Response) => {
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
      status: tenant.status,
      trialEndsAt: tenant.trial_ends_at,
      trialDaysLeft,
      hasSubscription: !!tenant.stripe_subscription_id,
      stripeConfigured: config.stripe.isConfigured,
    },
  });
});

// POST /api/billing/checkout - Create Stripe Checkout session
router.post('/checkout', authenticate, async (req: Request, res: Response) => {
  if (!config.stripe.isConfigured) {
    res.status(400).json({ success: false, error: 'Stripe not configured' });
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

  try {
    const stripe = getStripe();
    const discountCoupon = getDiscountCouponForTenant(tenantName);
    const workspaceUrl = `https://${tenantName}.${config.baseDomain}`;

    const sessionParams: Record<string, unknown> = {
      mode: 'subscription',
      line_items: [{ price: config.stripe.priceId, quantity: 1 }],
      success_url: `${workspaceUrl}/settings?billing=success`,
      cancel_url: `${workspaceUrl}/settings?billing=cancel`,
      metadata: { tenant_name: tenantName },
      subscription_data: { metadata: { tenant_name: tenantName } },
      customer_email: req.user?.email,
    };

    if (tenant.stripe_customer_id) {
      sessionParams.customer = tenant.stripe_customer_id;
      delete sessionParams.customer_email;
    }

    if (discountCoupon) {
      sessionParams.discounts = [{ coupon: discountCoupon }];
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    res.json({ success: true, data: { url: session.url } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create checkout session';
    res.status(500).json({ success: false, error: message });
  }
});

// POST /api/billing/portal - Create Stripe Customer Portal session
router.post('/portal', authenticate, async (_req: Request, res: Response) => {
  if (!config.stripe.isConfigured) {
    res.status(400).json({ success: false, error: 'Stripe not configured' });
    return;
  }

  const tenantName = tenantStorage.getStore() || res.locals.tenant;
  if (!tenantName) {
    res.status(400).json({ success: false, error: 'No tenant context' });
    return;
  }

  const tenant = getTenantRecord(tenantName);
  if (!tenant?.stripe_customer_id) {
    res.status(400).json({ success: false, error: 'No active subscription found' });
    return;
  }

  try {
    const stripe = getStripe();
    const workspaceUrl = `https://${tenantName}.${config.baseDomain}`;
    const session = await stripe.billingPortal.sessions.create({
      customer: tenant.stripe_customer_id,
      return_url: `${workspaceUrl}/settings`,
    });
    res.json({ success: true, data: { url: session.url } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create portal session';
    res.status(500).json({ success: false, error: message });
  }
});

// POST /api/billing/webhook - Stripe webhook handler (raw body required)
router.post('/webhook', async (req: Request, res: Response) => {
  if (!config.stripe.isConfigured) {
    res.status(400).send('Stripe not configured');
    return;
  }

  const sig = req.headers['stripe-signature'] as string;
  if (!sig) {
    res.status(400).send('Missing stripe-signature header');
    return;
  }

  let event: { type: string; data: { object: Record<string, unknown> } };
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(req.body, sig, config.stripe.webhookSecret);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Webhook error';
    res.status(400).send(`Webhook Error: ${message}`);
    return;
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as { metadata?: { tenant_name?: string }; customer?: string; subscription?: string };
        const tenantName = session.metadata?.tenant_name;
        if (tenantName && session.customer && session.subscription) {
          updateTenantStripe(tenantName, session.customer as string, session.subscription as string);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as { id: string; customer: string; status: string };
        if (sub.status === 'active') {
          updateTenantStripeById(sub.customer, sub.id);
        } else if (['canceled', 'unpaid', 'past_due'].includes(sub.status)) {
          const tenant = getTenantByStripeSubscription(sub.id);
          if (tenant) {
            updateTenantStatus(tenant.name, 'expired');
          }
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as { id: string };
        const tenant = getTenantByStripeSubscription(sub.id);
        if (tenant) {
          updateTenantStatus(tenant.name, 'cancelled');
        }
        break;
      }
    }

    res.json({ received: true });
  } catch (error) {
    console.error('[Webhook] Error processing event:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

export default router;
