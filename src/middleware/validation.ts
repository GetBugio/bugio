import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema } from 'zod';
import type { ApiResponse, TicketTag, TicketStatus } from '../types/index.js';

// Validation schemas
export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const createTicketSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(200, 'Title too long'),
  description: z.string().min(10, 'Description must be at least 10 characters').max(10000, 'Description too long'),
  tag: z.enum(['bug', 'feature'] as const),
  author_email: z.string().email('Invalid email address').optional(),
});

export const updateTicketSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  description: z.string().min(10).max(10000).optional(),
  tag: z.enum(['bug', 'feature'] as const).optional(),
});

export const updateTicketStatusSchema = z.object({
  status: z.enum(['open', 'in_review', 'in_progress', 'rejected', 'completed'] as const),
});

export const createCommentSchema = z.object({
  content: z.string().min(1, 'Comment cannot be empty').max(5000, 'Comment too long'),
});

export const ticketQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  tag: z.enum(['bug', 'feature'] as const).optional(),
  status: z.enum(['open', 'in_review', 'in_progress', 'rejected', 'completed'] as const).optional(),
  sort: z.enum(['votes', 'created_at', 'updated_at']).optional().default('created_at'),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
  search: z.string().max(100).optional(),
});

// Middleware factory for body validation
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response<ApiResponse>, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
      res.status(400).json({
        success: false,
        error: 'Validation failed',
        message: errors.join(', '),
      });
      return;
    }

    req.body = result.data;
    next();
  };
}

// Middleware factory for query validation
export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response<ApiResponse>, next: NextFunction): void => {
    const result = schema.safeParse(req.query);

    if (!result.success) {
      const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
      res.status(400).json({
        success: false,
        error: 'Validation failed',
        message: errors.join(', '),
      });
      return;
    }

    // Store validated query in a typed way
    (req as Request & { validatedQuery: T }).validatedQuery = result.data;
    next();
  };
}

// Type guard helpers
export function isValidTag(tag: string): tag is TicketTag {
  return tag === 'bug' || tag === 'feature';
}

export function isValidStatus(status: string): status is TicketStatus {
  return ['open', 'in_review', 'in_progress', 'rejected', 'completed'].includes(status);
}
