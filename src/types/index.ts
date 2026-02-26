// Core type definitions for Bugio bug/feature tracker

// User roles
export type UserRole = 'user' | 'admin';

// Ticket tags
export type TicketTag = 'bug' | 'feature';

// Ticket status workflow
export type TicketStatus = 'open' | 'in_review' | 'in_progress' | 'rejected' | 'completed';

// User entity
export interface User {
  id: number;
  email: string;
  password_hash: string;
  role: UserRole;
  created_at: string;
  email_verified: number; // 0 = unverified, 1 = verified
  email_verification_token: string | null;
  email_verified_at: string | null;
}

// User without sensitive data (no password hash, no verification token)
export type SafeUser = Omit<User, 'password_hash' | 'email_verification_token'>;

// Ticket entity
export interface Ticket {
  id: number;
  title: string;
  description: string;
  tag: TicketTag;
  status: TicketStatus;
  author_id: number | null;  // null for anonymous
  author_email: string | null;  // stored for anonymous users
  created_at: string;
  updated_at: string;
  deleted_at: string | null;  // soft delete
}

// Ticket with vote count and author info
export interface TicketWithDetails extends Ticket {
  vote_count: number;
  author_name?: string;
  user_has_voted?: boolean;
}

// Vote entity
export interface Vote {
  id: number;
  user_id: number;
  ticket_id: number;
  created_at: string;
}

// Comment entity
export interface Comment {
  id: number;
  ticket_id: number;
  user_id: number;
  content: string;
  created_at: string;
}

// Comment with author info
export interface CommentWithAuthor extends Comment {
  author_email: string;
}

// Settings key-value store
export interface Setting {
  key: string;
  value: string;
}

// Settings update request
export interface UpdateSettingsRequest {
  system_name?: string;
  primary_color?: string;
  secondary_color?: string;
  success_color?: string;
  warning_color?: string;
  error_color?: string;
  logo_path?: string;
  default_statuses?: string;
}

// API Request types
export interface CreateTicketRequest {
  title: string;
  description: string;
  tag: TicketTag;
  author_email?: string;  // Required if not logged in
}

export interface UpdateTicketRequest {
  title?: string;
  description?: string;
  tag?: TicketTag;
}

export interface UpdateTicketStatusRequest {
  status: TicketStatus;
}

export interface CreateCommentRequest {
  content: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

// JWT payload
export interface JWTPayload {
  userId: number;
  email: string;
  role: UserRole;
  tenant?: string; // cloudhosted: which tenant this token belongs to
}

// Express augmentation for authenticated requests
declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
    }
  }
}

// API Response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Query parameters
export interface TicketQueryParams {
  page?: number;
  limit?: number;
  tag?: TicketTag;
  status?: TicketStatus | TicketStatus[];
  sort?: 'votes' | 'created_at' | 'updated_at';
  order?: 'asc' | 'desc';
  search?: string;
}
