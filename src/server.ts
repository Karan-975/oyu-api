import app from './app';
import { config } from './config/config';
import { testDatabaseConnection } from './config/database';
import { connectRedis } from './config/redis';
import { logger } from './shared/utils/logger';
import { initFirebase } from './config/firebase';

async function startServer() {
  try {
    // Connect to infrastructure
    await testDatabaseConnection();
    await connectRedis();

    // Initialize Firebase Admin SDK (for push notifications)
    initFirebase();

    app.listen(config.app.port, () => {
      logger.info(`🚀 OYU Green API Server running on port ${config.app.port}`);
      logger.info(`📌 Environment: ${config.app.env}`);
      logger.info(`🌐 Frontend URL: ${config.app.frontendUrl}`);
    });
  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

startServer();
