import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import type { JWTPayload, ApiResponse } from '../types/index.js';

// Authenticate JWT token (required)
export function authenticate(req: Request, res: Response<ApiResponse>, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return;
  }

  const token = authHeader.substring(7);

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
