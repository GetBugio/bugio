import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { ticketService } from '../services/ticket.service.js';
import { settingsService } from '../services/settings.service.js';
import { getDatabase } from '../db/connection.js';
import { getT, getJsTranslations, parseLangFromCookie } from '../services/i18n.service.js';
import type { User, TicketTag, TicketStatus, TicketQueryParams } from '../types/index.js';

const router = Router();

// Valid tag and status values for type guards
const VALID_TAGS: TicketTag[] = ['bug', 'feature'];
const VALID_STATUSES: TicketStatus[] = ['open', 'in_review', 'in_progress', 'rejected', 'completed'];
type SortOption = 'created_at' | 'votes' | 'updated_at';

function isValidTag(tag: string | undefined): tag is TicketTag {
  return tag !== undefined && VALID_TAGS.includes(tag as TicketTag);
}

function isValidStatus(status: string | undefined): status is TicketStatus {
  return status !== undefined && VALID_STATUSES.includes(status as TicketStatus);
}

// Helper to decode JWT and get user (optional auth)
function getUserFromRequest(req: Request): User | null {
  // Try Authorization header first, then fall back to cookie
  let token: string | undefined;

  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else {
    // Parse token from cookie
    const cookieHeader = req.headers.cookie;
    if (cookieHeader) {
      const match = cookieHeader.split(';').map(c => c.trim()).find(c => c.startsWith('token='));
      if (match) {
        token = match.substring(6);
      }
    }
  }

  if (!token) {
    return null;
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as { userId: number; role: string };
    const db = getDatabase();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.userId) as User | undefined;
    return user || null;
  } catch {
    return null;
  }
}

// Helper to get common view data
function getCommonViewData(req: Request) {
  const settings = settingsService.getAll();
  const user = getUserFromRequest(req);
  const lang = parseLangFromCookie(req.headers.cookie);
  const t = getT(lang);
  const jsTranslations = JSON.stringify(getJsTranslations(lang));

  return {
    settings: {
      systemName: settings.system_name,
      primaryColor: settings.primary_color,
      secondaryColor: settings.secondary_color,
      successColor: settings.success_color,
      warningColor: settings.warning_color,
      errorColor: settings.error_color,
      logoPath: settings.logo_path,
    },
    user,
    t,
    lang,
    jsTranslations,
  };
}

// Home page - ticket listing
router.get('/', (req: Request, res: Response) => {
  const common = getCommonViewData(req);

  const page = parseInt(req.query.page as string) || 1;
  const tagRaw = req.query.tag as string | undefined;
  const statusRaw = req.query.status as string | undefined;
  const sortBy = req.query.sortBy as string | undefined;
  const searchRaw = req.query.search;
  const search = typeof searchRaw === 'string' ? searchRaw : undefined;

  // Validate and type-cast
  const tag: TicketTag | undefined = isValidTag(tagRaw) ? tagRaw : undefined;
  const status: TicketStatus | undefined = isValidStatus(statusRaw) ? statusRaw : undefined;

  // Map frontend sortBy to backend sort param
  let sort: SortOption = 'created_at';
  if (sortBy === 'votes') sort = 'votes';
  if (sortBy === 'updatedAt') sort = 'updated_at';

  const queryParams: TicketQueryParams = { page, limit: 20, tag, status, sort, order: 'desc', search };

  const { tickets: rawTickets, total } = ticketService.list(queryParams, common.user?.id);

  // Transform tickets for frontend
  const tickets = rawTickets.map(tk => ({
    id: tk.id,
    title: tk.title,
    description: tk.description,
    tag: tk.tag,
    status: tk.status,
    createdAt: tk.created_at,
    creatorEmail: tk.author_name || tk.author_email,
    voteCount: tk.vote_count,
    hasVoted: tk.user_has_voted,
    commentCount: 0, // TODO: add comment count to query
  }));

  const totalPages = Math.ceil(total / 20);

  res.render('index', {
    ...common,
    title: common.t('tickets.title'),
    tickets,
    pagination: { page, totalPages, total },
    query: { tag: tagRaw, status: statusRaw, sortBy: sortBy || 'createdAt', search },
  });
});

// Create ticket page
router.get('/create', (req: Request, res: Response) => {
  const common = getCommonViewData(req);

  res.render('create', {
    ...common,
    title: common.t('create.title'),
  });
});

