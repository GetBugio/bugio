/**
 * Registry Database - Global multi-tenant registry
 * Stores: tenants, coupons, coupon_redemptions
 * Used only in cloudhosted mode
 */
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { config } from '../config.js';

let registryDb: Database.Database | null = null;

const REGISTRY_SCHEMA = `
CREATE TABLE IF NOT EXISTS tenants (
  name TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'trial' CHECK(status IN ('trial', 'active', 'expired', 'cancelled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  trial_ends_at TEXT,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  activated_by TEXT
);

CREATE TABLE IF NOT EXISTS coupons (
  code TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('trial_extension', 'free_access', 'discount')),
  value INTEGER,
  stripe_coupon_id TEXT,
  max_uses INTEGER DEFAULT 1,
  times_used INTEGER DEFAULT 0,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  coupon_code TEXT NOT NULL REFERENCES coupons(code) ON DELETE CASCADE,
  tenant_name TEXT NOT NULL,
  redeemed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);
CREATE INDEX IF NOT EXISTS idx_redemptions_tenant ON coupon_redemptions(tenant_name);
CREATE INDEX IF NOT EXISTS idx_redemptions_coupon ON coupon_redemptions(coupon_code);
`;

export function initRegistry(): Database.Database {
  if (registryDb) return registryDb;

  const registryDir = path.join(config.dataDir, '_registry');
  if (!fs.existsSync(registryDir)) {
    fs.mkdirSync(registryDir, { recursive: true });
  }

  const dbPath = path.join(registryDir, 'registry.db');
  registryDb = new Database(dbPath);
  registryDb.pragma('foreign_keys = ON');
  registryDb.pragma('journal_mode = WAL');
  registryDb.exec(REGISTRY_SCHEMA);

  return registryDb;
}

export function getRegistry(): Database.Database {
  if (!registryDb) {
    return initRegistry();
  }
  return registryDb;
}

// ─── Tenant Functions ────────────────────────────────────────────────────────

export interface TenantRecord {
  name: string;
  status: 'trial' | 'active' | 'expired' | 'cancelled';
  created_at: string;
  trial_ends_at: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  activated_by: string | null;
}

export function registerTenant(name: string): TenantRecord {
  const db = getRegistry();

  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + config.trialDays);

  db.prepare(`
    INSERT INTO tenants (name, status, trial_ends_at)
    VALUES (?, 'trial', ?)
  `).run(name, trialEndsAt.toISOString());

  return getTenantRecord(name)!;
}

export function getTenantRecord(name: string): TenantRecord | null {
  const db = getRegistry();
  const record = db.prepare('SELECT * FROM tenants WHERE name = ?').get(name) as TenantRecord | undefined;

  if (!record) return null;

  // Auto-expire trial if it has ended
  if (record.status === 'trial' && record.trial_ends_at) {
    const trialEnd = new Date(record.trial_ends_at);
    if (trialEnd < new Date()) {
      db.prepare("UPDATE tenants SET status = 'expired' WHERE name = ?").run(name);
      record.status = 'expired';
    }
  }

  return record;
}

export function tenantExists(name: string): boolean {
  const db = getRegistry();
  const result = db.prepare('SELECT name FROM tenants WHERE name = ?').get(name);
  return !!result;
}

export function tenantNameAvailable(name: string): boolean {
  return !tenantExists(name);
}

export function updateTenantStatus(name: string, status: TenantRecord['status'], trialEndsAt?: string): void {
  const db = getRegistry();
  if (trialEndsAt) {
    db.prepare('UPDATE tenants SET status = ?, trial_ends_at = ? WHERE name = ?').run(status, trialEndsAt, name);
  } else {
    db.prepare('UPDATE tenants SET status = ? WHERE name = ?').run(status, name);
  }
}

