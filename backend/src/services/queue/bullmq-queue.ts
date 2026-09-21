import { EventEmitter } from 'events';
import { Queue, Worker, Job as BullJob } from 'bullmq';
import { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../../config/env.js';
import { logger } from '../../core/logger.js';
import { IJobQueue, Job, JobOptions, JobProcessor, JobStatus, MemoryJobQueue } from './index.js';

export class BullMQJobQueue extends EventEmitter implements IJobQueue {
  private redisConnection: Redis | null = null;
  private queues = new Map<string, Queue>();
  private workers = new Map<string, Worker>();
  private memoryFallback: MemoryJobQueue | null = null;
  private fallbackActive = false;
  private trackedJobs = new Map<string, Job>();

  constructor() {
    super();

    if (env.NODE_ENV === 'test' || env.REDIS_ENABLE_FALLBACK) {
      logger.info('Using in-memory queue fallback for tests / local development');
      this.activateFallback();
      return;
    }

    try {
      this.redisConnection = new Redis(env.REDIS_URL, {
        maxRetriesPerRequest: null, // Required by BullMQ
        retryStrategy: (times) => {
          if (times > 3) {
            logger.warn('Redis connection failed, activating in-memory queue fallback');
            this.activateFallback();
            return null;
          }
          return Math.min(times * 200, 1000);
        },
      });

      this.redisConnection.on('error', (err) => {
        logger.error({ err }, 'Redis error in BullMQ connection');
        if (!this.fallbackActive) {
          this.activateFallback();
        }
      });
    } catch (err) {
      logger.warn({ err }, 'Could not initialize BullMQ Redis connection, using in-memory queue');
      this.activateFallback();
    }
  }

  private activateFallback() {
    if (!this.fallbackActive) {
      this.fallbackActive = true;
      this.memoryFallback = new MemoryJobQueue();
      // Forward events
      this.memoryFallback.on('started', (j) => this.emit('started', j));
      this.memoryFallback.on('progress', (j) => this.emit('progress', j));
      this.memoryFallback.on('completed', (j) => this.emit('completed', j));
      this.memoryFallback.on('failed', (j) => this.emit('failed', j));
      this.memoryFallback.on('cancelled', (j) => this.emit('cancelled', j));
      this.memoryFallback.on('retry', (j) => this.emit('retry', j));
    }
  }

  private getOrCreateQueue(type: string): Queue {
    let q = this.queues.get(type);
    if (!q) {
      q = new Queue(type, {
        connection: this.redisConnection!,
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 50,
          },
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      });
      this.queues.set(type, q);
    }
    return q;
  }

  async add<T>(type: string, data: T, options?: JobOptions): Promise<Job<T>> {
    if (this.fallbackActive && this.memoryFallback) {
      return this.memoryFallback.add(type, data, options);
    }

    const jobId = options?.jobId || uuidv4();
    const genericJob: Job<T> = {
      id: jobId,
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

    this.trackedJobs.set(jobId, genericJob);

    try {
      const q = this.getOrCreateQueue(type);
      const bullJob = await q.add(type, data, {
        jobId,
        attempts: genericJob.maxAttempts,
        backoff: {
          type: 'exponential',
          delay: genericJob.backoffMs,
        },
      });

      logger.info({ jobId: bullJob.id, type }, 'BullMQ job enqueued');
      return genericJob;
    } catch (err) {
      logger.warn({ err }, 'Failed to enqueue to BullMQ, falling back to memory queue');
      this.activateFallback();
      return this.memoryFallback!.add(type, data, options);
    }
  }

  process<T, R>(type: string, processor: JobProcessor<T, R>): void {
    if (this.fallbackActive && this.memoryFallback) {
      this.memoryFallback.process(type, processor);
      return;
    }

    try {
      const worker = new Worker(
        type,
        async (bullJob: BullJob) => {
          const tracked = this.trackedJobs.get(bullJob.id!) || {
            id: bullJob.id!,
            type,
            data: bullJob.data,
            createdAt: new Date(bullJob.timestamp),
            status: 'processing',
            attempts: bullJob.attemptsMade + 1,
            maxAttempts: bullJob.opts.attempts || 3,
            backoffMs: 50,
            progress: 0,
          };

          tracked.status = 'processing';
          tracked.startedAt = new Date();
          tracked.attempts = bullJob.attemptsMade + 1;
          this.emit('started', tracked);

          try {
            const result = await processor(tracked);
            tracked.status = 'completed';
            tracked.progress = 100;
            tracked.completedAt = new Date();
            tracked.result = result;
            this.emit('completed', tracked);
            return result;
          } catch (err) {
            tracked.error = err instanceof Error ? err.message : String(err);
            tracked.stackTrace = err instanceof Error ? err.stack : undefined;
            if (tracked.attempts >= tracked.maxAttempts) {
              tracked.status = 'failed';
              tracked.isDeadLetter = true;
              this.emit('failed', tracked);
            } else {
              this.emit('retry', tracked);
            }
            throw err;
          }
        },
        {
          connection: this.redisConnection!,
          concurrency: env.WORKER_CONCURRENCY || 4,
        }
      );

      this.workers.set(type, worker);
      logger.info({ type }, 'BullMQ Worker initialized and listening');
    } catch (err) {
      logger.warn({ err }, 'Failed to initialize BullMQ worker, switching to in-memory processor');
      this.activateFallback();
      this.memoryFallback!.process(type, processor);
    }
  }

  async getJob(id: string): Promise<Job | null> {
    if (this.fallbackActive && this.memoryFallback) {
      return this.memoryFallback.getJob(id);
    }
    return this.trackedJobs.get(id) || null;
  }

  async cancelJob(id: string): Promise<boolean> {
    if (this.fallbackActive && this.memoryFallback) {
      return this.memoryFallback.cancelJob(id);
    }

    const job = this.trackedJobs.get(id);
    if (!job) return false;

    job.status = 'cancelled';
    job.cancelledAt = new Date();
    this.emit('cancelled', job);
    this.emit(`cancelled:${id}`, job);
    return true;
  }

  async retryJob(id: string): Promise<Job | null> {
    if (this.fallbackActive && this.memoryFallback) {
      return this.memoryFallback.retryJob(id);
    }

    const job = this.trackedJobs.get(id);
    if (!job || job.status !== 'failed') return job || null;

    job.status = 'queued';
    job.attempts = 0;
    job.isDeadLetter = false;
    job.error = undefined;

    const q = this.queues.get(job.type);
    if (q) {
      await q.add(job.type, job.data, { jobId: job.id });
    }

    return job;
  }

  async retryDeadLetterJob(id: string): Promise<Job | null> {
    if (this.fallbackActive && this.memoryFallback) {
      return this.memoryFallback.retryDeadLetterJob(id);
    }
    return this.retryJob(id);
  }

  async getDeadLetterJobs(): Promise<Job[]> {
    if (this.fallbackActive && this.memoryFallback) {
      return this.memoryFallback.getDeadLetterJobs();
    }
    return Array.from(this.trackedJobs.values()).filter((j) => j.isDeadLetter);
  }

  async getAllJobs(): Promise<Job[]> {
    if (this.fallbackActive && this.memoryFallback) {
      return this.memoryFallback.getAllJobs();
    }
    return Array.from(this.trackedJobs.values());
  }

  async recoverStalledJobs(type?: string): Promise<number> {
    if (this.fallbackActive && this.memoryFallback) {
      return this.memoryFallback.recoverStalledJobs(type);
    }
    let recoveredCount = 0;
    for (const job of this.trackedJobs.values()) {
      if (type && job.type !== type) continue;
      if (job.status === 'processing' || job.status === 'queued') {
        const q = this.queues.get(job.type);
        if (q) {
          job.status = 'queued';
          recoveredCount++;
          await q.add(job.type, job.data, { jobId: job.id });
        }
      }
    }
    return recoveredCount;
  }

  async restartWorker<T, R>(type: string, newProcessor?: JobProcessor<T, R>): Promise<void> {
    if (this.fallbackActive && this.memoryFallback) {
      return this.memoryFallback.restartWorker(type, newProcessor);
    }
    const existing = this.workers.get(type);
    if (existing) {
      await existing.close();
      this.workers.delete(type);
    }
    if (newProcessor) {
      this.process(type, newProcessor);
      await this.recoverStalledJobs(type);
    }
  }

  async updateProgress(id: string, progress: number, currentStep?: string, extra?: Record<string, any>): Promise<void> {
    if (this.fallbackActive && this.memoryFallback) {
      return this.memoryFallback.updateProgress(id, progress, currentStep, extra);
    }

    const job = this.trackedJobs.get(id);
    if (!job) return;

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

  async close(): Promise<void> {
    for (const worker of this.workers.values()) {
      await worker.close();
    }
    for (const q of this.queues.values()) {
      await q.close();
    }
    if (this.redisConnection) {
      await this.redisConnection.quit();
    }
  }
}
