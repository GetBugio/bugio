import { getDatabase } from '../db/connection.js';
import { emailService } from './email.service.js';
import type {
  Ticket,
  TicketWithDetails,
  CreateTicketRequest,
  UpdateTicketRequest,
  TicketStatus,
  TicketQueryParams,
} from '../types/index.js';

// Raw DB result type (before converting user_has_voted to boolean)
interface RawTicketWithDetails extends Omit<TicketWithDetails, 'user_has_voted'> {
  user_has_voted: number;
}

export class TicketService {
  // Create a new ticket
  create(data: CreateTicketRequest, authorId: number | null): Ticket {
    const db = getDatabase();

    const stmt = db.prepare(`
      INSERT INTO tickets (title, description, tag, author_id, author_email)
      VALUES (?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      data.title,
      data.description,
      data.tag,
      authorId,
      authorId ? null : data.author_email || null
    );

    const ticket = this.getById(result.lastInsertRowid as number)!;

    // Send email notification to admin
    emailService.notifyNewTicket(ticket).catch(err => {
      console.error('[TicketService] Failed to send new ticket notification:', err);
    });

    return ticket;
  }

  // Get ticket by ID (with details)
  getById(id: number, userId?: number): TicketWithDetails | null {
    const db = getDatabase();

    const ticket = db.prepare(`
      SELECT
        t.*,
        u.email as author_name,
        (SELECT COUNT(*) FROM votes WHERE ticket_id = t.id) as vote_count,
        ${userId ? `(SELECT COUNT(*) FROM votes WHERE ticket_id = t.id AND user_id = ?) as user_has_voted` : '0 as user_has_voted'}
      FROM tickets t
      LEFT JOIN users u ON t.author_id = u.id
      WHERE t.id = ? AND t.deleted_at IS NULL
    `).get(...(userId ? [userId, id] : [id])) as RawTicketWithDetails | undefined;

    if (!ticket) return null;

    return {
      ...ticket,
      user_has_voted: ticket.user_has_voted > 0,
    };
  }

  // List tickets with pagination and filtering
  list(params: TicketQueryParams, userId?: number): { tickets: TicketWithDetails[]; total: number } {
    const db = getDatabase();

    const {
      page = 1,
      limit = 20,
      tag,
      status,
      sort = 'created_at',
      order = 'desc',
      search,
    } = params;

    const offset = (page - 1) * limit;

    // Build WHERE clauses
    const conditions: string[] = ['t.deleted_at IS NULL'];
    const values: (string | number)[] = [];

    if (tag) {
      conditions.push('t.tag = ?');
      values.push(tag);
    }

    if (status) {
      conditions.push('t.status = ?');
      values.push(status);
    }

    if (search) {
      conditions.push('(t.title LIKE ? OR t.description LIKE ?)');
      const searchTerm = `%${search}%`;
      values.push(searchTerm, searchTerm);
    }

    const whereClause = conditions.join(' AND ');

    // Get total count
    const countStmt = db.prepare(`
      SELECT COUNT(*) as count
      FROM tickets t
      WHERE ${whereClause}
    `);
    const { count: total } = countStmt.get(...values) as { count: number };

    // Determine sort column
    let sortColumn = 't.created_at';
    if (sort === 'votes') {
      sortColumn = 'vote_count';
    } else if (sort === 'updated_at') {
      sortColumn = 't.updated_at';
    }

    // Get tickets
    const ticketsStmt = db.prepare(`
      SELECT
        t.*,
        u.email as author_name,
        (SELECT COUNT(*) FROM votes WHERE ticket_id = t.id) as vote_count,
        ${userId ? `(SELECT COUNT(*) FROM votes WHERE ticket_id = t.id AND user_id = ?) as user_has_voted` : '0 as user_has_voted'}
      FROM tickets t
      LEFT JOIN users u ON t.author_id = u.id
      WHERE ${whereClause}
      ORDER BY ${sortColumn} ${order.toUpperCase()}
      LIMIT ? OFFSET ?
    `);

    const queryValues = userId ? [userId, ...values, limit, offset] : [...values, limit, offset];
    const rawTickets = ticketsStmt.all(...queryValues) as RawTicketWithDetails[];

    const tickets = rawTickets.map(t => ({
      ...t,
      user_has_voted: t.user_has_voted > 0,
    }));

    return { tickets, total };
  }

  // Update ticket (for ticket owner or admin)
  update(id: number, data: UpdateTicketRequest, userId: number, isAdmin: boolean): Ticket | null {
    const db = getDatabase();

    // Check if ticket exists and user has permission
    const ticket = db.prepare('SELECT * FROM tickets WHERE id = ? AND deleted_at IS NULL').get(id) as Ticket | undefined;

    if (!ticket) return null;

    if (!isAdmin && ticket.author_id !== userId) {
      throw new Error('Not authorized to update this ticket');
    }

    const updates: string[] = [];
    const values: (string | number)[] = [];

    if (data.title !== undefined) {
      updates.push('title = ?');
      values.push(data.title);
    }

    if (data.description !== undefined) {
      updates.push('description = ?');
      values.push(data.description);
    }

    if (data.tag !== undefined) {
      updates.push('tag = ?');
      values.push(data.tag);
    }

    if (updates.length === 0) return ticket;

    updates.push('updated_at = datetime("now")');
    values.push(id);

    db.prepare(`
      UPDATE tickets SET ${updates.join(', ')}
      WHERE id = ?
    `).run(...values);

    return this.getById(id) as Ticket;
  }

  // Update ticket status (admin only)
  updateStatus(id: number, status: TicketStatus): Ticket | null {
    const db = getDatabase();

    const ticket = db.prepare('SELECT * FROM tickets WHERE id = ? AND deleted_at IS NULL').get(id) as Ticket | undefined;

    if (!ticket) return null;

    const oldStatus = ticket.status;

    db.prepare(`
      UPDATE tickets SET status = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(status, id);

    const updatedTicket = this.getById(id) as Ticket;

    // Send email notification to ticket owner about status change
    if (oldStatus !== status) {
      emailService.notifyStatusChange(updatedTicket, oldStatus, status).catch(err => {
        console.error('[TicketService] Failed to send status change notification:', err);
      });
    }

    return updatedTicket;
  }

  // Soft delete ticket
  delete(id: number, userId: number, isAdmin: boolean): boolean {
    const db = getDatabase();

    const ticket = db.prepare('SELECT * FROM tickets WHERE id = ? AND deleted_at IS NULL').get(id) as Ticket | undefined;

    if (!ticket) return false;

    if (!isAdmin && ticket.author_id !== userId) {
      throw new Error('Not authorized to delete this ticket');
    }

    db.prepare(`
      UPDATE tickets SET deleted_at = datetime('now')
      WHERE id = ?
    `).run(id);

    return true;
  }
}

export const ticketService = new TicketService();
