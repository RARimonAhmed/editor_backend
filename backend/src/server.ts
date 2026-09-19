import { buildApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './core/logger.js';
import { db } from './database/client.js';
import { redisService } from './services/redis/index.js';

async function startServer() {
  try {
    const app = await buildApp();

    const address = await app.listen({
      port: env.PORT,
      host: env.HOST,
    });

    logger.info(`🚀 API Server running at ${address}`);
    logger.info(`📚 Swagger Documentation active at ${address}/docs`);
    logger.info(`🔌 WebSocket Collaboration Hub active at ws://${env.HOST}:${env.PORT}/ws/v1/collaboration/:projectId`);

    // Graceful Shutdown
    const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
    signals.forEach((signal) => {
      process.on(signal, async () => {
        logger.info(`Received ${signal}, initiating graceful shutdown...`);
        try {
          await app.close();
          await db.close();
          await redisService.close();
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