export function updateTenantStripe(name: string, customerId: string, subscriptionId: string): void {
  const db = getRegistry();
  db.prepare(`
    UPDATE tenants
    SET stripe_customer_id = ?, stripe_subscription_id = ?, status = 'active', activated_by = 'stripe'
    WHERE name = ?
  `).run(customerId, subscriptionId, name);
}

export function updateTenantStripeById(customerId: string, subscriptionId: string): void {
  const db = getRegistry();
  db.prepare(`
    UPDATE tenants
    SET stripe_subscription_id = ?, status = 'active', activated_by = 'stripe'
    WHERE stripe_customer_id = ?
  `).run(subscriptionId, customerId);
}

export function getTenantByStripeSubscription(subscriptionId: string): TenantRecord | null {
  const db = getRegistry();
  return db.prepare('SELECT * FROM tenants WHERE stripe_subscription_id = ?').get(subscriptionId) as TenantRecord | null;
}

export function getTenantByStripeCustomer(customerId: string): TenantRecord | null {
  const db = getRegistry();
  return db.prepare('SELECT * FROM tenants WHERE stripe_customer_id = ?').get(customerId) as TenantRecord | null;
}

export function listTenants(): TenantRecord[] {
  const db = getRegistry();
  return db.prepare('SELECT * FROM tenants ORDER BY created_at DESC').all() as TenantRecord[];
}

export function deleteTenant(name: string): boolean {
  const db = getRegistry();
  const result = db.prepare('DELETE FROM tenants WHERE name = ?').run(name);
  return result.changes > 0;
}

export function getTenantStats(): { total: number; trial: number; active: number; expired: number; cancelled: number } {
  const db = getRegistry();
  const rows = db.prepare("SELECT status, COUNT(*) as count FROM tenants GROUP BY status").all() as { status: string; count: number }[];
  const stats = { total: 0, trial: 0, active: 0, expired: 0, cancelled: 0 };
  for (const row of rows) {
    stats.total += row.count;
    if (row.status in stats) (stats as Record<string, number>)[row.status] = row.count;
  }
  return stats;
}

// ─── Coupon Functions ────────────────────────────────────────────────────────

export interface CouponRecord {
  code: string;
  type: 'trial_extension' | 'free_access' | 'discount';
  value: number | null;
  stripe_coupon_id: string | null;
  max_uses: number;
  times_used: number;
  expires_at: string | null;
  created_at: string;
}

export interface CouponWithRedemptions extends CouponRecord {
  redemptions: Array<{ tenant_name: string; redeemed_at: string }>;
}

