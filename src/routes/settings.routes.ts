import { Router, Request, Response } from 'express';
import { settingsService, type AppSettings, type SettingKey } from '../services/settings.service.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { validateBody } from '../middleware/validation.js';
import { z } from 'zod';
import type { ApiResponse, UpdateSettingsRequest } from '../types/index.js';

const router = Router();

// Validation schema for updating settings
const hexColorRegex = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

const updateSettingsSchema = z.object({
  system_name: z.string().min(1).max(100).optional(),
  primary_color: z.string().regex(hexColorRegex, 'Invalid hex color').optional(),
  secondary_color: z.string().regex(hexColorRegex, 'Invalid hex color').optional(),
  success_color: z.string().regex(hexColorRegex, 'Invalid hex color').optional(),
  warning_color: z.string().regex(hexColorRegex, 'Invalid hex color').optional(),
  error_color: z.string().regex(hexColorRegex, 'Invalid hex color').optional(),
  logo_path: z.string().max(500).optional(),
  default_statuses: z.string().max(500).optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: 'At least one setting must be provided',
});

// GET /api/settings - Get all settings (public)
router.get('/', (_req: Request, res: Response<ApiResponse<AppSettings>>) => {
  const settings = settingsService.getAll();
  res.json({ success: true, data: settings });
});

// GET /api/settings/:key - Get a single setting (public)
router.get('/:key', (req: Request<{ key: string }>, res: Response<ApiResponse<{ key: string; value: string }>>) => {
  const validKeys: SettingKey[] = ['system_name', 'primary_color', 'secondary_color', 'success_color', 'warning_color', 'error_color', 'logo_path', 'default_statuses'];

  if (!validKeys.includes(req.params.key as SettingKey)) {
    res.status(400).json({ success: false, error: 'Invalid setting key' });
    return;
  }

  const value = settingsService.get(req.params.key as SettingKey);
  res.json({ success: true, data: { key: req.params.key, value } });
});

// PATCH /api/settings - Update settings (admin only)
router.patch(
  '/',
  authenticate,
  requireAdmin,
  validateBody(updateSettingsSchema),
  (req: Request<object, ApiResponse, UpdateSettingsRequest>, res: Response<ApiResponse<AppSettings>>) => {
    const updates = req.body;

    // Validate color if provided
    if (updates.primary_color && !settingsService.isValidColor(updates.primary_color)) {
      res.status(400).json({ success: false, error: 'Invalid color format' });
      return;
    }

    const settings = settingsService.updateMany(updates);
    res.json({
      success: true,
      data: settings,
      message: 'Settings updated successfully',
    });
  }
);

// POST /api/settings/reset - Reset all settings to defaults (admin only)
router.post(
  '/reset',
  authenticate,
  requireAdmin,
  (_req: Request, res: Response<ApiResponse<AppSettings>>) => {
    const settings = settingsService.resetAll();
    res.json({
      success: true,
      data: settings,
      message: 'Settings reset to defaults',
    });
  }
);

// POST /api/settings/:key/reset - Reset a single setting to default (admin only)
router.post(
  '/:key/reset',
  authenticate,
  requireAdmin,
  (req: Request<{ key: string }>, res: Response<ApiResponse<{ key: string; value: string }>>) => {
    const validKeys: SettingKey[] = ['system_name', 'primary_color', 'secondary_color', 'success_color', 'warning_color', 'error_color', 'logo_path', 'default_statuses'];

    if (!validKeys.includes(req.params.key as SettingKey)) {
      res.status(400).json({ success: false, error: 'Invalid setting key' });
      return;
    }

    const value = settingsService.reset(req.params.key as SettingKey);
    res.json({
      success: true,
      data: { key: req.params.key, value },
      message: `Setting '${req.params.key}' reset to default`,
    });
  }
);

export default router;
