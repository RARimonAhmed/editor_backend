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

export class AIJobController {
  /**
   * POST /v1/ai/jobs
   * Submit an asynchronous AI job
   */
  async createJob(req: FastifyRequest, reply: FastifyReply) {
    const userId = req.user!.userId;
    const body = createAIJobSchema.parse(req.body);

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
      createSuccessResponse(
        {
          job,
          isReplay,
        },
        { message: statusCode === 202 ? 'AI job enqueued for asynchronous execution' : 'Idempotent AI job retrieved' }
      )
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

    return reply.status(200).send(createSuccessResponse({ job }));
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
      createSuccessResponse({ job }, { message: 'AI job successfully cancelled' })
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
      createSuccessResponse({ job }, { message: 'AI job successfully re-queued for execution' })
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
