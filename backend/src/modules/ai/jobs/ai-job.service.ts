import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import {
  AIJobRecord,
  AIJobStatus,
  CreateAIJobInput,
  ListAIJobsFilter,
  AIJobUsage,
} from './ai-job.types.js';
import { aiJobNotificationHub } from './ai-job.ws.js';
import { creditsService } from '../../credits/credits.service.js';
import { redisService } from '../../../services/redis/index.js';
import { jobQueue } from '../../../services/queue/index.js';
import { db } from '../../../database/client.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../../../core/errors.js';
import { logger } from '../../../core/logger.js';

// In-memory job repository for high-performance retrieval and test isolation
export const mockAIJobs = new Map<string, AIJobRecord>();
// Key: `${userId}:${idempotencyKey}` -> jobId
const idempotencyKeyMap = new Map<string, string>();
// Key: `${userId}:${type}:${fingerprint}` -> jobId for active deduplication
const activeFingerprintMap = new Map<string, string>();

export class AIJobService {
  /**
   * Estimates initial credit cost based on modality
   */
  private estimateCreditCost(type: string): number {
    switch (type) {
      case 'text_generation':
        return 1;
      case 'structured_json':
        return 2;
      case 'speech_to_text':
      case 'transcription':
        return 3;
      case 'text_to_speech':
      case 'generate_voice':
        return 2;
      case 'image_generation':
      case 'generate_image':
        return 5;
      case 'video_generation':
      case 'generate_video':
      case 'broll_generation':
        return 15;
      case 'music_generation':
      case 'generate_music':
        return 5;
      case 'sfx_generation':
      case 'generate_sfx':
        return 2;
      case 'generate_script':
        return 2;
      case 'embedding':
        return 1;
      case 'vision':
        return 3;
      case 'audio_analysis':
      case 'smart_cut':
        return 2;
      default:
        return 1;
    }
  }

