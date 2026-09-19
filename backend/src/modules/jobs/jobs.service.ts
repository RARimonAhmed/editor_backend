import { v4 as uuidv4 } from 'uuid';
import { MediaJob, RenderExportPayload } from './jobs.types.js';
import { jobQueue } from '../../services/queue/index.js';
import { db } from '../../database/client.js';
import { NotFoundError, ForbiddenError } from '../../core/errors.js';
import { logger } from '../../core/logger.js';

const mockJobs = new Map<string, MediaJob>();

export class JobsService {
  async createRenderJob(userId: string, payload: RenderExportPayload): Promise<MediaJob> {
    const id = uuidv4();
    const now = new Date().toISOString();

    const job: MediaJob = {
      id,
      userId,
      projectId: payload.projectId,
      jobType: 'render_export',
      status: 'queued',
      progress: 0,
      creditCost: 10,
      payload: payload as unknown as Record<string, unknown>,
      createdAt: now,
      updatedAt: now,
    };

    mockJobs.set(id, job);

    try {
      if (await db.isHealthy()) {
        await db.query(
          `INSERT INTO jobs (id, user_id, project_id, job_type, status, progress, credit_cost, payload)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8);`,
          [job.id, job.userId, job.projectId, job.jobType, job.status, job.progress, job.creditCost, JSON.stringify(job.payload)]
        );
      }
    } catch {
      // fallback
    }

    // Dispatch to background queue
    await jobQueue.add('render_export', { jobId: id, ...payload });

    logger.info({ jobId: id, userId, projectId: payload.projectId }, 'Render export job enqueued');
    return job;
  }

  async getJob(id: string, userId: string): Promise<MediaJob> {
    const job = mockJobs.get(id);
    if (!job) {
      throw new NotFoundError(`Job not found: ${id}`);
    }

    if (job.userId !== userId) {
      throw new ForbiddenError('You do not have permission to view this job');
    }

    return job;
  }

  async updateJobProgress(id: string, progress: number, status?: MediaJob['status'], result?: Record<string, unknown>) {
    const job = mockJobs.get(id);
    if (!job) return;

    job.progress = progress;
    if (status) job.status = status;
    if (result) job.result = result;
    job.updatedAt = new Date().toISOString();

    try {
      if (await db.isHealthy()) {
        await db.query(
          `UPDATE jobs SET progress = $1, status = COALESCE($2, status), result = COALESCE($3, result), updated_at = CURRENT_TIMESTAMP WHERE id = $4;`,
          [progress, status || null, result ? JSON.stringify(result) : null, id]
        );
      }
    } catch {
      // fallback
    }
  }

  async cancelJob(id: string, userId: string): Promise<MediaJob> {
    const job = await this.getJob(id, userId);
    job.status = 'cancelled';
    job.updatedAt = new Date().toISOString();
    return job;
  }
}

export const jobsService = new JobsService();
