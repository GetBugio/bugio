import { Router, Request, Response } from 'express';
import { authService } from '../services/auth.service.js';
import { validateBody, registerSchema, loginSchema, changePasswordSchema, changeEmailSchema } from '../middleware/validation.js';
import { authenticate } from '../middleware/auth.js';
import type { ApiResponse, SafeUser, RegisterRequest, LoginRequest } from '../types/index.js';

const router = Router();

// POST /api/auth/register
router.post(
  '/register',
  validateBody(registerSchema),
  async (req: Request<object, ApiResponse, RegisterRequest>, res: Response<ApiResponse>) => {
    try {
      const { user, token } = await authService.register(req.body);
      res.status(201).json({
        success: true,
        data: { user, token },
        message: 'Registration successful',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Registration failed';
      res.status(400).json({ success: false, error: message });
    }
  }
);

// POST /api/auth/login
router.post(
  '/login',
  validateBody(loginSchema),
  async (req: Request<object, ApiResponse, LoginRequest>, res: Response<ApiResponse>) => {
    try {
      const { user, token } = await authService.login(req.body);
      res.json({
        success: true,
        data: { user, token },
        message: 'Login successful',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Login failed';
      res.status(401).json({ success: false, error: message });
    }
  }
);

// GET /api/auth/me - Get current user
router.get('/me', authenticate, (req: Request, res: Response<ApiResponse<SafeUser | null>>) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const user = authService.getUserById(req.user.userId);
  if (!user) {
    res.status(404).json({ success: false, error: 'User not found' });
    return;
  }

  res.json({ success: true, data: user });
});

// POST /api/auth/change-password
router.post(
  '/change-password',
  authenticate,
  validateBody(changePasswordSchema),
  async (req: Request, res: Response<ApiResponse>) => {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }

    try {
      await authService.changePassword(req.user.userId, req.body.currentPassword, req.body.newPassword);
      res.json({ success: true, message: 'Password changed successfully' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to change password';
      res.status(400).json({ success: false, error: message });
    }
  }
);

// POST /api/auth/change-email
router.post(
  '/change-email',
  authenticate,
  validateBody(changeEmailSchema),
  async (req: Request, res: Response<ApiResponse>) => {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }

    try {
      const user = await authService.changeEmail(req.user.userId, req.body.password, req.body.newEmail);
      res.json({ success: true, data: user, message: 'Email changed successfully' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to change email';
      res.status(400).json({ success: false, error: message });
    }
  }
);

export default router;
