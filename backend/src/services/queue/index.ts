import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../core/logger.js';

export interface Job<T = any> {
  id: string;
  type: string;
  data: T;
  createdAt: Date;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  attempts: number;
}

export type JobProcessor<T = any, R = any> = (job: Job<T>) => Promise<R>;

export interface IJobQueue {
  add<T>(type: string, data: T): Promise<Job<T>>;
  process<T, R>(type: string, processor: JobProcessor<T, R>): void;
  getJob(id: string): Promise<Job | null>;
}

export class MemoryJobQueue implements IJobQueue {
  private jobs = new Map<string, Job>();
  private processors = new Map<string, JobProcessor>();

  async add<T>(type: string, data: T): Promise<Job<T>> {
    const job: Job<T> = {
      id: uuidv4(),
      type,
      data,
      createdAt: new Date(),
      status: 'queued',
      attempts: 0,
    };

    this.jobs.set(job.id, job);
    logger.info({ jobId: job.id, type }, 'Job enqueued');

    // Trigger async execution if a processor is registered
    const processor = this.processors.get(type);
    if (processor) {
      setTimeout(() => this.executeJob(job, processor), 10);
    }

    return job;
  }

  process<T, R>(type: string, processor: JobProcessor<T, R>): void {
    this.processors.set(type, processor as JobProcessor);
    logger.info({ type }, 'Registered background job processor');
  }

  async getJob(id: string): Promise<Job | null> {
    return this.jobs.get(id) || null;
  }

  private async executeJob(job: Job, processor: JobProcessor) {
    job.status = 'processing';
    job.attempts++;
    logger.info({ jobId: job.id, type: job.type }, 'Executing background job');

    try {
      await processor(job);
      job.status = 'completed';
      logger.info({ jobId: job.id, type: job.type }, 'Job successfully completed');
    } catch (error) {
      job.status = 'failed';
      logger.error({ jobId: job.id, type: job.type, error }, 'Job execution failed');
    }
  }
}

export const jobQueue: IJobQueue = new MemoryJobQueue();
