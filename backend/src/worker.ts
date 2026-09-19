import { jobQueue, Job } from './services/queue/index.js';
import { jobsService } from './modules/jobs/jobs.service.js';
import { logger } from './core/logger.js';
import { env } from './config/env.js';

async function startWorker() {
  logger.info('⚙️  Starting my_editor Background Media Worker Service...');
  logger.info({ concurrency: env.WORKER_CONCURRENCY }, 'Worker concurrency configured');

  // Register Video Render & Export Job Processor
  jobQueue.process('render_export', async (job: Job) => {
    const { jobId, projectId, format, resolutionWidth, resolutionHeight, framerate } = job.data;
    logger.info(
      { jobId, projectId, format, resolution: `${resolutionWidth}x${resolutionHeight}`, fps: framerate },
      'Processing video timeline render & export'
    );

    // Simulate multi-stage timeline rendering pipeline:
    // Stage 1: Load timeline track clips & download source media
    await updateProgress(jobId, 15, 'processing');
    await delay(100);

    // Stage 2: Audio normalization & track mixing
    await updateProgress(jobId, 40, 'processing');
    await delay(100);

    // Stage 3: Video compositing, color grading & effects
    await updateProgress(jobId, 75, 'processing');
    await delay(100);

    // Stage 4: Encoding & multiplexing output
    await updateProgress(jobId, 95, 'processing');
    await delay(50);

    const outputKey = `exports/${projectId}/${jobId}.${format}`;
    const outputUrl = `${env.STORAGE_PUBLIC_URL_PREFIX}/${outputKey}`;

    await updateProgress(jobId, 100, 'completed', {
      outputUrl,
      outputKey,
      format,
      resolution: `${resolutionWidth}x${resolutionHeight}`,
      completedAt: new Date().toISOString(),
    });

    logger.info({ jobId, outputUrl }, 'Render export successfully finished');
  });

  // Register Audio Transcription Job Processor
  jobQueue.process('ai_transcribe', async (job: Job) => {
    const { jobId, mediaUrl, language } = job.data;
    logger.info({ jobId, mediaUrl, language }, 'Processing background audio transcription');
    await updateProgress(jobId, 50, 'processing');
    await delay(100);
    await updateProgress(jobId, 100, 'completed');
  });

  logger.info('✅ Worker Service is listening for media & AI processing jobs');

  // Graceful shutdown
  process.on('SIGTERM', () => {
    logger.info('Worker SIGTERM received, stopping job processors...');
    process.exit(0);
  });
}

async function updateProgress(
  jobId: string,
  progress: number,
  status?: 'queued' | 'processing' | 'completed' | 'failed',
  result?: Record<string, unknown>
) {
  await jobsService.updateJobProgress(jobId, progress, status, result);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

startWorker();
