import { buildApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './core/logger.js';
import { db } from './database/client.js';
import { redisService } from './services/redis/index.js';
import { jobQueue } from './services/queue/index.js';

async function startServer() {
  try {
    // Startup verification: database and migrations check
    const dbHealthy = await db.isHealthy();
    if (!dbHealthy) {
      if (env.NODE_ENV === 'production') {
        throw new Error('Database is unreachable during server startup in production mode.');
      }
      logger.warn('Database connection check failed during startup; continuing in dev/fallback mode.');
    } else {
      const migrationResult = await db.verifyMigrations();
      if (!migrationResult.verified) {
        const msg = `Database migration verification failed: ${migrationResult.pendingCount} pending migrations (${migrationResult.pending.join(', ')})`;
        if (env.NODE_ENV === 'production') {
          throw new Error(msg);
        }
        logger.warn({ pendingCount: migrationResult.pendingCount }, 'Migration verification warning in non-production mode');
      } else {
        logger.info({ appliedCount: migrationResult.appliedCount }, 'Database migrations verified successfully');
      }
    }

    const app = await buildApp();

    const address = await app.listen({
      port: env.PORT,
      host: env.HOST,
    });

    logger.info(`🚀 API Server running at ${address}`);
    logger.info(`📚 Swagger Documentation active at ${address}/docs`);
    logger.info(`🔌 WebSocket Collaboration Hub active at ws://${env.HOST}:${env.PORT}/ws/v1/collaboration/:projectId`);

    // Graceful Shutdown
    let isShuttingDown = false;
    const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
    signals.forEach((signal) => {
      process.on(signal, async () => {
        if (isShuttingDown) return;
        isShuttingDown = true;
        logger.info(`Received ${signal}, initiating graceful shutdown...`);
        try {
          // 1. Close HTTP server and stop accepting new connections
          await app.close();
          logger.info('HTTP server closed');

          // 2. Close queue workers and producers
          await jobQueue.close();
          logger.info('Job queues and workers closed');

          // 3. Close Redis connection
          await redisService.close();
          logger.info('Redis connection closed');

          // 4. Drain and close database pool
          await db.close();
          logger.info('Database pool drained and closed');

          logger.info('Graceful shutdown completed successfully');
          process.exit(0);
        } catch (err) {
          logger.error({ err }, 'Error during graceful shutdown');
          process.exit(1);
        }
      });
    });
  } catch (error) {
    logger.fatal({ error }, 'Failed to start API server');
    process.exit(1);
  }
}

startServer();
