import { getDatabase } from '../db/connection.js';
import { emailService } from './email.service.js';
import type { CommentWithAuthor, CreateCommentRequest, Ticket } from '../types/index.js';

export class CommentService {
  // Create a comment (requires login)
  create(ticketId: number, userId: number, data: CreateCommentRequest): CommentWithAuthor {
    const db = getDatabase();

    // Check if ticket exists and is not deleted
    const ticket = db.prepare('SELECT * FROM tickets WHERE id = ? AND deleted_at IS NULL').get(ticketId) as Ticket | undefined;
    if (!ticket) {
      throw new Error('Ticket not found');
    }

    const stmt = db.prepare(`
      INSERT INTO comments (ticket_id, user_id, content)
      VALUES (?, ?, ?)
    `);
    const result = stmt.run(ticketId, userId, data.content);

    const comment = this.getById(result.lastInsertRowid as number)!;

    // Send email notification to ticket owner
    emailService.notifyNewComment(
      ticket,
      data.content,
      comment.author_email,
      userId
    ).catch(err => {
      console.error('[CommentService] Failed to send comment notification:', err);
    });

    return comment;
  }

  // Get comment by ID
  getById(id: number): CommentWithAuthor | null {
    const db = getDatabase();

    const comment = db.prepare(`
      SELECT c.*, u.email as author_email
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.id = ?
    `).get(id) as CommentWithAuthor | undefined;

    return comment || null;
  }

  // List comments for a ticket
  listByTicket(ticketId: number): CommentWithAuthor[] {
    const db = getDatabase();

    return db.prepare(`
      SELECT c.*, u.email as author_email
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.ticket_id = ?
      ORDER BY c.created_at ASC
    `).all(ticketId) as CommentWithAuthor[];
  }

  // Delete a comment (admin only)
  delete(id: number): boolean {
    const db = getDatabase();

    const result = db.prepare('DELETE FROM comments WHERE id = ?').run(id);
    return result.changes > 0;
  }

  // Get comment count for a ticket
  getCountByTicket(ticketId: number): number {
    const db = getDatabase();

    const result = db.prepare('SELECT COUNT(*) as count FROM comments WHERE ticket_id = ?').get(ticketId) as { count: number };
    return result.count;
  }
}

export const commentService = new CommentService();
