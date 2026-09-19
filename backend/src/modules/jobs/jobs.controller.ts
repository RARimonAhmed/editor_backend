import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { jobsService } from './jobs.service.js';
import { createSuccessResponse } from '../../core/response.js';
import { ValidationError } from '../../core/errors.js';

const renderJobSchema = z.object({
  projectId: z.string().uuid('Valid project ID required'),
  format: z.enum(['mp4', 'mov', 'webm']).default('mp4'),
  resolutionWidth: z.number().int().positive().default(1920),
  resolutionHeight: z.number().int().positive().default(1080),
  framerate: z.number().positive().default(30.0),
  bitrateKbps: z.number().int().positive().optional(),
});

export class JobsController {
  async createRenderJob(request: FastifyRequest, reply: FastifyReply) {
    const parseResult = renderJobSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid render job payload', parseResult.error.format());
    }

    const userId = request.user!.userId;
    const job = await jobsService.createRenderJob(userId, parseResult.data);
    return reply.status(202).send(createSuccessResponse(job));
  }

  async getJob(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const userId = request.user!.userId;
    const job = await jobsService.getJob(request.params.id, userId);
    return reply.status(200).send(createSuccessResponse(job));
  }

  async cancelJob(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const userId = request.user!.userId;
    const job = await jobsService.cancelJob(request.params.id, userId);
    return reply.status(200).send(createSuccessResponse(job));
  }

  async getDeadLetterJobs(_request: FastifyRequest, reply: FastifyReply) {
    const jobs = await jobsService.getDeadLetterJobs();
    return reply.status(200).send(createSuccessResponse(jobs, { total: jobs.length }));
  }

  async retryJob(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const userId = request.user!.userId;
    const job = await jobsService.retryJob(request.params.id, userId);
    return reply.status(200).send(createSuccessResponse(job));
  }
}

export const jobsController = new JobsController();
