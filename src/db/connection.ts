import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { AsyncLocalStorage } from 'async_hooks';
import { config } from '../config.js';
import { SCHEMA } from './schema.js';

// Run schema migrations for existing databases (ALTER TABLE for new columns)
function runMigrations(database: Database.Database): void {
  const userColumns = database.pragma('table_info(users)') as { name: string }[];
  const userColNames = new Set(userColumns.map(c => c.name));

  if (!userColNames.has('email_verified')) {
    database.exec('ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0');
  }
  if (!userColNames.has('email_verification_token')) {
    database.exec('ALTER TABLE users ADD COLUMN email_verification_token TEXT');
  }
  if (!userColNames.has('email_verified_at')) {
    database.exec('ALTER TABLE users ADD COLUMN email_verified_at TEXT');
  }

  const ticketColumns = database.pragma('table_info(tickets)') as { name: string }[];
  const ticketColNames = new Set(ticketColumns.map(c => c.name));

  if (!ticketColNames.has('milestone_id')) {
    database.exec('ALTER TABLE tickets ADD COLUMN milestone_id INTEGER REFERENCES milestones(id) ON DELETE SET NULL');
  }
}

// ─── Selfhosted: single DB instance ─────────────────────────────────────────

let db: Database.Database | null = null;

// ─── Cloudhosted: per-tenant DB map + AsyncLocalStorage ──────────────────────

export const tenantStorage = new AsyncLocalStorage<string>();
const tenantDbs = new Map<string, Database.Database>();

function initTenantDatabase(tenantName: string): Database.Database {
  const tenantDir = path.join(config.dataDir, tenantName);
  if (!fs.existsSync(tenantDir)) {
    fs.mkdirSync(tenantDir, { recursive: true });
  }

  const dbPath = path.join(tenantDir, 'bugio.db');
  const tenantDb = new Database(dbPath);
  tenantDb.pragma('foreign_keys = ON');
  tenantDb.pragma('journal_mode = WAL');
  tenantDb.exec(SCHEMA);
  runMigrations(tenantDb);

  tenantDbs.set(tenantName, tenantDb);
  return tenantDb;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function getDatabase(): Database.Database {
  if (config.isCloudhosted) {
    const tenant = tenantStorage.getStore();
    if (!tenant) {
      throw new Error('No tenant context found. Use tenantStorage.run() to set tenant.');
    }
    const existing = tenantDbs.get(tenant);
    if (existing) return existing;
    return initTenantDatabase(tenant);
  }

  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

export function initDatabase(dbPath?: string): Database.Database {
  const databasePath = dbPath || config.databasePath;

  // Ensure the data directory exists
  const dir = path.dirname(databasePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Create/connect to database
  db = new Database(databasePath);

  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // Enable WAL mode for better concurrency
  db.pragma('journal_mode = WAL');

  // Run schema (creates tables if not exist)
  db.exec(SCHEMA);

  // Run migrations (adds new columns to existing tables)
  runMigrations(db);

  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
  for (const [, tenantDb] of tenantDbs) {
    tenantDb.close();
  }
  tenantDbs.clear();
}

// For testing: create an in-memory database
export function createTestDatabase(): Database.Database {
  const testDb = new Database(':memory:');
  testDb.pragma('foreign_keys = ON');
  testDb.exec(SCHEMA);
  runMigrations(testDb);
  db = testDb;
  return testDb;
}
