import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { config } from '../config.js';
import { getDatabase } from '../db/connection.js';
import type { Ticket, TicketStatus } from '../types/index.js';

// Email template types
export type EmailTemplate =
  | 'ticket_created'
  | 'ticket_status_changed'
  | 'ticket_updated'
  | 'comment_added';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
}

interface TicketEmailData {
  ticket: Ticket;
  ticketUrl?: string;
}

interface StatusChangeEmailData extends TicketEmailData {
  oldStatus: TicketStatus;
  newStatus: TicketStatus;
}

interface CommentEmailData extends TicketEmailData {
  commentContent: string;
  commenterEmail: string;
}

export class EmailService {
  private transporter: Transporter | null = null;
  private isConfigured: boolean = false;

  constructor() {
    this.initializeTransporter();
  }

  private initializeTransporter(): void {
    const { host, port, secure, user, pass } = config.smtp;

    // Only create transporter if SMTP is configured
    if (!host || !user) {
      console.log('[EmailService] SMTP not configured - emails will be logged only');
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user,
        pass,
      },
    });

    this.isConfigured = true;
    console.log(`[EmailService] Initialized with SMTP host: ${host}`);
  }

  // Get the ticket owner's email (either from user account or anonymous email)
  private getTicketOwnerEmail(ticket: Ticket): string | null {
    if (ticket.author_id) {
      const db = getDatabase();
      const user = db.prepare('SELECT email FROM users WHERE id = ?').get(ticket.author_id) as { email: string } | undefined;
      return user?.email || null;
    }
    return ticket.author_email;
  }

  // Get admin email(s) from settings or config
  private getAdminEmails(): string[] {
    const db = getDatabase();

    // Try to get admin email from settings table
    const setting = db.prepare('SELECT value FROM settings WHERE key = ?').get('admin_email') as { value: string } | undefined;
    if (setting?.value) {
      return [setting.value];
    }

    // Fall back to config
    if (config.adminEmail) {
      return [config.adminEmail];
    }

    // Get all admin users as fallback
    const admins = db.prepare('SELECT email FROM users WHERE role = ?').all('admin') as { email: string }[];
    return admins.map(a => a.email);
  }

  // Generate ticket URL
  private getTicketUrl(ticketId: number): string {
    const baseUrl = process.env.APP_URL || `http://localhost:${config.port}`;
    return `${baseUrl}/tickets/${ticketId}`;
  }

  // Send email (or log if not configured)
  private async send(options: EmailOptions): Promise<boolean> {
    const { to, subject, html, text } = options;

    if (!this.isConfigured || !this.transporter) {
      // Log email in development
      console.log('[EmailService] Email would be sent:');
      console.log(`  To: ${to}`);
      console.log(`  Subject: ${subject}`);
      console.log(`  Text: ${text.substring(0, 200)}...`);
      return true;
    }

    try {
      await this.transporter.sendMail({
        from: config.smtp.from,
        to,
        subject,
        html,
        text,
      });
      console.log(`[EmailService] Email sent to ${to}: ${subject}`);
      return true;
    } catch (error) {
      console.error('[EmailService] Failed to send email:', error);
      return false;
    }
  }

  // Template: New ticket created (sent to admin)
  private templateTicketCreated(data: TicketEmailData): { subject: string; html: string; text: string } {
    const { ticket, ticketUrl } = data;
    const subject = `[Bugio] New ${ticket.tag}: ${ticket.title}`;

    const text = `
A new ${ticket.tag} has been created.

Title: ${ticket.title}
Tag: ${ticket.tag}
Status: ${ticket.status}

Description:
${ticket.description}

View ticket: ${ticketUrl || 'N/A'}
`.trim();

    const html = `
<h2>New ${ticket.tag === 'bug' ? 'Bug Report' : 'Feature Request'}</h2>
<p><strong>Title:</strong> ${escapeHtml(ticket.title)}</p>
<p><strong>Tag:</strong> ${ticket.tag}</p>
<p><strong>Status:</strong> ${ticket.status}</p>
<h3>Description</h3>
<p>${escapeHtml(ticket.description).replace(/\n/g, '<br>')}</p>
${ticketUrl ? `<p><a href="${ticketUrl}">View Ticket</a></p>` : ''}
`.trim();

    return { subject, html, text };
  }

  // Template: Status changed (sent to ticket owner)
  private templateStatusChanged(data: StatusChangeEmailData): { subject: string; html: string; text: string } {
    const { ticket, oldStatus, newStatus, ticketUrl } = data;
    const subject = `[Bugio] Status updated: ${ticket.title}`;

    const text = `
Your ticket status has been updated.

Title: ${ticket.title}
Status: ${oldStatus} → ${newStatus}

View ticket: ${ticketUrl || 'N/A'}
`.trim();

    const html = `
<h2>Ticket Status Updated</h2>
<p><strong>Title:</strong> ${escapeHtml(ticket.title)}</p>
<p><strong>Status:</strong> <span style="text-decoration: line-through">${oldStatus}</span> → <strong>${newStatus}</strong></p>
${ticketUrl ? `<p><a href="${ticketUrl}">View Ticket</a></p>` : ''}
`.trim();

    return { subject, html, text };
  }

  // Template: Comment added (sent to ticket owner)
  private templateCommentAdded(data: CommentEmailData): { subject: string; html: string; text: string } {
    const { ticket, commentContent, commenterEmail, ticketUrl } = data;
    const subject = `[Bugio] New comment on: ${ticket.title}`;

    const text = `
A new comment has been added to your ticket.

Title: ${ticket.title}
Commenter: ${commenterEmail}

Comment:
${commentContent}

View ticket: ${ticketUrl || 'N/A'}
`.trim();

    const html = `
<h2>New Comment on Your Ticket</h2>
<p><strong>Title:</strong> ${escapeHtml(ticket.title)}</p>
<p><strong>From:</strong> ${escapeHtml(commenterEmail)}</p>
<h3>Comment</h3>
<p>${escapeHtml(commentContent).replace(/\n/g, '<br>')}</p>
${ticketUrl ? `<p><a href="${ticketUrl}">View Ticket</a></p>` : ''}
`.trim();

    return { subject, html, text };
  }

  // Public API: Notify admin of new ticket
  async notifyNewTicket(ticket: Ticket): Promise<void> {
    const adminEmails = this.getAdminEmails();
    const ticketUrl = this.getTicketUrl(ticket.id);
    const { subject, html, text } = this.templateTicketCreated({ ticket, ticketUrl });

    for (const email of adminEmails) {
      await this.send({ to: email, subject, html, text });
    }
  }

  // Public API: Notify ticket owner of status change
  async notifyStatusChange(
    ticket: Ticket,
    oldStatus: TicketStatus,
    newStatus: TicketStatus
  ): Promise<void> {
    const ownerEmail = this.getTicketOwnerEmail(ticket);
    if (!ownerEmail) {
      console.log('[EmailService] No owner email for ticket', ticket.id);
      return;
    }

    const ticketUrl = this.getTicketUrl(ticket.id);
    const { subject, html, text } = this.templateStatusChanged({
      ticket,
      oldStatus,
      newStatus,
      ticketUrl,
    });

    await this.send({ to: ownerEmail, subject, html, text });
  }

  // Public API: Notify ticket owner of new comment
  async notifyNewComment(
    ticket: Ticket,
    commentContent: string,
    commenterEmail: string,
    commenterId: number
  ): Promise<void> {
    const ownerEmail = this.getTicketOwnerEmail(ticket);
    if (!ownerEmail) {
      console.log('[EmailService] No owner email for ticket', ticket.id);
      return;
    }

    // Don't notify if the commenter is the ticket owner
    if (ticket.author_id === commenterId) {
      return;
    }

    const ticketUrl = this.getTicketUrl(ticket.id);
    const { subject, html, text } = this.templateCommentAdded({
      ticket,
      commentContent,
      commenterEmail,
      ticketUrl,
    });

    await this.send({ to: ownerEmail, subject, html, text });

    // Also notify admin of new comments
    const adminEmails = this.getAdminEmails().filter(e => e !== commenterEmail && e !== ownerEmail);
    const adminSubject = `[Bugio] New comment on: ${ticket.title}`;
    for (const email of adminEmails) {
      await this.send({ to: email, subject: adminSubject, html, text });
    }
  }

  // Public API: Notify admin of ticket update
  async notifyTicketUpdate(ticket: Ticket, updaterEmail: string): Promise<void> {
    const adminEmails = this.getAdminEmails().filter(e => e !== updaterEmail);
    const ticketUrl = this.getTicketUrl(ticket.id);

    const subject = `[Bugio] Ticket updated: ${ticket.title}`;
    const text = `
A ticket has been updated.

Title: ${ticket.title}
Updated by: ${updaterEmail}

View ticket: ${ticketUrl}
`.trim();

    const html = `
<h2>Ticket Updated</h2>
<p><strong>Title:</strong> ${escapeHtml(ticket.title)}</p>
<p><strong>Updated by:</strong> ${escapeHtml(updaterEmail)}</p>
<p><a href="${ticketUrl}">View Ticket</a></p>
`.trim();

    for (const email of adminEmails) {
      await this.send({ to: email, subject, html, text });
    }
  }

  // Verify SMTP configuration
  async verifyConnection(): Promise<boolean> {
    if (!this.isConfigured || !this.transporter) {
      return false;
    }

    try {
      await this.transporter.verify();
      return true;
    } catch (error) {
      console.error('[EmailService] SMTP verification failed:', error);
      return false;
    }
  }
}

// HTML escape helper
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

// Export singleton instance
export const emailService = new EmailService();
