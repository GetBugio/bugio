import { Request, Response, NextFunction } from 'express';
import { config } from '../config.js';
import { tenantStorage } from '../db/connection.js';
import { getTenantRecord, registerTenant } from '../db/registry.js';

// Extract subdomain from hostname, returns null if it's the base domain or www
function extractSubdomain(hostname: string): string | null {
  const base = config.baseDomain;

  // Remove port if present
  const host = hostname.split(':')[0];

  if (host === base || host === `www.${base}`) return null;

  if (host.endsWith(`.${base}`)) {
    const sub = host.slice(0, host.length - base.length - 1);
    if (sub === 'www') return null;
    return sub;
  }

  return null;
}

// Validate tenant name format
function isValidTenantName(name: string): boolean {
  return /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(name) && !name.includes('--');
}

// Middleware: resolve tenant from hostname and set tenantStorage context
export function tenantMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!config.isCloudhosted) {
    // Selfhosted: use default tenant
    tenantStorage.run(config.defaultTenant, next);
    return;
  }

  const subdomain = extractSubdomain(req.hostname);

  // No subdomain → landing / docs / admin routes (handled separately in app.ts)
  if (!subdomain) {
    next();
    return;
  }

  // Reserved subdomains are handled by dedicated routers
  if (['admin', 'docs'].includes(subdomain)) {
    next();
    return;
  }

  if (!isValidTenantName(subdomain)) {
    res.status(400).send('Invalid workspace name');
    return;
  }

  const tenant = getTenantRecord(subdomain);

  if (!tenant) {
    if (config.allowAutoProvision) {
      try {
        registerTenant(subdomain);
      } catch {
        res.status(404).send('Workspace not found');
        return;
      }
    } else {
      res.status(404).render('error', { message: 'Workspace not found', code: 404 });
      return;
    }
  }

  // Expose tenant info to res.locals for views
  res.locals.tenant = subdomain;
  res.locals.tenantRecord = tenant;
  res.locals.tenantExpired = tenant?.status === 'expired';
  res.locals.tenantTrial = tenant?.status === 'trial';
  res.locals.tenantActive = tenant?.status === 'active';

  // Run within tenant storage context
  tenantStorage.run(subdomain, next);
}