  /**
   * Generates deterministic fingerprint for deduplication
   */
  private generateFingerprint(input: Record<string, unknown>): string {
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(input))
      .digest('hex')
      .slice(0, 32);
  }

  /**
   * Submits an asynchronous AI job with idempotency and deduplication
   */
  async createJob(userId: string, input: CreateAIJobInput): Promise<{ job: AIJobRecord; isReplay: boolean }> {
    const { type, input: payload, projectId, provider = 'fake', model, idempotencyKey, timeoutMs = 60000 } = input;

    // 1. Check Idempotency Key
    if (idempotencyKey) {
      const cacheKey = `ai:idempotency:${userId}:${idempotencyKey}`;
      let existingJobId = idempotencyKeyMap.get(`${userId}:${idempotencyKey}`);

      if (!existingJobId) {
        existingJobId = (await redisService.get(cacheKey)) || undefined;
      }

      if (existingJobId) {
        const existingJob = mockAIJobs.get(existingJobId);
        if (existingJob) {
          logger.info({ userId, jobId: existingJob.id, idempotencyKey }, 'Idempotent AI job replay detected');
          return { job: this.sanitizeJob(existingJob), isReplay: true };
        }
      }
    }

    // 2. Check Deduplication for currently Active Jobs (QUEUED or RUNNING)
    const fingerprint = this.generateFingerprint(payload);
    const dedupKey = `${userId}:${type}:${fingerprint}`;
    const activeJobId = activeFingerprintMap.get(dedupKey);

    if (activeJobId) {
      const activeJob = mockAIJobs.get(activeJobId);
      if (activeJob && (activeJob.status === 'QUEUED' || activeJob.status === 'RUNNING')) {
        logger.info({ userId, jobId: activeJob.id, type }, 'Duplicate active AI job detected; reusing existing job');
        return { job: this.sanitizeJob(activeJob), isReplay: true };
      }
    }

    // 3. Deduct estimated credits
    const estimatedCost = this.estimateCreditCost(type);
    await creditsService.deductCredits(userId, estimatedCost, `AI Job: ${type}`);

    // 4. Initialize AI Job Record
    const id = uuidv4();
    const now = new Date().toISOString();

    const jobRecord: AIJobRecord = {
      id,
      userId,
      projectId: projectId || null,
      type,
      status: 'QUEUED',
      progress: 0,
      input: payload,
      output: null,
      provider,
      model: model || null,
      usage: null,
      cost: estimatedCost,
      error: null,
      createdAt: now,
      startedAt: null,
      completedAt: null,
      idempotencyKey: idempotencyKey || null,
      timeoutMs,
    };

    // Store in memory
    mockAIJobs.set(id, jobRecord);
    activeFingerprintMap.set(dedupKey, id);

    if (idempotencyKey) {
      idempotencyKeyMap.set(`${userId}:${idempotencyKey}`, id);
      await redisService.set(`ai:idempotency:${userId}:${idempotencyKey}`, id, 86400); // 24h
    }

    // Persist to PostgreSQL if available
    try {
      if (await db.isHealthy()) {
        await db.query(
          `INSERT INTO ai_jobs (
            id, user_id, project_id, type, provider, model, status, progress, input, cost, idempotency_key, timeout_ms, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP);`,
          [
            jobRecord.id,
            jobRecord.userId,
            jobRecord.projectId,
            jobRecord.type,
            jobRecord.provider,
            jobRecord.model,
            jobRecord.status,
            jobRecord.progress,
            JSON.stringify(jobRecord.input),
            jobRecord.cost,
            jobRecord.idempotencyKey,
            jobRecord.timeoutMs,
          ]
        );
      }
    } catch (err) {
      logger.warn({ err, jobId: id }, 'Failed to persist ai_job to PostgreSQL, relying on memory queue');
    }

    // Broadcast QUEUED event via WebSocket / SSE
    aiJobNotificationHub.broadcastEvent({
      event: 'JOB_QUEUED',
      jobId: id,
      userId,
      projectId: jobRecord.projectId,
      type,
      status: 'QUEUED',
      progress: 0,
      cost: estimatedCost,
      timestamp: now,
    });

    // Enqueue to background queue
    const queueJob = await jobQueue.add('ai_job', {
      jobId: id,
      userId,
      projectId: jobRecord.projectId,
      type,
      input: payload,
      provider,
      model,
      timeoutMs,
    });
    (jobRecord as any).queueJobId = queueJob.id;

    logger.info({ jobId: id, userId, type, provider }, 'Asynchronous AI job successfully enqueued');
    return { job: this.sanitizeJob(jobRecord), isReplay: false };
  }

  /**
   * Retrieves single AI job ensuring privacy and ownership
   */
  async getJob(id: string, userId: string): Promise<AIJobRecord> {
    const job = mockAIJobs.get(id);
    if (!job) {
      throw new NotFoundError(`AI job not found: ${id}`);
    }

    if (job.userId !== userId) {
      throw new ForbiddenError('You do not have permission to view this AI job');
    }

    return this.sanitizeJob(job);
  }

  /**
   * Internal lookup without ownership restriction (for worker)
   */
  getJobInternal(id: string): AIJobRecord | undefined {
    return mockAIJobs.get(id);
  }

  /**
   * Lists AI jobs for a user with filtering and pagination
   */
  async listJobs(userId: string, filters: ListAIJobsFilter): Promise<{ jobs: AIJobRecord[]; total: number }> {
    let all = Array.from(mockAIJobs.values()).filter((j) => j.userId === userId);

    if (filters.status) {
      all = all.filter((j) => j.status === filters.status);
    }
    if (filters.type) {
      all = all.filter((j) => j.type === filters.type);
    }
    if (filters.projectId) {
      all = all.filter((j) => j.projectId === filters.projectId);
    }

    // Sort newest first
    all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = all.length;
    const offset = filters.offset || 0;
    const limit = filters.limit || 20;
    const paged = all.slice(offset, offset + limit).map((j) => this.sanitizeJob(j));

    return { jobs: paged, total };
  }

  /**
   * Cancels a queued or running AI job and refunds credits
   */
  async cancelJob(id: string, userId: string): Promise<AIJobRecord> {
    const rawJob = mockAIJobs.get(id);
    if (!rawJob) {
      throw new NotFoundError(`AI job not found: ${id}`);
    }

    if (rawJob.userId !== userId) {
      throw new ForbiddenError('You do not have permission to view this AI job');
    }

    if (rawJob.status === 'COMPLETED') {
      throw new ValidationError('Cannot cancel a completed AI job');
    }

    if (rawJob.status === 'CANCELLED') {
      return this.sanitizeJob(rawJob);
    }

    rawJob.status = 'CANCELLED';
    rawJob.completedAt = new Date().toISOString();
    const job = rawJob;

    // Cancel underlying job queue execution
    if ((job as any).queueJobId) {
      await jobQueue.cancelJob((job as any).queueJobId);
    }
    await jobQueue.cancelJob(id);

    // Refund credits
    if (job.cost > 0) {
      await creditsService.grantCredits(userId, job.cost, 'ai_refund', `Refund for cancelled AI job ${id}`);
      logger.info({ userId, jobId: id, refunded: job.cost }, 'Credits refunded for cancelled AI job');
    }

    // Remove from active deduplication
    const fingerprint = this.generateFingerprint(job.input);
    activeFingerprintMap.delete(`${userId}:${job.type}:${fingerprint}`);

    // Persist to DB
    try {
      if (await db.isHealthy()) {
        await db.query(
          `UPDATE ai_jobs SET status = 'CANCELLED', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1;`,
          [id]
        );
      }
    } catch {
      // fallback
    }

    // Broadcast CANCELLED event
    aiJobNotificationHub.broadcastEvent({
      event: 'JOB_CANCELLED',
      jobId: id,
      userId,
      projectId: job.projectId,
      type: job.type,
      status: 'CANCELLED',
      progress: job.progress,
      timestamp: new Date().toISOString(),
    });

    return this.sanitizeJob(job);
  }

  /**
   * Retries a failed or cancelled AI job
   */
  async retryJob(id: string, userId: string): Promise<AIJobRecord> {
    const job = await this.getJob(id, userId);

    if (job.status === 'RUNNING' || job.status === 'QUEUED') {
      return job;
    }

    // Re-deduct credits if it was previously refunded
    if (job.status === 'CANCELLED' || job.status === 'FAILED') {
      await creditsService.deductCredits(userId, job.cost, `AI Job Retry: ${job.type}`);
    }

    job.status = 'QUEUED';
    job.progress = 0;
    job.error = null;
    job.output = null;
    job.startedAt = null;
    job.completedAt = null;

    // Persist to DB
    try {
      if (await db.isHealthy()) {
        await db.query(
          `UPDATE ai_jobs SET status = 'QUEUED', progress = 0, error = NULL, output = NULL, completed_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1;`,
          [id]
        );
      }
    } catch {
      // fallback
    }

    // Broadcast QUEUED event
    aiJobNotificationHub.broadcastEvent({
      event: 'JOB_QUEUED',
      jobId: id,
      userId,
      projectId: job.projectId,
      type: job.type,
      status: 'QUEUED',
      progress: 0,
      timestamp: new Date().toISOString(),
    });

    // Re-enqueue
    await jobQueue.add('ai_job', {
      jobId: id,
      userId,
      projectId: job.projectId,
      type: job.type,
      input: job.input,
      provider: job.provider,
      model: job.model,
      timeoutMs: job.timeoutMs,
    });

    return this.sanitizeJob(job);
  }

  /**
   * Updates progress and step during execution
   */
  async updateProgress(id: string, progress: number, currentStep?: string) {
    const job = mockAIJobs.get(id);
    if (!job || job.status === 'CANCELLED') return;

    job.status = 'RUNNING';
    job.progress = Math.min(100, Math.max(0, progress));
    if (!job.startedAt) {
      job.startedAt = new Date().toISOString();
    }

    try {
      if (await db.isHealthy()) {
        await db.query(
          `UPDATE ai_jobs SET status = 'RUNNING', progress = $1, started_at = COALESCE(started_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE id = $2;`,
          [job.progress, id]
        );
      }
    } catch {
      // fallback
    }

    aiJobNotificationHub.broadcastEvent({
      event: 'JOB_PROGRESS',
      jobId: id,
      userId: job.userId,
      projectId: job.projectId,
      type: job.type,
      status: 'RUNNING',
      progress: job.progress,
      currentStep,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Marks job as completed with normalized result
   */
  async completeJob(id: string, output: Record<string, unknown>, usage?: AIJobUsage, finalCost?: number) {
    const job = mockAIJobs.get(id);
    if (!job || job.status === 'CANCELLED') return;

    const now = new Date().toISOString();
    job.status = 'COMPLETED';
    job.progress = 100;
    job.output = output;
    job.completedAt = now;
    if (usage) job.usage = usage;
    if (finalCost !== undefined) job.cost = finalCost;

    // Remove from active deduplication map
    const fingerprint = this.generateFingerprint(job.input);
    activeFingerprintMap.delete(`${job.userId}:${job.type}:${fingerprint}`);

    try {
      if (await db.isHealthy()) {
        await db.query(
          `UPDATE ai_jobs SET status = 'COMPLETED', progress = 100, output = $1, usage = $2, cost = $3, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $4;`,
          [JSON.stringify(output), JSON.stringify(usage || {}), job.cost, id]
        );
      }
    } catch {
      // fallback
    }

    aiJobNotificationHub.broadcastEvent({
      event: 'JOB_COMPLETED',
      jobId: id,
      userId: job.userId,
      projectId: job.projectId,
      type: job.type,
      status: 'COMPLETED',
      progress: 100,
      output,
      usage: job.usage,
      cost: job.cost,
      timestamp: now,
    });

    logger.info({ jobId: id, userId: job.userId, type: job.type }, 'AI job successfully completed');
  }

  /**
   * Marks job as failed and refunds credits if appropriate
   */
  async failJob(id: string, error: string, refund = true) {
    const job = mockAIJobs.get(id);
    if (!job || job.status === 'CANCELLED') return;

    const now = new Date().toISOString();
    job.status = 'FAILED';
    job.error = error;
    job.completedAt = now;

    // Remove from active deduplication
    const fingerprint = this.generateFingerprint(job.input);
    activeFingerprintMap.delete(`${job.userId}:${job.type}:${fingerprint}`);

    if (refund && job.cost > 0) {
      await creditsService.grantCredits(job.userId, job.cost, 'ai_refund', `Refund for failed AI job ${id}`);
    }

    try {
      if (await db.isHealthy()) {
        await db.query(
          `UPDATE ai_jobs SET status = 'FAILED', error = $1, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $2;`,
          [error, id]
        );
      }
    } catch {
      // fallback
    }

    aiJobNotificationHub.broadcastEvent({
      event: 'JOB_FAILED',
      jobId: id,
      userId: job.userId,
      projectId: job.projectId,
      type: job.type,
      status: 'FAILED',
      progress: job.progress,
      error,
      timestamp: now,
    });

    logger.error({ jobId: id, userId: job.userId, error }, 'AI job execution failed');
  }

  /**
   * Sanitizes job object before returning to client (ZERO secrets exposure)
   */
  private sanitizeJob(job: AIJobRecord): AIJobRecord {
    return {
      id: job.id,
      userId: job.userId,
      projectId: job.projectId,
      type: job.type,
      status: job.status,
      progress: job.progress,
      input: job.input,
      output: job.output,
      provider: job.provider,
      model: job.model,
      usage: job.usage,
      cost: job.cost,
      error: job.error,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
    };
  }
}

export const aiJobService = new AIJobService();
