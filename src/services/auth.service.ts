import bcrypt from 'bcrypt';
import { getDatabase } from '../db/connection.js';
import { generateToken } from '../middleware/auth.js';
import type { User, SafeUser, JWTPayload, RegisterRequest, LoginRequest } from '../types/index.js';

const SALT_ROUNDS = 10;

export class AuthService {
  // Register a new user
  async register(data: RegisterRequest): Promise<{ user: SafeUser; token: string }> {
    const db = getDatabase();

    // Check if email already exists
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(data.email);
    if (existing) {
      throw new Error('Email already registered');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);

    // Insert user
    const stmt = db.prepare(`
      INSERT INTO users (email, password_hash, role)
      VALUES (?, ?, 'user')
    `);
    const result = stmt.run(data.email, passwordHash);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid) as User;

    const safeUser = this.toSafeUser(user);
    const token = generateToken(this.toJWTPayload(user));

    return { user: safeUser, token };
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

    const safeUser = this.toSafeUser(user);
    const token = generateToken(this.toJWTPayload(user));

    return { user: safeUser, token };
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

  // Convert User to SafeUser (without password hash)
  private toSafeUser(user: User): SafeUser {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      created_at: user.created_at,
    };
  }

  // Convert User to JWT payload
  private toJWTPayload(user: User): JWTPayload {
    return {
      userId: user.id,
      email: user.email,
      role: user.role,
    };
  }
}

export const authService = new AuthService();
