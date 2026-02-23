import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { getDatabase, tenantStorage } from '../db/connection.js';
import { generateToken } from '../middleware/auth.js';
import { config } from '../config.js';
import { emailService } from './email.service.js';
import type { User, SafeUser, JWTPayload, RegisterRequest, LoginRequest } from '../types/index.js';

const SALT_ROUNDS = 10;

export class AuthService {
  // Register a new user
  async register(data: RegisterRequest): Promise<{ user: SafeUser; token: string | null; requiresVerification: boolean }> {
    const db = getDatabase();

    // Check if email already exists
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(data.email);
    if (existing) {
      throw new Error('Email already registered');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);

    // First user in the workspace becomes admin and is auto-verified
    const { count } = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
    const role = count === 0 ? 'admin' : 'user';
    const isFirstUser = count === 0;

    // Determine if email verification is needed:
    // - First user (admin) is always auto-verified
    // - Other users: require verification if SMTP is configured
    const needsVerification = !isFirstUser && emailService.configured;

    const emailVerified = needsVerification ? 0 : 1;
    const verificationToken = needsVerification ? crypto.randomBytes(32).toString('hex') : null;
    const emailVerifiedAt = needsVerification ? null : new Date().toISOString();

    // Insert user
    const stmt = db.prepare(`
      INSERT INTO users (email, password_hash, role, email_verified, email_verification_token, email_verified_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(data.email, passwordHash, role, emailVerified, verificationToken, emailVerifiedAt);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid) as User;
    const safeUser = this.toSafeUser(user);

    if (needsVerification && verificationToken) {
      // Send verification email (fire-and-forget, don't block registration)
      emailService.sendVerificationEmail(data.email, verificationToken).catch(err => {
        console.error('[AuthService] Failed to send verification email:', err);
      });
      return { user: safeUser, token: null, requiresVerification: true };
    }

    const token = generateToken(this.toJWTPayload(user));
    return { user: safeUser, token, requiresVerification: false };
  }

  // Login user
  async login(data: LoginRequest): Promise<{ user: SafeUser; token: string }> {
    const db = getDatabase();

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(data.email) as User | undefined;

    if (!user) {
      throw new Error('Invalid email or password');
    }

    const valid = await bcrypt.compare(data.password, user.password_hash);
    if (!valid) {
      throw new Error('Invalid email or password');
    }

    // Block login if email is not verified
    if (!user.email_verified) {
      throw new Error('Please verify your email address before logging in');
    }

    const safeUser = this.toSafeUser(user);
    const token = generateToken(this.toJWTPayload(user));

    return { user: safeUser, token };
  }

  // Verify email with token
  verifyEmail(token: string): { user: SafeUser; authToken: string } {
    const db = getDatabase();

    const user = db.prepare('SELECT * FROM users WHERE email_verification_token = ?').get(token) as User | undefined;

    if (!user) {
      throw new Error('Invalid or expired verification token');
    }

    if (user.email_verified) {
      throw new Error('Email already verified');
    }

    // Mark as verified
    db.prepare(`
      UPDATE users
      SET email_verified = 1, email_verification_token = NULL, email_verified_at = ?
      WHERE id = ?
    `).run(new Date().toISOString(), user.id);

    const updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as User;
    const safeUser = this.toSafeUser(updatedUser);
    const authToken = generateToken(this.toJWTPayload(updatedUser));

    return { user: safeUser, authToken };
  }

  // Get user by ID
  getUserById(id: number): SafeUser | null {
    const db = getDatabase();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined;
    return user ? this.toSafeUser(user) : null;
  }

  // Get user by email
  getUserByEmail(email: string): SafeUser | null {
    const db = getDatabase();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as User | undefined;
    return user ? this.toSafeUser(user) : null;
  }

  // List all users (admin only)
  listUsers(): SafeUser[] {
    const db = getDatabase();
    const users = db.prepare('SELECT * FROM users ORDER BY created_at ASC').all() as User[];
    return users.map(u => this.toSafeUser(u));
  }

  // Delete a user (admin only, cannot delete yourself)
  deleteUser(userId: number, requestingAdminId: number): void {
    if (userId === requestingAdminId) {
      throw new Error('You cannot delete your own account');
    }

    const db = getDatabase();
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Soft-delete: set author_id to NULL on their tickets (already handled by ON DELETE SET NULL)
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  }

  // Change password
  async changePassword(userId: number, currentPassword: string, newPassword: string): Promise<void> {
    const db = getDatabase();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as User | undefined;

    if (!user) {
      throw new Error('User not found');
    }

    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) {
      throw new Error('Current password is incorrect');
    }

    const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, userId);
  }

  // Change email
  async changeEmail(userId: number, password: string, newEmail: string): Promise<SafeUser> {
    const db = getDatabase();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as User | undefined;

    if (!user) {
      throw new Error('User not found');
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      throw new Error('Password is incorrect');
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(newEmail, userId);
    if (existing) {
      throw new Error('Email already in use');
    }

    db.prepare('UPDATE users SET email = ? WHERE id = ?').run(newEmail, userId);
    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as User;
    return this.toSafeUser(updated);
  }

  // Convert User to SafeUser (without password hash and verification token)
  private toSafeUser(user: User): SafeUser {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      created_at: user.created_at,
      email_verified: user.email_verified,
      email_verified_at: user.email_verified_at,
    };
  }

  // Convert User to JWT payload
  private toJWTPayload(user: User): JWTPayload {
    const payload: JWTPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };
    if (config.isCloudhosted) {
      const tenant = tenantStorage.getStore();
      if (tenant) payload.tenant = tenant;
    }
    return payload;
  }
}

export const authService = new AuthService();
