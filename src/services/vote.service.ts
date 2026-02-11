import { getDatabase } from '../db/connection.js';
import type { Vote } from '../types/index.js';

export class VoteService {
  // Add a vote to a ticket
  vote(userId: number, ticketId: number): Vote {
    const db = getDatabase();

    // Check if ticket exists and is not deleted
    const ticket = db.prepare('SELECT id FROM tickets WHERE id = ? AND deleted_at IS NULL').get(ticketId);
    if (!ticket) {
      throw new Error('Ticket not found');
    }

    // Check if user already voted
    const existing = db.prepare('SELECT id FROM votes WHERE user_id = ? AND ticket_id = ?').get(userId, ticketId);
    if (existing) {
      throw new Error('Already voted on this ticket');
    }

    // Add vote
    const stmt = db.prepare(`
      INSERT INTO votes (user_id, ticket_id)
      VALUES (?, ?)
    `);
    const result = stmt.run(userId, ticketId);

    return db.prepare('SELECT * FROM votes WHERE id = ?').get(result.lastInsertRowid) as Vote;
  }

  // Remove a vote from a ticket
  unvote(userId: number, ticketId: number): boolean {
    const db = getDatabase();

    const result = db.prepare(`
      DELETE FROM votes WHERE user_id = ? AND ticket_id = ?
    `).run(userId, ticketId);

    return result.changes > 0;
  }

  // Check if user has voted on a ticket
  hasVoted(userId: number, ticketId: number): boolean {
    const db = getDatabase();

    const vote = db.prepare('SELECT id FROM votes WHERE user_id = ? AND ticket_id = ?').get(userId, ticketId);
    return !!vote;
  }

  // Get vote count for a ticket
  getVoteCount(ticketId: number): number {
    const db = getDatabase();

    const result = db.prepare('SELECT COUNT(*) as count FROM votes WHERE ticket_id = ?').get(ticketId) as { count: number };
    return result.count;
  }

  // Get all votes for a user
  getUserVotes(userId: number): Vote[] {
    const db = getDatabase();

    return db.prepare('SELECT * FROM votes WHERE user_id = ?').all(userId) as Vote[];
  }
}

export const voteService = new VoteService();
