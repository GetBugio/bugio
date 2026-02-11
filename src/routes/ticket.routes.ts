import { Router, Request, Response } from 'express';
import { ticketService } from '../services/ticket.service.js';
import { voteService } from '../services/vote.service.js';
import { commentService } from '../services/comment.service.js';
import { authenticate, optionalAuth, requireAdmin, anonymousTicketRateLimit } from '../middleware/auth.js';
import {
  validateBody,
  validateQuery,
  createTicketSchema,
  updateTicketSchema,
  updateTicketStatusSchema,
  createCommentSchema,
  ticketQuerySchema,
} from '../middleware/validation.js';
import { config } from '../config.js';
import type {
  ApiResponse,
  PaginatedResponse,
  Ticket,
  TicketWithDetails,
  CreateTicketRequest,
  UpdateTicketRequest,
  UpdateTicketStatusRequest,
  CreateCommentRequest,
  CommentWithAuthor,
  TicketQueryParams,
} from '../types/index.js';

const router = Router();

// GET /api/tickets - List tickets
router.get(
  '/',
  optionalAuth,
  validateQuery(ticketQuerySchema),
  (req: Request, res: Response<PaginatedResponse<TicketWithDetails>>) => {
    const params = (req as Request & { validatedQuery: TicketQueryParams }).validatedQuery;
    const userId = req.user?.userId;

    const { tickets, total } = ticketService.list(params, userId);

    const page = params.page || 1;
    const limit = params.limit || config.pagination.defaultLimit;

    res.json({
      success: true,
      data: tickets,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  }
);

// GET /api/tickets/:id - Get single ticket
router.get('/:id', optionalAuth, (req: Request, res: Response<ApiResponse<TicketWithDetails>>) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ success: false, error: 'Invalid ticket ID' });
    return;
  }

  const userId = req.user?.userId;
  const ticket = ticketService.getById(id, userId);

  if (!ticket) {
    res.status(404).json({ success: false, error: 'Ticket not found' });
    return;
  }

  res.json({ success: true, data: ticket });
});

// POST /api/tickets - Create ticket (anonymous allowed, rate limited)
router.post(
  '/',
  optionalAuth,
  anonymousTicketRateLimit,
  validateBody(createTicketSchema),
  (req: Request, res: Response<ApiResponse<Ticket>>) => {
    const body = req.body as CreateTicketRequest;

    const ticket = ticketService.create(body, req.user?.userId || null);

    res.status(201).json({
      success: true,
      data: ticket,
      message: 'Ticket created successfully',
    });
  }
);

// PATCH /api/tickets/:id - Update ticket
router.patch(
  '/:id',
  authenticate,
  validateBody(updateTicketSchema),
  (req: Request, res: Response<ApiResponse<Ticket>>) => {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      res.status(400).json({ success: false, error: 'Invalid ticket ID' });
      return;
    }

    try {
      const body = req.body as UpdateTicketRequest;
      const ticket = ticketService.update(
        id,
        body,
        req.user!.userId,
        req.user!.role === 'admin'
      );

      if (!ticket) {
        res.status(404).json({ success: false, error: 'Ticket not found' });
        return;
      }

      res.json({ success: true, data: ticket });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Update failed';
      res.status(403).json({ success: false, error: message });
    }
  }
);

// PATCH /api/tickets/:id/status - Update ticket status (admin only)
router.patch(
  '/:id/status',
  authenticate,
  requireAdmin,
  validateBody(updateTicketStatusSchema),
  (req: Request, res: Response<ApiResponse<Ticket>>) => {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      res.status(400).json({ success: false, error: 'Invalid ticket ID' });
      return;
    }

    const body = req.body as UpdateTicketStatusRequest;
    const ticket = ticketService.updateStatus(id, body.status);

    if (!ticket) {
      res.status(404).json({ success: false, error: 'Ticket not found' });
      return;
    }

    res.json({
      success: true,
      data: ticket,
      message: `Status updated to ${body.status}`,
    });
  }
);

// DELETE /api/tickets/:id - Delete ticket (soft delete)
router.delete('/:id', authenticate, (req: Request, res: Response<ApiResponse>) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ success: false, error: 'Invalid ticket ID' });
    return;
  }

  try {
    const deleted = ticketService.delete(id, req.user!.userId, req.user!.role === 'admin');

    if (!deleted) {
      res.status(404).json({ success: false, error: 'Ticket not found' });
      return;
    }

    res.json({ success: true, message: 'Ticket deleted' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Delete failed';
    res.status(403).json({ success: false, error: message });
  }
});

// POST /api/tickets/:id/vote - Vote on a ticket (requires login)
router.post('/:id/vote', authenticate, (req: Request, res: Response<ApiResponse>) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ success: false, error: 'Invalid ticket ID' });
    return;
  }

  try {
    voteService.vote(req.user!.userId, id);
    res.json({ success: true, message: 'Vote recorded' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Vote failed';
    res.status(400).json({ success: false, error: message });
  }
});

// DELETE /api/tickets/:id/vote - Remove vote from a ticket
router.delete('/:id/vote', authenticate, (req: Request, res: Response<ApiResponse>) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ success: false, error: 'Invalid ticket ID' });
    return;
  }

  const removed = voteService.unvote(req.user!.userId, id);

  if (!removed) {
    res.status(404).json({ success: false, error: 'Vote not found' });
    return;
  }

  res.json({ success: true, message: 'Vote removed' });
});

// GET /api/tickets/:id/comments - List comments for a ticket
router.get('/:id/comments', (req: Request, res: Response<ApiResponse<CommentWithAuthor[]>>) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ success: false, error: 'Invalid ticket ID' });
    return;
  }

  const comments = commentService.listByTicket(id);
  res.json({ success: true, data: comments });
});

// POST /api/tickets/:id/comments - Add comment (requires login)
router.post(
  '/:id/comments',
  authenticate,
  validateBody(createCommentSchema),
  (req: Request, res: Response<ApiResponse<CommentWithAuthor>>) => {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      res.status(400).json({ success: false, error: 'Invalid ticket ID' });
      return;
    }

    try {
      const body = req.body as CreateCommentRequest;
      const comment = commentService.create(id, req.user!.userId, body);
      res.status(201).json({ success: true, data: comment });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Comment failed';
      res.status(400).json({ success: false, error: message });
    }
  }
);

// DELETE /api/tickets/:id/comments/:commentId - Delete comment (admin only)
router.delete(
  '/:id/comments/:commentId',
  authenticate,
  requireAdmin,
  (req: Request, res: Response<ApiResponse>) => {
    const commentId = parseInt(req.params.commentId as string, 10);
    if (isNaN(commentId)) {
      res.status(400).json({ success: false, error: 'Invalid comment ID' });
      return;
    }

    const deleted = commentService.delete(commentId);

    if (!deleted) {
      res.status(404).json({ success: false, error: 'Comment not found' });
      return;
    }

    res.json({ success: true, message: 'Comment deleted' });
  }
);

export default router;
