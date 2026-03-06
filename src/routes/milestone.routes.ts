import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { milestoneService } from '../services/milestone.service.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import type { ApiResponse, MilestoneWithTickets } from '../types/index.js';

const router = Router();

const createMilestoneSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  target_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.enum(['planned', 'in_progress', 'completed']).optional(),
});

const updateMilestoneSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  target_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  status: z.enum(['planned', 'in_progress', 'completed']).optional(),
});

// GET /api/milestones - list all milestones (public)
router.get('/', (_req: Request, res: Response<ApiResponse<MilestoneWithTickets[]>>) => {
  const milestones = milestoneService.list();
  res.json({ success: true, data: milestones });
});

// GET /api/milestones/:id - get single milestone (public)
router.get('/:id', (req: Request, res: Response<ApiResponse<MilestoneWithTickets>>) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ success: false, error: 'Invalid milestone ID' });
    return;
  }
  const milestone = milestoneService.getById(id);
  if (!milestone) {
    res.status(404).json({ success: false, error: 'Milestone not found' });
    return;
  }
  res.json({ success: true, data: milestone });
});

// POST /api/milestones - create milestone (admin only)
router.post('/', authenticate, requireAdmin, (req: Request, res: Response<ApiResponse<MilestoneWithTickets>>) => {
  const parsed = createMilestoneSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.errors[0]?.message || 'Invalid input' });
    return;
  }
  const milestone = milestoneService.create(parsed.data);
  res.status(201).json({ success: true, data: milestone, message: 'Milestone created' });
});

// PATCH /api/milestones/:id - update milestone (admin only)
router.patch('/:id', authenticate, requireAdmin, (req: Request, res: Response<ApiResponse<MilestoneWithTickets>>) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ success: false, error: 'Invalid milestone ID' });
    return;
  }
  const parsed = updateMilestoneSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.errors[0]?.message || 'Invalid input' });
    return;
  }
  const milestone = milestoneService.update(id, parsed.data);
  if (!milestone) {
    res.status(404).json({ success: false, error: 'Milestone not found' });
    return;
  }
  res.json({ success: true, data: milestone });
});

// DELETE /api/milestones/:id - delete milestone (admin only)
router.delete('/:id', authenticate, requireAdmin, (req: Request, res: Response<ApiResponse>) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ success: false, error: 'Invalid milestone ID' });
    return;
  }
  const deleted = milestoneService.delete(id);
  if (!deleted) {
    res.status(404).json({ success: false, error: 'Milestone not found' });
    return;
  }
  res.json({ success: true, message: 'Milestone deleted' });
});

// POST /api/milestones/:id/tickets/:ticketId - assign ticket to milestone (admin only)
router.post('/:id/tickets/:ticketId', authenticate, requireAdmin, (req: Request, res: Response<ApiResponse>) => {
  const milestoneId = parseInt(req.params.id as string, 10);
  const ticketId = parseInt(req.params.ticketId as string, 10);
  if (isNaN(milestoneId) || isNaN(ticketId)) {
    res.status(400).json({ success: false, error: 'Invalid ID' });
    return;
  }
  const ok = milestoneService.assignTicket(milestoneId, ticketId);
  if (!ok) {
    res.status(404).json({ success: false, error: 'Milestone or ticket not found' });
    return;
  }
  res.json({ success: true, message: 'Ticket assigned to milestone' });
});

// DELETE /api/milestones/tickets/:ticketId - unassign ticket from milestone (admin only)
router.delete('/tickets/:ticketId', authenticate, requireAdmin, (req: Request, res: Response<ApiResponse>) => {
  const ticketId = parseInt(req.params.ticketId as string, 10);
  if (isNaN(ticketId)) {
    res.status(400).json({ success: false, error: 'Invalid ticket ID' });
    return;
  }
  milestoneService.unassignTicket(ticketId);
  res.json({ success: true, message: 'Ticket unassigned from milestone' });
});

export default router;
