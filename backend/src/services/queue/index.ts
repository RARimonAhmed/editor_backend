import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../core/logger.js';

export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface JobOptions {
  maxAttempts?: number;
  backoffMs?: number;
  timeoutMs?: number;
  jobId?: string;
  deduplicationKey?: string;
}

export interface Job<T = any> {
  id: string;
  type: string;
  data: T;
  createdAt: Date;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  backoffMs: number;
  timeoutMs?: number;
  deduplicationKey?: string;
  progress: number;
  currentStep?: string;
  error?: string;
  stackTrace?: string;
  isDeadLetter?: boolean;
  deadLetteredAt?: Date;
  result?: any;
  startedAt?: Date;
  completedAt?: Date;
  cancelledAt?: Date;
}

export type JobProcessor<T = any, R = any> = (job: Job<T>) => Promise<R>;

export interface IJobQueue {
  add<T>(type: string, data: T, options?: JobOptions): Promise<Job<T>>;
  process<T, R>(type: string, processor: JobProcessor<T, R>): void;
  getJob(id: string): Promise<Job | null>;
  cancelJob(id: string): Promise<boolean>;
  retryJob(id: string): Promise<Job | null>;
  retryDeadLetterJob(id: string): Promise<Job | null>;
  getDeadLetterJobs(): Promise<Job[]>;
  getAllJobs(): Promise<Job[]>;
  updateProgress(id: string, progress: number, currentStep?: string, extra?: Record<string, any>): Promise<void>;
  recoverStalledJobs(type?: string): Promise<number>;
  restartWorker<T, R>(type: string, newProcessor?: JobProcessor<T, R>): Promise<void>;
  on(event: string, listener: (...args: any[]) => void): void;
  off(event: string, listener: (...args: any[]) => void): void;
}

export class MemoryJobQueue extends EventEmitter implements IJobQueue {
  private jobs = new Map<string, Job>();
  private processors = new Map<string, JobProcessor>();
  private deadLetterJobs = new Map<string, Job>();

  async add<T>(type: string, data: T, options?: JobOptions): Promise<Job<T>> {
    const id = options?.jobId || uuidv4();

    // Check idempotency / deduplication
    if (options?.jobId && this.jobs.has(options.jobId)) {
      const existing = this.jobs.get(options.jobId)!;
      if (existing.status === 'queued' || existing.status === 'processing') {
        logger.info({ jobId: id, type }, 'Idempotent duplicate job returned');
        return existing;
      }
    }
    if (options?.deduplicationKey) {
      for (const existing of this.jobs.values()) {
        if (
          existing.type === type &&
          existing.deduplicationKey === options.deduplicationKey &&
          (existing.status === 'queued' || existing.status === 'processing')
        ) {
          logger.info({ jobId: existing.id, deduplicationKey: options.deduplicationKey }, 'Deduplicated job reused');
          return existing;
        }
      }
    }

    const job: Job<T> = {
      id,
      type,
      data,
      createdAt: new Date(),
      status: 'queued',
      attempts: 0,
      maxAttempts: options?.maxAttempts ?? 3,
      backoffMs: options?.backoffMs ?? 50,
      timeoutMs: options?.timeoutMs,
      deduplicationKey: options?.deduplicationKey,
      progress: 0,
    };

    this.jobs.set(job.id, job);
    logger.info({ jobId: job.id, type, maxAttempts: job.maxAttempts }, 'Job enqueued');

    const processor = this.processors.get(type);
    if (processor) {
      setTimeout(() => this.executeJob(job, processor), 5);
    }

    return job;
  }

  process<T, R>(type: string, processor: JobProcessor<T, R>): void {
    this.processors.set(type, processor as JobProcessor);
    logger.info({ type }, 'Registered background job processor');

    // Run any queued or pending jobs for this type
    for (const job of this.jobs.values()) {
      if (job.type === type && (job.status === 'queued' || job.status === 'processing')) {
        setTimeout(() => this.executeJob(job, processor as JobProcessor), 5);
      }
    }
  }

  async getJob(id: string): Promise<Job | null> {
    return this.jobs.get(id) || null;
  }

  async cancelJob(id: string): Promise<boolean> {
    const job = this.jobs.get(id);
    if (!job) return false;

    if (job.status === 'completed' || job.status === 'cancelled') {
      return false;
    }

    job.status = 'cancelled';
    job.cancelledAt = new Date();
    logger.warn({ jobId: id, type: job.type }, 'Job cancelled by user/system');

    this.emit('cancelled', job);
    this.emit(`cancelled:${id}`, job);
    return true;
  }

