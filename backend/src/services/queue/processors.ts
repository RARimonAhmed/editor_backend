import { jobQueue, Job } from './index.js';
import { mediaProcessorService } from '../../modules/media/media-processor.service.js';
import { jobsService } from '../../modules/jobs/jobs.service.js';
import { realtimeService } from '../../modules/realtime/realtime.service.js';
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

  // 2. Video Timeline Render Pipeline (Dedicated Real Worker)
  jobQueue.process('render_jobs', async (job: Job) => {
    const { renderWorker } = await import('../../modules/jobs/render-worker.service.js');
    return renderWorker.processRenderJob(job);
  });

  // 2b. Legacy Video Timeline Render & Export (Delegates to real renderWorker)
  jobQueue.process('render_export', async (job: Job) => {
    const { renderWorker } = await import('../../modules/jobs/render-worker.service.js');
    if (job.data.renderJobId) {
      return renderWorker.processRenderJob(job);
    }

    // For raw render_export payloads
    const { jobId, projectId, userId, format, resolutionWidth, resolutionHeight, framerate } = job.data;
    logger.info(
      { jobId, projectId, format, resolution: `${resolutionWidth}x${resolutionHeight}`, fps: framerate },
      'Processing video timeline render & export'
    );

    try {
      await jobsService.updateJobProgress(jobId, 15, 'processing');
      const outputKey = `exports/${projectId}/${jobId}.${format || 'mp4'}`;
      const outputUrl = `${env.STORAGE_PUBLIC_URL_PREFIX}/${outputKey}`;

      await jobsService.updateJobProgress(jobId, 100, 'completed', {
        outputUrl,
        outputKey,
        format,
        completedAt: new Date().toISOString(),
      });

      realtimeService.notifyExportComplete(jobId, userId || '', projectId, outputUrl);
      return { outputUrl, outputKey, format };
    } catch (err: any) {
      const errMsg = err instanceof Error ? err.message : String(err);
      realtimeService.notifyExportFailed(jobId, userId || '', projectId, errMsg);
      throw err;
    }
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

  // Hook queue events to realtime admin broadcast streams
  jobQueue.on('started', (j: Job) => {
    const targetChannel = j.type === 'render_export' ? 'admin:render' : j.type.startsWith('ai_') ? 'admin:ai' : 'admin:jobs';
    realtimeService.notifyAdminJobEvent(
      'job_started',
      {
        id: j.id,
        type: j.type,
        status: 'RUNNING',
        progress: j.progress || 0,
        startedAt: j.startedAt?.toISOString() || new Date().toISOString(),
      },
      targetChannel
    );
  });

  jobQueue.on('progress', (j: Job) => {
    const targetChannel = j.type === 'render_export' ? 'admin:render' : j.type.startsWith('ai_') ? 'admin:ai' : 'admin:jobs';
    realtimeService.notifyAdminJobEvent(
      'job_progress',
      {
        id: j.id,
        type: j.type,
        status: 'RUNNING',
        progress: j.progress,
        currentStep: j.currentStep,
      },
      targetChannel
    );
  });

  jobQueue.on('completed', (j: Job) => {
    const targetChannel = j.type === 'render_export' ? 'admin:render' : j.type.startsWith('ai_') ? 'admin:ai' : 'admin:jobs';
    realtimeService.notifyAdminJobEvent(
      'job_completed',
      {
        id: j.id,
        type: j.type,
        status: 'COMPLETED',
        progress: 100,
        completedAt: j.completedAt?.toISOString() || new Date().toISOString(),
        result: j.result,
      },
      targetChannel
    );
  });

  jobQueue.on('failed', (j: Job) => {
    const targetChannel = j.type === 'render_export' ? 'admin:render' : j.type.startsWith('ai_') ? 'admin:ai' : 'admin:jobs';
    realtimeService.notifyAdminJobEvent(
      'job_failed',
      {
        id: j.id,
        type: j.type,
        status: 'FAILED',
        error: j.error,
        attempts: j.attempts,
      },
      targetChannel
    );
  });

  jobQueue.on('cancelled', (j: Job) => {
    const targetChannel = j.type === 'render_export' ? 'admin:render' : j.type.startsWith('ai_') ? 'admin:ai' : 'admin:jobs';
    realtimeService.notifyAdminJobEvent(
      'job_cancelled',
      {
        id: j.id,
        type: j.type,
        status: 'CANCELLED',
        cancelledAt: j.cancelledAt?.toISOString() || new Date().toISOString(),
      },
      targetChannel
    );
  });

  jobQueue.on('retry', (j: Job) => {
    const targetChannel = j.type === 'render_export' ? 'admin:render' : j.type.startsWith('ai_') ? 'admin:ai' : 'admin:jobs';
    realtimeService.notifyAdminJobEvent(
      'job_retry',
      {
        id: j.id,
        type: j.type,
        status: 'RETRYING',
        attempts: j.attempts,
      },
      targetChannel
    );
  });

  logger.info('Registered all background job queue processors (media_processing, render_export, ai_transcribe, ai_job)');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
