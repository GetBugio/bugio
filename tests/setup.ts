import { beforeEach, afterEach } from 'vitest';
import { createTestDatabase, closeDatabase } from '../src/db/connection.js';

// Create fresh database before each test
beforeEach(() => {
  createTestDatabase();
});

// Close database after each test
afterEach(() => {
  closeDatabase();
});
