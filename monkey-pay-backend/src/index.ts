import { env } from './config/env.js';
import app from './app.js';
import logger from './utils/logger.js';

/**
 * Entry point for the Monkey Pay backend server.
 * Loads environment, starts Express, listens for connections.
 */

const PORT = env.PORT;

const server = app.listen(PORT, () => {
  logger.info(
    {
      port: PORT,
      env: env.NODE_ENV,
      goatpay: env.GOATPAY_BASE_URL,
      supabase: env.SUPABASE_URL,
    },
    `Monkey Pay backend listening on port ${PORT}`,
  );
});

// Graceful shutdown
function shutdown(signal: string) {
  logger.info({ signal }, 'Received shutdown signal, closing server...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });

  // Force close after 10s
  setTimeout(() => {
    logger.warn('Forcing shutdown after timeout');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle unhandled rejections
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled promise rejection');
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  process.exit(1);
});

export { server };
