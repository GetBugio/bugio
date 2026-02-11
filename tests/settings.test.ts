import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createTestDatabase, closeDatabase, getDatabase } from '../src/db/connection.js';

// Helper to create an admin user and get token
async function createAdminAndLogin(app: ReturnType<typeof createApp>): Promise<string> {
  const db = getDatabase();
  // Insert admin user directly (password is 'adminpass')
  const bcrypt = await import('bcrypt');
  const hash = await bcrypt.hash('adminpass', 10);
  db.prepare('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)').run(
    'admin@example.com',
    hash,
    'admin'
  );

  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@example.com', password: 'adminpass' });

  return res.body.data.token;
}

// Helper to create regular user and get token
async function createUserAndLogin(app: ReturnType<typeof createApp>): Promise<string> {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email: 'user@example.com', password: 'userpassword' });

  return res.body.data.token;
}

describe('Settings API', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    createTestDatabase();
    app = createApp();
  });

  afterEach(() => {
    closeDatabase();
  });

  describe('GET /api/settings', () => {
    it('should return all default settings', async () => {
      const res = await request(app).get('/api/settings');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual({
        system_name: 'Bugio',
        primary_color: '#3b82f6',
        logo_path: '',
        default_statuses: 'open,in_review,in_progress,rejected,completed',
      });
    });

    it('should return updated settings after modification', async () => {
      const token = await createAdminAndLogin(app);

      // Update settings
      await request(app)
        .patch('/api/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ system_name: 'My Tracker' });

      // Fetch all settings
      const res = await request(app).get('/api/settings');

      expect(res.status).toBe(200);
      expect(res.body.data.system_name).toBe('My Tracker');
    });
  });

  describe('GET /api/settings/:key', () => {
    it('should return a single setting', async () => {
      const res = await request(app).get('/api/settings/system_name');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual({
        key: 'system_name',
        value: 'Bugio',
      });
    });

    it('should reject invalid setting key', async () => {
      const res = await request(app).get('/api/settings/invalid_key');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Invalid setting key');
    });
  });

  describe('PATCH /api/settings', () => {
    it('should update settings when admin', async () => {
      const token = await createAdminAndLogin(app);

      const res = await request(app)
        .patch('/api/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({
          system_name: 'Custom Tracker',
          primary_color: '#ff0000',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.system_name).toBe('Custom Tracker');
      expect(res.body.data.primary_color).toBe('#ff0000');
    });

    it('should reject non-admin users', async () => {
      const token = await createUserAndLogin(app);

      const res = await request(app)
        .patch('/api/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ system_name: 'Hacked' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Admin access required');
    });

    it('should reject unauthenticated requests', async () => {
      const res = await request(app)
        .patch('/api/settings')
        .send({ system_name: 'Hacked' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should reject invalid color format', async () => {
      const token = await createAdminAndLogin(app);

      const res = await request(app)
        .patch('/api/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ primary_color: 'not-a-color' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should accept valid 3-digit hex colors', async () => {
      const token = await createAdminAndLogin(app);

      const res = await request(app)
        .patch('/api/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ primary_color: '#f00' });

      expect(res.status).toBe(200);
      expect(res.body.data.primary_color).toBe('#f00');
    });

    it('should reject empty update', async () => {
      const token = await createAdminAndLogin(app);

      const res = await request(app)
        .patch('/api/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/settings/reset', () => {
    it('should reset all settings to defaults', async () => {
      const token = await createAdminAndLogin(app);

      // First, change some settings
      await request(app)
        .patch('/api/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({
          system_name: 'Custom',
          primary_color: '#123456',
        });

      // Reset all
      const res = await request(app)
        .post('/api/settings/reset')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.system_name).toBe('Bugio');
      expect(res.body.data.primary_color).toBe('#3b82f6');
    });

    it('should reject non-admin users', async () => {
      const token = await createUserAndLogin(app);

      const res = await request(app)
        .post('/api/settings/reset')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/settings/:key/reset', () => {
    it('should reset a single setting to default', async () => {
      const token = await createAdminAndLogin(app);

      // Change the setting
      await request(app)
        .patch('/api/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ system_name: 'Custom Name' });

      // Reset just that setting
      const res = await request(app)
        .post('/api/settings/system_name/reset')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.value).toBe('Bugio');
    });

    it('should reject invalid setting key', async () => {
      const token = await createAdminAndLogin(app);

      const res = await request(app)
        .post('/api/settings/invalid_key/reset')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid setting key');
    });

    it('should reject non-admin users', async () => {
      const token = await createUserAndLogin(app);

      const res = await request(app)
        .post('/api/settings/system_name/reset')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });
  });
});
