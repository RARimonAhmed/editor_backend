import { FastifyRequest, FastifyReply } from 'fastify';
import { copilotService } from './copilot.service.js';
import { copilotStore } from './copilot.store.js';
import { copilotRequestSchema } from './copilot.schema.js';
import { createSuccessResponse } from '../../../core/response.js';
import { AuthenticationError, ValidationError } from '../../../core/errors.js';
import { z } from 'zod';

const applyPlanParamsSchema = z.object({
  planId: z.string().uuid('Valid plan UUID required'),
});

const applyPlanBodySchema = z
  .object({
    targetVersion: z.number().int().min(1).optional(),
  })
  .optional();

export class CopilotController {
  /**
   * Helper to safely extract authenticated user ID
   */
  private getUserId(request: FastifyRequest): string {
    const userId =
      request.user?.userId ||
      (request as any).user?.id ||
      (request.headers['x-user-id'] as string);

    if (!userId) {
      throw new AuthenticationError('User authentication required for AI Copilot operations');
    }

    return userId;
  }

  /**
   * POST /api/v1/ai/copilot
   * Primary pipeline endpoint:
   * authenticate -> authorize project -> reserve credits -> AI provider -> validate -> store plan -> realtime -> return plan
   */
  async generatePlan(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = this.getUserId(request);

    const parseResult = copilotRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid Copilot request', parseResult.error.format());
    }

    const plan = await copilotService.generateCommandPlan(userId, parseResult.data);

    reply.status(200).send(createSuccessResponse(plan));
  }

  /**
   * GET /api/v1/ai/copilot/:planId
   * Retrieve generated command plan by ID
   */
  async getPlan(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = this.getUserId(request);
    const { planId } = request.params as { planId: string };

    const plan = await copilotService.getPlan(planId, userId);
    reply.status(200).send(createSuccessResponse(plan));
  }

  /**
   * POST /api/v1/ai/copilot/:planId/apply
   * Safely apply plan to project timeline with strict version mismatch protection
   */
  async applyPlan(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = this.getUserId(request);
    const { planId } = request.params as { planId: string };

    const paramCheck = applyPlanParamsSchema.safeParse({ planId });
    if (!paramCheck.success) {
      throw new ValidationError('Invalid plan ID parameter', paramCheck.error.format());
    }

    const bodyCheck = applyPlanBodySchema.safeParse(request.body || {});
    const targetVersion = bodyCheck.success ? bodyCheck.data?.targetVersion : undefined;

    const appliedPlan = await copilotService.applyPlan(planId, userId, targetVersion);
    reply.status(200).send(createSuccessResponse(appliedPlan));
  }

  /**
   * GET /api/v1/ai/copilot/metrics
   * Telemetry metrics for admin dashboard
   */
  async getMetrics(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const metrics = await copilotStore.getMetrics();
    reply.status(200).send(createSuccessResponse(metrics));
  }
}

export const copilotController = new CopilotController();
