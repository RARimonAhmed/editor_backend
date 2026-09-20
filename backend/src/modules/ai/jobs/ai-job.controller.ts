import { FastifyRequest, FastifyReply } from 'fastify';
import { aiJobService } from './ai-job.service.js';
import { aiJobNotificationHub } from './ai-job.ws.js';
import {
  createAIJobSchema,
  getAIJobParamsSchema,
  listAIJobsQuerySchema,
  GetAIJobParams,
  ListAIJobsQuery,
} from './ai-job.schemas.js';
import { createSuccessResponse } from '../../../core/response.js';
import { AppError } from '../../../core/errors.js';

function formatJobResponse(job: any, extra: Record<string, any> = {}) {
  const statusLower = job.status === 'RUNNING' ? 'processing' : (job.status ? job.status.toLowerCase() : 'queued');
  const progressRatio = typeof job.progress === 'number' ? (job.progress > 1 ? job.progress / 100 : job.progress) : 0;

  const flutterFormatted = {
    id: job.id,
    jobId: job.id,
    type: job.type,
    status: statusLower,
    progress: progressRatio,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    input: job.input,
    result: job.output || null,
    providerKind: 'backend',
    applied: false,
    ...extra,
  };

  return {
    ...flutterFormatted,
    success: true,
    data: {
      job,
      ...flutterFormatted,
    },
    meta: {
      timestamp: new Date().toISOString(),
    },
  };
}

export class AIJobController {
  /**
   * POST /v1/ai/jobs
   * Submit an asynchronous AI job
   */
  async createJob(req: FastifyRequest, reply: FastifyReply) {
    const userId = req.user!.userId;
    const body = createAIJobSchema.parse(req.body);

    // Merge parameters into input if provided
    if (body.parameters && typeof body.parameters === 'object') {
      body.input = { ...body.parameters, ...body.input };
    }

    // Extract idempotency key from header if not in body
    const headerKey = req.headers['idempotency-key'] as string | undefined;
    if (headerKey && !body.idempotencyKey) {
      body.idempotencyKey = headerKey;
    }

    const { job, isReplay } = await aiJobService.createJob(userId, body);

    const statusCode = isReplay ? 200 : 202;
    if (isReplay) {
      reply.header('X-Idempotent-Replay', 'true');
    }

    return reply.status(statusCode).send(
      formatJobResponse(job, {
        isReplay,
        message: statusCode === 202 ? 'AI job enqueued for asynchronous execution' : 'Idempotent AI job retrieved',
      })
    );
  }

  /**
   * GET /v1/ai/jobs/:id
   * Fetch details of an AI job (never exposing provider secrets)
   */
  async getJob(req: FastifyRequest<{ Params: GetAIJobParams }>, reply: FastifyReply) {
    const userId = req.user!.userId;
    const { id } = getAIJobParamsSchema.parse(req.params);

    const job = await aiJobService.getJob(id, userId);

    return reply.status(200).send(formatJobResponse(job));
  }

  /**
   * POST /v1/ai/jobs/:id/cancel
   * Cancel an active or queued AI job and refund credits
   */
  async cancelJob(req: FastifyRequest<{ Params: GetAIJobParams }>, reply: FastifyReply) {
    const userId = req.user!.userId;
    const { id } = getAIJobParamsSchema.parse(req.params);

    const job = await aiJobService.cancelJob(id, userId);

    return reply.status(200).send(
      formatJobResponse(job, { message: 'AI job successfully cancelled' })
    );
  }

  /**
   * POST /v1/ai/jobs/:id/retry
   * Retry a failed or cancelled AI job
   */
  async retryJob(req: FastifyRequest<{ Params: GetAIJobParams }>, reply: FastifyReply) {
    const userId = req.user!.userId;
    const { id } = getAIJobParamsSchema.parse(req.params);

    const job = await aiJobService.retryJob(id, userId);

    return reply.status(200).send(
      formatJobResponse(job, { message: 'AI job successfully re-queued for execution' })
    );
  }

  /**
   * GET /v1/ai/jobs
   * List AI jobs with status, type, and pagination filters
   */
  async listJobs(req: FastifyRequest<{ Querystring: ListAIJobsQuery }>, reply: FastifyReply) {
    const userId = req.user!.userId;
    const query = listAIJobsQuerySchema.parse(req.query);

    const result = await aiJobService.listJobs(userId, query);

    return reply.status(200).send(
      createSuccessResponse({
        jobs: result.jobs,
        total: result.total,
        limit: query.limit,
        offset: query.offset,
      })
    );
  }

  /**
   * GET /v1/ai/jobs/:id/events
   * Realtime progress updates via Server-Sent Events (SSE)
   */
  async getJobEvents(req: FastifyRequest<{ Params: GetAIJobParams }>, reply: FastifyReply) {
    const userId = req.user!.userId;
    const { id } = getAIJobParamsSchema.parse(req.params);

    // Verify ownership
    const job = await aiJobService.getJob(id, userId);

    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.flushHeaders();

    // Initial event
    reply.raw.write(`data: ${JSON.stringify({ event: 'INITIAL_STATE', job })}\n\n`);

    const unsubscribe = aiJobNotificationHub.subscribeSSE(id, (event) => {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
      if (event.status === 'COMPLETED' || event.status === 'FAILED' || event.status === 'CANCELLED') {
        reply.raw.end();
      }
    });

    req.raw.on('close', () => {
      unsubscribe();
    });
  }
}

export const aiJobController = new AIJobController();
