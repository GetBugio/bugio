import { getDatabase } from '../db/connection.js';
import type {
  Milestone,
  MilestoneWithTickets,
  MilestoneTicket,
  CreateMilestoneRequest,
  UpdateMilestoneRequest,
} from '../types/index.js';

export class MilestoneService {
  list(): MilestoneWithTickets[] {
    const db = getDatabase();

    const milestones = db.prepare(`
      SELECT * FROM milestones ORDER BY
        CASE status
          WHEN 'in_progress' THEN 0
          WHEN 'planned' THEN 1
          WHEN 'completed' THEN 2
        END,
        CASE WHEN target_date IS NULL THEN 1 ELSE 0 END,
        target_date ASC,
        created_at ASC
    `).all() as Milestone[];

    return milestones.map(m => this._withTickets(m));
  }

  getById(id: number): MilestoneWithTickets | null {
    const db = getDatabase();
    const milestone = db.prepare('SELECT * FROM milestones WHERE id = ?').get(id) as Milestone | undefined;
    if (!milestone) return null;
    return this._withTickets(milestone);
  }

  create(data: CreateMilestoneRequest): MilestoneWithTickets {
    const db = getDatabase();

    const result = db.prepare(`
      INSERT INTO milestones (title, description, target_date, status)
      VALUES (?, ?, ?, ?)
    `).run(
      data.title,
      data.description || null,
      data.target_date || null,
      data.status || 'planned'
    );

    return this.getById(result.lastInsertRowid as number)!;
  }

  update(id: number, data: UpdateMilestoneRequest): MilestoneWithTickets | null {
    const db = getDatabase();

    const existing = db.prepare('SELECT * FROM milestones WHERE id = ?').get(id) as Milestone | undefined;
    if (!existing) return null;

    const updates: string[] = [];
    const values: (string | number | null)[] = [];

    if (data.title !== undefined) { updates.push('title = ?'); values.push(data.title); }
    if (data.description !== undefined) { updates.push('description = ?'); values.push(data.description || null); }
    if ('target_date' in data) { updates.push('target_date = ?'); values.push(data.target_date ?? null); }
    if (data.status !== undefined) { updates.push('status = ?'); values.push(data.status); }

    if (updates.length === 0) return this.getById(id);

    updates.push('updated_at = datetime(\'now\')');
    values.push(id);

    db.prepare(`UPDATE milestones SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    return this.getById(id);
  }

  delete(id: number): boolean {
    const db = getDatabase();
    // Unassign tickets first
    db.prepare('UPDATE tickets SET milestone_id = NULL WHERE milestone_id = ?').run(id);
    const result = db.prepare('DELETE FROM milestones WHERE id = ?').run(id);
    return result.changes > 0;
  }

  assignTicket(milestoneId: number, ticketId: number): boolean {
    const db = getDatabase();
    const milestone = db.prepare('SELECT id FROM milestones WHERE id = ?').get(milestoneId);
    if (!milestone) return false;
    const result = db.prepare(
      'UPDATE tickets SET milestone_id = ?, updated_at = datetime(\'now\') WHERE id = ? AND deleted_at IS NULL'
    ).run(milestoneId, ticketId);
    return result.changes > 0;
  }

  unassignTicket(ticketId: number): boolean {
    const db = getDatabase();
    const result = db.prepare(
      'UPDATE tickets SET milestone_id = NULL, updated_at = datetime(\'now\') WHERE id = ? AND deleted_at IS NULL'
    ).run(ticketId);
    return result.changes > 0;
  }

  getTicketsWithoutMilestone(): MilestoneTicket[] {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT t.id, t.title, t.tag, t.status,
             (SELECT COUNT(*) FROM votes WHERE ticket_id = t.id) as vote_count
      FROM tickets t
      WHERE t.deleted_at IS NULL AND t.milestone_id IS NULL
      ORDER BY vote_count DESC, t.created_at DESC
    `).all() as MilestoneTicket[];
    return rows;
  }

  private _withTickets(milestone: Milestone): MilestoneWithTickets {
    const db = getDatabase();

    const tickets = db.prepare(`
      SELECT t.id, t.title, t.tag, t.status,
             (SELECT COUNT(*) FROM votes WHERE ticket_id = t.id) as vote_count
      FROM tickets t
      WHERE t.milestone_id = ? AND t.deleted_at IS NULL
      ORDER BY t.status ASC, vote_count DESC
    `).all(milestone.id) as MilestoneTicket[];

    const completed_count = tickets.filter(t => t.status === 'completed').length;

    return {
      ...milestone,
      tickets,
      ticket_count: tickets.length,
      completed_count,
    };
  }
}

// Status grouped view for roadmap (status-based kanban)
export interface StatusColumn {
  status: string;
  tickets: {
    id: number;
    title: string;
    tag: string;
    vote_count: number;
    milestone_id: number | null;
    milestone_title?: string;
  }[];
}

export const milestoneService = new MilestoneService();
