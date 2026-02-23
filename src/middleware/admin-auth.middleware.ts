import { Request, Response, NextFunction } from 'express';
import { config } from '../config.js';

// Simple session store for admin login (in-memory, single token)
const adminSessions = new Set<string>();

function generateSessionToken(): string {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function createAdminSession(): string {
  const token = generateSessionToken();
  adminSessions.add(token);
  return token;
}

export function destroyAdminSession(token: string): void {
  adminSessions.delete(token);
}

function getAdminToken(req: Request): string | undefined {
  // Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7);

  // Cookie
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const match = cookieHeader.match(/(?:^|;\s*)admin_session=([^;]+)/);
    if (match) return match[1];
  }

  return undefined;
}

// Require valid admin session OR admin token directly
export function requireAdminAuth(req: Request, res: Response, next: NextFunction): void {
  const token = getAdminToken(req);

  if (!token) {
    if (req.accepts('html')) {
      res.redirect('/admin/login');
    } else {
      res.status(401).json({ success: false, error: 'Admin authentication required' });
    }
    return;
  }

  // Check if it's the raw admin token
  if (config.adminToken && token === config.adminToken) {
    next();
    return;
  }

  // Check session tokens
  if (adminSessions.has(token)) {
    next();
    return;
  }

  if (req.accepts('html')) {
    res.redirect('/admin/login');
  } else {
    res.status(401).json({ success: false, error: 'Invalid admin token' });
  }
}
