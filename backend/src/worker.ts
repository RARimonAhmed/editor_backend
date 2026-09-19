import { registerQueueProcessors } from './services/queue/processors.js';
import { logger } from './core/logger.js';
import { env } from './config/env.js';

async function startWorker() {
  logger.info('⚙️  Starting my_editor Background Media Worker Service...');
  logger.info({ concurrency: env.WORKER_CONCURRENCY }, 'Worker concurrency configured');

  registerQueueProcessors();

  logger.info('✅ Worker Service is listening for media & AI processing jobs');

  // Graceful shutdown
  process.on('SIGTERM', () => {
    logger.info('Worker SIGTERM received, stopping job processors...');
    process.exit(0);
  });
}

startWorker();