  async retryJob(id: string): Promise<Job | null> {
    const job = this.jobs.get(id);
    if (!job) return null;

    if (job.status !== 'failed') {
      return job;
    }

    job.status = 'queued';
    job.attempts = 0;
    job.isDeadLetter = false;
    job.error = undefined;
    job.stackTrace = undefined;
    job.deadLetteredAt = undefined;
    this.deadLetterJobs.delete(id);

    logger.info({ jobId: id, type: job.type }, 'Retrying failed/dead-letter job');
    const processor = this.processors.get(job.type);
    if (processor) {
      setTimeout(() => this.executeJob(job, processor), 5);
    }

    return job;
  }

  async retryDeadLetterJob(id: string): Promise<Job | null> {
    return this.retryJob(id);
  }

  async getDeadLetterJobs(): Promise<Job[]> {
    return Array.from(this.deadLetterJobs.values());
  }

  async getAllJobs(): Promise<Job[]> {
    return Array.from(this.jobs.values());
  }

  async recoverStalledJobs(type?: string): Promise<number> {
    let recoveredCount = 0;
    for (const job of this.jobs.values()) {
      if (type && job.type !== type) continue;

      if (job.status === 'processing' || job.status === 'queued') {
        const processor = this.processors.get(job.type);
        if (processor) {
          job.status = 'queued';
          recoveredCount++;
          logger.info({ jobId: job.id, type: job.type }, 'Recovering stalled/queued job after worker restart');
          setTimeout(() => this.executeJob(job, processor), 5);
        }
      }
    }
    return recoveredCount;
  }

  async restartWorker<T, R>(type: string, newProcessor?: JobProcessor<T, R>): Promise<void> {
    logger.info({ type }, 'Restarting queue worker');
    this.processors.delete(type);
    if (newProcessor) {
      this.processors.set(type, newProcessor as JobProcessor);
      await this.recoverStalledJobs(type);
    }
  }

  async updateProgress(id: string, progress: number, currentStep?: string, extra?: Record<string, any>): Promise<void> {
    const job = this.jobs.get(id);
    if (!job) return;

    if (job.status === 'cancelled') return;

    job.progress = Math.min(100, Math.max(0, progress));
    if (currentStep) job.currentStep = currentStep;
    if (extra && job.result) {
      job.result = { ...job.result, ...extra };
    } else if (extra) {
      job.result = extra;
    }

    this.emit('progress', job);
    this.emit(`progress:${id}`, job);
  }

  private async executeJob(job: Job, processor: JobProcessor) {
    if (job.status === 'cancelled') {
      return;
    }

    job.status = 'processing';
    job.startedAt = new Date();
    job.attempts++;
    logger.info({ jobId: job.id, type: job.type, attempt: job.attempts, maxAttempts: job.maxAttempts }, 'Executing background job');

    this.emit('started', job);
    this.emit(`started:${job.id}`, job);

    try {
      let result: any;
      if (job.timeoutMs && job.timeoutMs > 0) {
        let timeoutHandle: any;
        const timeoutPromise = new Promise((_, reject) => {
          timeoutHandle = setTimeout(() => {
            reject(new Error(`Job execution timed out after ${job.timeoutMs}ms`));
          }, job.timeoutMs);
        });

        try {
          result = await Promise.race([processor(job), timeoutPromise]);
        } finally {
          clearTimeout(timeoutHandle);
        }
      } else {
        result = await processor(job);
      }

      if ((job.status as JobStatus) === 'cancelled') {
        return;
      }

      job.status = 'completed';
      job.progress = 100;
      job.completedAt = new Date();
      if (result !== undefined) {
        job.result = result;
      }

      logger.info({ jobId: job.id, type: job.type }, 'Job successfully completed');
      this.emit('completed', job);
      this.emit(`completed:${job.id}`, job);
    } catch (error) {
      if ((job.status as JobStatus) === 'cancelled') {
        return;
      }

      const errMsg = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      job.error = errMsg;
      job.stackTrace = stack;

      logger.error(
        { jobId: job.id, type: job.type, attempt: job.attempts, maxAttempts: job.maxAttempts, error: errMsg },
        'Job execution attempt failed'
      );

      if (job.attempts < job.maxAttempts) {
        job.status = 'queued';
        const delayMs = job.backoffMs * Math.pow(2, job.attempts - 1);
        logger.info({ jobId: job.id, delayMs, nextAttempt: job.attempts + 1 }, 'Scheduling job retry with exponential backoff');
        this.emit('retry', job);
        this.emit(`retry:${job.id}`, job);

        setTimeout(() => this.executeJob(job, processor), delayMs);
      } else {
        job.status = 'failed';
        job.isDeadLetter = true;
        job.deadLetteredAt = new Date();
        this.deadLetterJobs.set(job.id, job);

        logger.error({ jobId: job.id, type: job.type }, 'Job exceeded max attempts - routed to Dead-Letter Queue (DLQ)');
        this.emit('failed', job);
        this.emit('dead_letter', job);
        this.emit(`failed:${job.id}`, job);
      }
    }
  }
}

import { BullMQJobQueue } from './bullmq-queue.js';

export const jobQueue: IJobQueue = new BullMQJobQueue();
