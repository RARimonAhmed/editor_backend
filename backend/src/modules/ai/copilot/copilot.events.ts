import { realtimeService } from '../../realtime/realtime.service.js';
import { EditorCommandPlan } from './copilot.types.js';
import { logger } from '../../../core/logger.js';

export const COPILOT_REALTIME_EVENTS = {
  AI_JOB_CREATED: 'ai_job_progress', // or 'job_created'
  AI_JOB_PROGRESS: 'ai_job_progress',
  AI_JOB_COMPLETED: 'ai_job_complete',
  AI_JOB_FAILED: 'ai_job_failed',
} as const;

export class CopilotEvents {
  /**
   * Broadcast job creation event
   */
  emitJobCreated(jobId: string, userId: string, projectId: string, prompt: string) {
    const payload = {
      jobId,
      projectId,
      userId,
      type: 'ai_copilot_planning',
      prompt,
      status: 'QUEUED',
      progress: 0,
      timestamp: new Date().toISOString(),
    };

    logger.debug({ jobId, projectId }, 'Emitting AI_JOB_CREATED realtime event');
    realtimeService.publish('AI_JOB_CREATED', `user:${userId}`, payload);
    realtimeService.publish('AI_JOB_CREATED', `project:${projectId}`, payload);
    realtimeService.publish('job_created', `user:${userId}`, payload);
    realtimeService.publish('job_created', `project:${projectId}`, payload);
    realtimeService.publish('job_created', `job:${jobId}`, payload);
    realtimeService.notifyAdminJobEvent('job_created', payload, 'admin:ai');
  }

  /**
   * Broadcast job progress event
   */
  emitJobProgress(jobId: string, userId: string, projectId: string, progress: number, step: string) {
    const payload = {
      jobId,
      projectId,
      userId,
      progress,
      step,
      status: 'RUNNING',
      timestamp: new Date().toISOString(),
    };

    logger.debug({ jobId, progress, step }, 'Emitting AI_JOB_PROGRESS realtime event');
    realtimeService.publish('AI_JOB_PROGRESS', `user:${userId}`, payload);
    realtimeService.publish('AI_JOB_PROGRESS', `project:${projectId}`, payload);
    realtimeService.notifyAiJobProgress(jobId, userId, progress, step, projectId);
  }

  /**
   * Broadcast job completed event with plan payload
   */
  emitJobCompleted(jobId: string, userId: string, projectId: string, plan: EditorCommandPlan) {
    const payload = {
      jobId,
      projectId,
      userId,
      planId: plan.planId,
      commandsCount: plan.commands.length,
      explanation: plan.explanation,
      status: 'COMPLETED',
      progress: 100,
      timestamp: new Date().toISOString(),
    };

    logger.info({ jobId, planId: plan.planId }, 'Emitting AI_JOB_COMPLETED realtime event');
    realtimeService.publish('AI_JOB_COMPLETED', `user:${userId}`, payload);
    realtimeService.publish('AI_JOB_COMPLETED', `project:${projectId}`, payload);
    realtimeService.notifyAiJobComplete(jobId, userId, payload, plan.metadata?.cost, projectId);
  }

  /**
   * Broadcast job failed event
   */
  emitJobFailed(jobId: string, userId: string, projectId: string, error: string) {
    const payload = {
      jobId,
      projectId,
      userId,
      error,
      status: 'FAILED',
      timestamp: new Date().toISOString(),
    };

    logger.warn({ jobId, error }, 'Emitting AI_JOB_FAILED realtime event');
    realtimeService.publish('AI_JOB_FAILED', `user:${userId}`, payload);
    realtimeService.publish('AI_JOB_FAILED', `project:${projectId}`, payload);
    realtimeService.notifyAiJobFailed(jobId, userId, error, projectId);
  }
}

export const copilotEvents = new CopilotEvents();
