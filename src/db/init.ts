#!/usr/bin/env tsx
// Database initialization script
// Run with: npm run db:init

import bcrypt from 'bcrypt';
import { initDatabase, closeDatabase } from './connection.js';
import { INITIAL_ADMIN_QUERY } from './schema.js';
import { config } from '../config.js';

async function main() {
  console.log('Initializing database...');

  const db = initDatabase();

  // Create initial admin user if email is configured
  if (config.adminEmail) {
    const defaultPassword = 'admin123'; // Should be changed immediately
    const passwordHash = await bcrypt.hash(defaultPassword, 10);

    const stmt = db.prepare(INITIAL_ADMIN_QUERY);
    const result = stmt.run(config.adminEmail, passwordHash);

    if (result.changes > 0) {
      console.log(`Created admin user: ${config.adminEmail}`);
      console.log('Default password: admin123 (CHANGE THIS IMMEDIATELY!)');
    } else {
      console.log('Admin user already exists.');
    }
  }

  console.log(`Database initialized at: ${config.databasePath}`);

  closeDatabase();
}

main().catch(console.error);
