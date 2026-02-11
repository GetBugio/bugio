import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getDatabase, createTestDatabase, closeDatabase } from '../src/db/connection.js';
import type { Ticket } from '../src/types/index.js';

// Mock config before importing EmailService
vi.mock('../src/config.js', () => ({
  config: {
    port: 3000,
    smtp: {
      host: '',  // Empty host means SMTP not configured
      port: 587,
      secure: false,
      user: '',
      pass: '',
      from: 'noreply@bugio.local',
    },
    adminEmail: 'admin@bugio.local',
  },
}));

// Import EmailService after mocking config
const { EmailService } = await import('../src/services/email.service.js');

describe('EmailService', () => {
  let emailService: EmailService;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Create fresh test database
    createTestDatabase();
    // Spy on console.log to verify email logging
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    // Create a fresh instance (with SMTP not configured due to mocked config)
    emailService = new EmailService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    closeDatabase();
  });

  // Helper to create a test user
  const createTestUser = (email: string, role: 'user' | 'admin' = 'user'): number => {
    const db = getDatabase();
    const result = db.prepare(`
      INSERT INTO users (email, password_hash, role)
      VALUES (?, 'hashed', ?)
    `).run(email, role);
    return result.lastInsertRowid as number;
  };

  // Helper to create a test ticket
  const createTestTicket = (authorId: number | null, authorEmail: string | null = null): Ticket => {
    const db = getDatabase();
    const result = db.prepare(`
      INSERT INTO tickets (title, description, tag, status, author_id, author_email)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('Test Ticket', 'Test description', 'bug', 'open', authorId, authorEmail);

    return {
      id: result.lastInsertRowid as number,
      title: 'Test Ticket',
      description: 'Test description',
      tag: 'bug',
      status: 'open',
      author_id: authorId,
      author_email: authorEmail,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
    };
  };

  describe('notifyNewTicket', () => {
    it('should log email for new ticket notification to admin', async () => {
      const userId = createTestUser('user@example.com');
      const ticket = createTestTicket(userId);

      await emailService.notifyNewTicket(ticket);

      // Verify email was logged
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Email would be sent')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('admin@bugio.local')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Bugio] New bug: Test Ticket')
      );
    });

    it('should include ticket details in notification', async () => {
      const ticket = createTestTicket(null, 'anon@example.com');

      await emailService.notifyNewTicket(ticket);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Test description')
      );
    });
  });

  describe('notifyStatusChange', () => {
    it('should notify ticket owner of status change', async () => {
      const userId = createTestUser('owner@example.com');
      const ticket = createTestTicket(userId);

      await emailService.notifyStatusChange(ticket, 'open', 'in_progress');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('owner@example.com')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Status updated')
      );
    });

    it('should notify anonymous ticket owner via email', async () => {
      const ticket = createTestTicket(null, 'anon@example.com');

      await emailService.notifyStatusChange(ticket, 'open', 'completed');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('anon@example.com')
      );
    });

    it('should not error when ticket has no owner email', async () => {
      const ticket: Ticket = {
        id: 999,
        title: 'No Owner Ticket',
        description: 'Test',
        tag: 'bug',
        status: 'open',
        author_id: null,
        author_email: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null,
      };

      // Should not throw
      await emailService.notifyStatusChange(ticket, 'open', 'in_review');

      // Should log that there's no owner - check for both args
      expect(consoleSpy).toHaveBeenCalledWith(
        '[EmailService] No owner email for ticket',
        999
      );
    });
  });

  describe('notifyNewComment', () => {
    it('should notify ticket owner of new comment', async () => {
      const ownerId = createTestUser('owner@example.com');
      const commenterId = createTestUser('commenter@example.com');
      const ticket = createTestTicket(ownerId);

      await emailService.notifyNewComment(
        ticket,
        'This is a comment',
        'commenter@example.com',
        commenterId
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('owner@example.com')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('New comment on')
      );
    });

    it('should not notify if commenter is ticket owner', async () => {
      const userId = createTestUser('owner@example.com');
      const ticket = createTestTicket(userId);

      await emailService.notifyNewComment(
        ticket,
        'Self comment',
        'owner@example.com',
        userId
      );

      // Should not have sent to owner (commenter is owner)
      const ownerEmailCalls = consoleSpy.mock.calls.filter(
        call => call[0].includes('owner@example.com') && call[0].includes('To:')
      );
      expect(ownerEmailCalls).toHaveLength(0);
    });
  });

  describe('verifyConnection', () => {
    it('should return false when SMTP is not configured', async () => {
      const result = await emailService.verifyConnection();
      expect(result).toBe(false);
    });
  });
});
