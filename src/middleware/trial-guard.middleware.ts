import { Request, Response, NextFunction } from 'express';
import { config } from '../config.js';

// Paths that are always allowed even when trial has expired
const ALLOWED_PATHS = [
  '/api/auth/',
  '/api/tenant/',
  '/api/billing/',
  '/login',
  '/register',
];

// Trial guard: blocks mutating requests when tenant trial has expired
export function trialGuard(req: Request, res: Response, next: NextFunction): void {
  if (!config.isCloudhosted) {
    next();
    return;
  }

  // Allow read-only requests
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    next();
    return;
  }

  // Allow whitelisted paths
  const isAllowed = ALLOWED_PATHS.some(p => req.path.startsWith(p));
  if (isAllowed) {
    next();
    return;
  }

  if (res.locals.tenantExpired) {
    res.status(403).json({ success: false, error: 'trial_expired', message: 'Your trial has ended. Please upgrade to continue.' });
    return;
  }

  next();
}
