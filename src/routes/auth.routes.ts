import { Router, Request, Response } from 'express';
import { authService } from '../services/auth.service.js';
import { validateBody, registerSchema, loginSchema, changePasswordSchema, changeEmailSchema } from '../middleware/validation.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import type { ApiResponse, SafeUser, RegisterRequest, LoginRequest } from '../types/index.js';

const router = Router();

// POST /api/auth/register
router.post(
  '/register',
  validateBody(registerSchema),
  async (req: Request<object, ApiResponse, RegisterRequest>, res: Response<ApiResponse>) => {
    try {
      const { user, token, requiresVerification } = await authService.register(req.body);
      res.status(201).json({
        success: true,
        data: { user, token, requiresVerification },
        message: requiresVerification
          ? 'Registration successful. Please check your email to verify your account.'
          : 'Registration successful',
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

// GET /api/auth/verify/:token - Verify email address
router.get('/verify/:token', (req: Request, res: Response<ApiResponse>) => {
  const token = req.params.token as string;

  try {
    const { user, authToken } = authService.verifyEmail(token);
    res.json({
      success: true,
      data: { user, token: authToken },
      message: 'Email verified successfully',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Verification failed';
    res.status(400).json({ success: false, error: message });
  }
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

// GET /api/auth/users - List all users (admin only)
router.get('/users', authenticate, requireAdmin, (_req: Request, res: Response<ApiResponse<SafeUser[]>>) => {
  try {
    const users = authService.listUsers();
    res.json({ success: true, data: users });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list users';
    res.status(500).json({ success: false, error: message });
  }
});

// DELETE /api/auth/users/:id - Delete a user (admin only)
router.delete('/users/:id', authenticate, requireAdmin, (req: Request, res: Response<ApiResponse>) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const userId = parseInt(req.params.id as string, 10);
  if (isNaN(userId)) {
    res.status(400).json({ success: false, error: 'Invalid user ID' });
    return;
  }

  try {
    authService.deleteUser(userId, req.user.userId);
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete user';
    res.status(400).json({ success: false, error: message });
  }
});

export default router;
