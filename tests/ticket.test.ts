import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createTestDatabase, closeDatabase, getDatabase } from '../src/db/connection.js';
import bcrypt from 'bcrypt';

describe('Ticket API', () => {
  let app: ReturnType<typeof createApp>;
  let userToken: string;
  let adminToken: string;

  beforeEach(async () => {
    createTestDatabase();
    app = createApp();

    // Create a regular user
    const userRes = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'user@example.com',
        password: 'password123',
      });
    userToken = userRes.body.data.token;

    // Create an admin user directly in database
    const db = getDatabase();
    const passwordHash = await bcrypt.hash('adminpass', 10);
    db.prepare(`
      INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'admin')
    `).run('admin@example.com', passwordHash);

    const adminLoginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@example.com',
        password: 'adminpass',
      });
    adminToken = adminLoginRes.body.data.token;
  });

  afterEach(() => {
    closeDatabase();
  });

  describe('POST /api/tickets', () => {
    it('should create a ticket when authenticated', async () => {
      const res = await request(app)
        .post('/api/tickets')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'Test Bug',
          description: 'This is a test bug description that is long enough.',
          tag: 'bug',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('Test Bug');
      expect(res.body.data.tag).toBe('bug');
      expect(res.body.data.status).toBe('open');
    });

    it('should create anonymous ticket with email', async () => {
      const res = await request(app)
        .post('/api/tickets')
        .send({
          title: 'Anonymous Bug',
          description: 'This is an anonymous bug report from a user.',
          tag: 'bug',
          author_email: 'anonymous@example.com',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.author_id).toBeNull();
      expect(res.body.data.author_email).toBe('anonymous@example.com');
    });

    it('should reject anonymous ticket without email', async () => {
      const res = await request(app)
        .post('/api/tickets')
        .send({
          title: 'Anonymous Bug',
          description: 'This is an anonymous bug report from a user.',
          tag: 'bug',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Email is required');
    });

    it('should reject invalid tag', async () => {
      const res = await request(app)
        .post('/api/tickets')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'Test Bug',
          description: 'This is a test bug description that is long enough.',
          tag: 'invalid',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/tickets', () => {
    beforeEach(async () => {
      // Create some tickets
      await request(app)
        .post('/api/tickets')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'Bug 1',
          description: 'First bug description that is long enough to pass.',
          tag: 'bug',
        });

      await request(app)
        .post('/api/tickets')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'Feature 1',
          description: 'First feature description that is long enough.',
          tag: 'feature',
        });
    });

    it('should list all tickets', async () => {
      const res = await request(app).get('/api/tickets');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(2);
      expect(res.body.total).toBe(2);
    });

    it('should filter by tag', async () => {
      const res = await request(app).get('/api/tickets?tag=bug');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].tag).toBe('bug');
    });

    it('should paginate results', async () => {
      const res = await request(app).get('/api/tickets?limit=1&page=1');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.total).toBe(2);
      expect(res.body.totalPages).toBe(2);
    });
  });

  describe('GET /api/tickets/:id', () => {
    let ticketId: number;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/tickets')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'Test Ticket',
          description: 'This is a test ticket description for testing.',
          tag: 'bug',
        });
      ticketId = res.body.data.id;
    });

    it('should get a ticket by id', async () => {
      const res = await request(app).get(`/api/tickets/${ticketId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(ticketId);
    });

    it('should return 404 for non-existent ticket', async () => {
      const res = await request(app).get('/api/tickets/9999');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('PATCH /api/tickets/:id/status', () => {
    let ticketId: number;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/tickets')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'Test Ticket',
          description: 'This is a test ticket description for testing.',
          tag: 'bug',
        });
      ticketId = res.body.data.id;
    });

    it('should allow admin to change status', async () => {
      const res = await request(app)
        .patch(`/api/tickets/${ticketId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'in_progress' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('in_progress');
    });

    it('should reject status change from regular user', async () => {
      const res = await request(app)
        .patch(`/api/tickets/${ticketId}/status`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ status: 'in_progress' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('Voting', () => {
    let ticketId: number;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/tickets')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'Test Ticket',
          description: 'This is a test ticket description for testing.',
          tag: 'feature',
        });
      ticketId = res.body.data.id;
    });

    it('should allow logged-in user to vote', async () => {
      const res = await request(app)
        .post(`/api/tickets/${ticketId}/vote`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should reject duplicate votes', async () => {
      await request(app)
        .post(`/api/tickets/${ticketId}/vote`)
        .set('Authorization', `Bearer ${userToken}`);

      const res = await request(app)
        .post(`/api/tickets/${ticketId}/vote`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Already voted');
    });

    it('should reject anonymous votes', async () => {
      const res = await request(app).post(`/api/tickets/${ticketId}/vote`);

      expect(res.status).toBe(401);
    });

    it('should allow removing vote', async () => {
      await request(app)
        .post(`/api/tickets/${ticketId}/vote`)
        .set('Authorization', `Bearer ${userToken}`);

      const res = await request(app)
        .delete(`/api/tickets/${ticketId}/vote`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('Comments', () => {
    let ticketId: number;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/tickets')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'Test Ticket',
          description: 'This is a test ticket description for testing.',
          tag: 'bug',
        });
      ticketId = res.body.data.id;
    });

    it('should allow logged-in user to comment', async () => {
      const res = await request(app)
        .post(`/api/tickets/${ticketId}/comments`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ content: 'This is a test comment' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.content).toBe('This is a test comment');
    });

    it('should list comments for a ticket', async () => {
      await request(app)
        .post(`/api/tickets/${ticketId}/comments`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ content: 'Comment 1' });

      await request(app)
        .post(`/api/tickets/${ticketId}/comments`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ content: 'Comment 2' });

      const res = await request(app).get(`/api/tickets/${ticketId}/comments`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(2);
    });

    it('should reject anonymous comments', async () => {
      const res = await request(app)
        .post(`/api/tickets/${ticketId}/comments`)
        .send({ content: 'This is a test comment' });

      expect(res.status).toBe(401);
    });

    it('should allow admin to delete comments', async () => {
      const commentRes = await request(app)
        .post(`/api/tickets/${ticketId}/comments`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ content: 'Comment to delete' });

      const commentId = commentRes.body.data.id;

      const res = await request(app)
        .delete(`/api/tickets/${ticketId}/comments/${commentId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
