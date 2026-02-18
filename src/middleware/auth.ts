import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import type { JWTPayload, ApiResponse } from '../types/index.js';

// In-memory store for anonymous ticket rate limiting
// Key: IP address, Value: { count, resetTime }
const anonymousTicketStore = new Map<string, { count: number; resetTime: number }>();

// Clean up expired entries periodically (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of anonymousTicketStore) {
    if (now > data.resetTime) {
      anonymousTicketStore.delete(ip);
    }
  }
}, 5 * 60 * 1000);

// Export for testing purposes
export function clearAnonymousTicketStore(): void {
  anonymousTicketStore.clear();
}

export function getAnonymousTicketCount(ip: string): number {
  const data = anonymousTicketStore.get(ip);
  if (!data || Date.now() > data.resetTime) {
    return 0;
  }
  return data.count;
}

// Authenticate JWT token (required)
export function authenticate(req: Request, res: Response<ApiResponse>, next: NextFunction): void {
  let token: string | undefined;

  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else {
    // Fallback: read token from cookie (sent automatically with credentials: 'same-origin')
    const cookieHeader = req.headers.cookie;
    if (cookieHeader) {
      const match = cookieHeader.match(/(?:^|;\s*)token=([^;]+)/);
      if (match) token = match[1];
    }
  }

  if (!token) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return;
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret) as JWTPayload;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
}

// Optional authentication (sets req.user if token is valid, but doesn't fail if missing)
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      const payload = jwt.verify(token, config.jwtSecret) as JWTPayload;
      req.user = payload;
    } catch {
      // Invalid token, but that's okay for optional auth
    }
  }

  next();
}

// Require admin role
export function requireAdmin(req: Request, res: Response<ApiResponse>, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return;
  }

  if (req.user.role !== 'admin') {
    res.status(403).json({ success: false, error: 'Admin access required' });
    return;
  }

  next();
}

// Generate JWT token
export function generateToken(payload: JWTPayload): string {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn as string,
  } as jwt.SignOptions);
}

// Rate limit anonymous ticket creation
// Only applies to unauthenticated users creating tickets
export function anonymousTicketRateLimit(req: Request, res: Response<ApiResponse>, next: NextFunction): void {
  // Skip rate limiting for authenticated users
  if (req.user) {
    next();
    return;
  }

  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const windowMs = config.rateLimit.windowMs;
  const maxTickets = config.rateLimit.anonymousTicketMax;

  const data = anonymousTicketStore.get(ip);

  if (!data || now > data.resetTime) {
    // First request or window expired, start fresh
    anonymousTicketStore.set(ip, { count: 1, resetTime: now + windowMs });
    next();
    return;
  }

  if (data.count >= maxTickets) {
    const retryAfterSeconds = Math.ceil((data.resetTime - now) / 1000);
    res.setHeader('Retry-After', retryAfterSeconds.toString());
    res.status(429).json({
      success: false,
      error: `Too many anonymous ticket submissions. Please try again in ${Math.ceil(retryAfterSeconds / 60)} minutes or log in to create more tickets.`,
    });
    return;
  }

  // Increment count
  data.count++;
  next();
}
