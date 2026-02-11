import { createApp } from './app.js';
import { initDatabase, closeDatabase } from './db/connection.js';
import { config } from './config.js';

// Initialize database
initDatabase();

// Create and start the app
const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`🐛 Bugio server running on port ${config.port}`);
  console.log(`   Environment: ${config.nodeEnv}`);
  console.log(`   Database: ${config.databasePath}`);
});

// Graceful shutdown
const shutdown = () => {
  console.log('\nShutting down gracefully...');
  server.close(() => {
    closeDatabase();
    console.log('Server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export { app };