export function createCoupon(data: {
  code?: string;
  type: CouponRecord['type'];
  value?: number;
  stripeCouponId?: string;
  maxUses?: number;
  expiresAt?: string;
}): CouponRecord {
  const db = getRegistry();
  const code = data.code || generateCouponCode();

  db.prepare(`
    INSERT INTO coupons (code, type, value, stripe_coupon_id, max_uses, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(code, data.type, data.value ?? null, data.stripeCouponId ?? null, data.maxUses ?? 1, data.expiresAt ?? null);

  return db.prepare('SELECT * FROM coupons WHERE code = ?').get(code) as CouponRecord;
}

export function listCoupons(): CouponWithRedemptions[] {
  const db = getRegistry();
  const coupons = db.prepare('SELECT * FROM coupons ORDER BY created_at DESC').all() as CouponRecord[];

  return coupons.map(coupon => {
    const redemptions = db.prepare(
      'SELECT tenant_name, redeemed_at FROM coupon_redemptions WHERE coupon_code = ? ORDER BY redeemed_at DESC'
    ).all(coupon.code) as { tenant_name: string; redeemed_at: string }[];
    return { ...coupon, redemptions };
  });
}

export function deleteCoupon(code: string): boolean {
  const db = getRegistry();
  const result = db.prepare('DELETE FROM coupons WHERE code = ?').run(code);
  return result.changes > 0;
}

export function redeemCoupon(code: string, tenantName: string): {
  success: boolean;
  type?: CouponRecord['type'];
  error?: string;
  stripeCouponId?: string;
} {
  const db = getRegistry();

  const coupon = db.prepare('SELECT * FROM coupons WHERE code = ?').get(code.toUpperCase()) as CouponRecord | undefined;

  if (!coupon) return { success: false, error: 'Coupon not found' };

  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
    return { success: false, error: 'Coupon has expired' };
  }

  if (coupon.max_uses > 0 && coupon.times_used >= coupon.max_uses) {
    return { success: false, error: 'Coupon has reached its usage limit' };
  }

  const alreadyRedeemed = db.prepare(
    'SELECT id FROM coupon_redemptions WHERE coupon_code = ? AND tenant_name = ?'
  ).get(code.toUpperCase(), tenantName);

  if (alreadyRedeemed) return { success: false, error: 'Coupon already redeemed' };

  // Apply the coupon
  const txn = db.transaction(() => {
    db.prepare('UPDATE coupons SET times_used = times_used + 1 WHERE code = ?').run(code.toUpperCase());
    db.prepare('INSERT INTO coupon_redemptions (coupon_code, tenant_name) VALUES (?, ?)').run(code.toUpperCase(), tenantName);

    if (coupon.type === 'trial_extension' && coupon.value) {
      const tenant = getTenantRecord(tenantName);
      if (tenant) {
        const currentEnd = tenant.trial_ends_at ? new Date(tenant.trial_ends_at) : new Date();
        const newEnd = new Date(currentEnd);
        newEnd.setDate(newEnd.getDate() + coupon.value);
        db.prepare("UPDATE tenants SET trial_ends_at = ?, status = 'trial' WHERE name = ?").run(newEnd.toISOString(), tenantName);
      }
    } else if (coupon.type === 'free_access') {
      db.prepare("UPDATE tenants SET status = 'active', activated_by = 'coupon' WHERE name = ?").run(tenantName);
    }
  });

  txn();

  return { success: true, type: coupon.type, stripeCouponId: coupon.stripe_coupon_id ?? undefined };
}

export function getDiscountCouponForTenant(tenantName: string): string | null {
  const db = getRegistry();
  const result = db.prepare(`
    SELECT c.stripe_coupon_id
    FROM coupon_redemptions cr
    JOIN coupons c ON cr.coupon_code = c.code
    WHERE cr.tenant_name = ? AND c.type = 'discount' AND c.stripe_coupon_id IS NOT NULL
    ORDER BY cr.redeemed_at DESC
    LIMIT 1
  `).get(tenantName) as { stripe_coupon_id: string } | undefined;

  return result?.stripe_coupon_id ?? null;
}

// ─── Diagnostics ─────────────────────────────────────────────────────────────

export function diagnoseDataDir(): {
  dataDir: string;
  exists: boolean;
  writable: boolean;
  registryExists: boolean;
  tenants: Array<{ name: string; hasDir: boolean; hasDb: boolean }>;
} {
  const dataDir = config.dataDir;
  const exists = fs.existsSync(dataDir);
  const registryPath = path.join(dataDir, '_registry', 'registry.db');
  const registryExists = fs.existsSync(registryPath);

  let writable = false;
  if (exists) {
    try {
      const testFile = path.join(dataDir, '.write_test');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      writable = true;
    } catch {
      writable = false;
    }
  }

  const tenants = listTenants().map(t => ({
    name: t.name,
    hasDir: fs.existsSync(path.join(dataDir, t.name)),
    hasDb: fs.existsSync(path.join(dataDir, t.name, 'bugio.db')),
  }));

  return { dataDir, exists, writable, registryExists, tenants };
}

export function cleanupOrphanedTenants(): string[] {
  const tenants = listTenants();
  const orphaned: string[] = [];

  for (const tenant of tenants) {
    const hasDir = fs.existsSync(path.join(config.dataDir, tenant.name));
    if (!hasDir) {
      deleteTenant(tenant.name);
      orphaned.push(tenant.name);
    }
  }

  return orphaned;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateCouponCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}