// Ticket detail page
router.get('/ticket/:id', (req: Request, res: Response) => {
  const common = getCommonViewData(req);
  const idParam = req.params.id as string;
  const ticketId = parseInt(idParam, 10);

  if (isNaN(ticketId)) {
    return res.status(404).render('error', {
      ...common,
      title: common.t('error.pageNotFound'),
      message: common.t('error.pageNotFound'),
    });
  }

  const rawTicket = ticketService.getById(ticketId, common.user?.id);

  if (!rawTicket) {
    return res.status(404).render('error', {
      ...common,
      title: common.t('error.pageNotFound'),
      message: common.t('error.pageNotFound'),
    });
  }

  // Get comments for this ticket
  const db = getDatabase();
  const rawComments = db.prepare(`
    SELECT c.*, u.email as user_email
    FROM comments c
    JOIN users u ON c.user_id = u.id
    WHERE c.ticket_id = ?
    ORDER BY c.created_at ASC
  `).all(ticketId) as Array<{
    id: number;
    content: string;
    user_id: number;
    user_email: string;
    created_at: string;
  }>;

  const ticket = {
    id: rawTicket.id,
    title: rawTicket.title,
    description: rawTicket.description,
    tag: rawTicket.tag,
    status: rawTicket.status,
    createdAt: rawTicket.created_at,
    creatorEmail: rawTicket.author_name || rawTicket.author_email,
    voteCount: rawTicket.vote_count,
    hasVoted: rawTicket.user_has_voted,
  };

  const comments = rawComments.map(c => ({
    id: c.id,
    content: c.content,
    userId: c.user_id,
    userEmail: c.user_email,
    createdAt: c.created_at,
  }));

  res.render('ticket', {
    ...common,
    title: `#${ticket.id} - ${ticket.title}`,
    ticket,
    comments,
  });
});

// Login page
router.get('/login', (req: Request, res: Response) => {
  const common = getCommonViewData(req);

  if (common.user) {
    return res.redirect('/');
  }

  res.render('login', {
    ...common,
    title: common.t('nav.login'),
  });
});

// Register page
router.get('/register', (req: Request, res: Response) => {
  const common = getCommonViewData(req);

  if (common.user) {
    return res.redirect('/');
  }

  res.render('register', {
    ...common,
    title: common.t('nav.register'),
  });
});

// Logout
router.get('/logout', (_req: Request, res: Response) => {
  // Client-side logout (token is stored in localStorage)
  res.redirect('/');
});

// Admin dashboard
router.get('/admin', (req: Request, res: Response) => {
  const common = getCommonViewData(req);

  if (!common.user || common.user.role !== 'admin') {
    return res.redirect('/login');
  }

  const db = getDatabase();

  // Get stats
  const totalTickets = (db.prepare('SELECT COUNT(*) as count FROM tickets WHERE deleted_at IS NULL').get() as { count: number }).count;
  const openTickets = (db.prepare("SELECT COUNT(*) as count FROM tickets WHERE deleted_at IS NULL AND status = 'open'").get() as { count: number }).count;
  const inProgressTickets = (db.prepare("SELECT COUNT(*) as count FROM tickets WHERE deleted_at IS NULL AND status = 'in_progress'").get() as { count: number }).count;
  const completedTickets = (db.prepare("SELECT COUNT(*) as count FROM tickets WHERE deleted_at IS NULL AND status = 'completed'").get() as { count: number }).count;
  const totalUsers = (db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }).count;

  // Get recent tickets
  const { tickets: rawTickets } = ticketService.list({ page: 1, limit: 10, sort: 'created_at', order: 'desc' }, common.user.id);

  const recentTickets = rawTickets.map(tk => ({
    id: tk.id,
    title: tk.title,
    tag: tk.tag,
    status: tk.status,
    createdAt: tk.created_at,
    voteCount: tk.vote_count,
  }));

  res.render('admin', {
    ...common,
    title: common.t('admin.title'),
    stats: {
      totalTickets,
      openTickets,
      inProgressTickets,
      completedTickets,
      totalUsers,
    },
    recentTickets,
  });
});

// Settings page (logged-in users only)
router.get('/settings', (req: Request, res: Response) => {
  const common = getCommonViewData(req);

  if (!common.user) {
    return res.redirect('/login');
  }

  const allSettings = settingsService.getAll();

  res.render('settings', {
    ...common,
    title: common.t('settings.title'),
    allSettings,
  });
});

export default router;
