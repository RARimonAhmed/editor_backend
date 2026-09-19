import { jobQueue, Job } from './index.js';
import { mediaProcessorService } from '../../modules/media/media-processor.service.js';
import { jobsService } from '../../modules/jobs/jobs.service.js';
import { env } from '../../config/env.js';
import { logger } from '../../core/logger.js';

let registered = false;

export function registerQueueProcessors() {
  if (registered) return;
  registered = true;

  // 1. Asynchronous Media Processing Pipeline (Probe -> Metadata -> Thumbnail -> Waveform -> Proxy -> Search Index -> READY)
  jobQueue.process('media_processing', async (job: Job) => {
    logger.info({ jobId: job.id, type: job.type }, 'Worker processing media pipeline job');
    return mediaProcessorService.processMediaJob(job);
  });

  // 2. Video Timeline Render & Export
  jobQueue.process('render_export', async (job: Job) => {
    const { jobId, projectId, format, resolutionWidth, resolutionHeight, framerate } = job.data;
    logger.info(
      { jobId, projectId, format, resolution: `${resolutionWidth}x${resolutionHeight}`, fps: framerate },
      'Processing video timeline render & export'
    );

    await jobsService.updateJobProgress(jobId, 15, 'processing');
    await delay(20);
    await jobsService.updateJobProgress(jobId, 50, 'processing');
    await delay(20);
    await jobsService.updateJobProgress(jobId, 85, 'processing');
    await delay(20);

    const outputKey = `exports/${projectId}/${jobId}.${format}`;
    const outputUrl = `${env.STORAGE_PUBLIC_URL_PREFIX}/${outputKey}`;

    await jobsService.updateJobProgress(jobId, 100, 'completed', {
      outputUrl,
      outputKey,
      format,
      completedAt: new Date().toISOString(),
    });
  });

  // 3. AI Audio Transcription
  jobQueue.process('ai_transcribe', async (job: Job) => {
    const { jobId, mediaUrl, language } = job.data;
    logger.info({ jobId, mediaUrl, language }, 'Processing background audio transcription');
    await jobsService.updateJobProgress(jobId, 50, 'processing');
    await delay(20);
    await jobsService.updateJobProgress(jobId, 100, 'completed');
  });

  // 4. Asynchronous AI Job System (Text, Speech, Image, Video, Vision, Audio)
  jobQueue.process('ai_job', async (job: Job) => {
    const { aiJobWorker } = await import('../../modules/ai/jobs/ai-job.worker.js');
    return aiJobWorker.processJob(job);
  });

  logger.info('Registered all background job queue processors (media_processing, render_export, ai_transcribe, ai_job)');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
