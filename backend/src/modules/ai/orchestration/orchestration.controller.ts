import { FastifyRequest, FastifyReply } from 'fastify';
import { orchestrationService } from './orchestration.service.js';
import {
  createOrchestrationPlanSchema,
  validateOrchestrationPlanSchema,
  applyOrchestrationPlanSchema,
  orchestrationParamsSchema,
} from './orchestration.schemas.js';
import { createSuccessResponse } from '../../../core/response.js';
import { ValidationError } from '../../../core/errors.js';

export class OrchestrationController {
  /**
   * POST /v1/ai/short-orchestration
   * Orchestrates a complete short-form video (30s/45s/60s, 9:16/1:1/4:5) and returns an Editor Command Plan.
   * Strictly non-destructive: AI does NOT modify the project in the database.
   */
  async createPlan(request: FastifyRequest, reply: FastifyReply) {
    const parse = createOrchestrationPlanSchema.safeParse(request.body);
    if (!parse.success) {
      throw new ValidationError('Invalid orchestration plan request', parse.error.format());
    }

    const userId = request.user!.userId;
    const plan = await orchestrationService.createPlan(userId, parse.data);
    return reply.status(200).send(createSuccessResponse(plan));
  }

  /**
   * POST /v1/ai/short-orchestration/validate
   * Validates an orchestration command plan and previews projected timeline diff without modifying project.
   */
  async validatePlan(request: FastifyRequest, reply: FastifyReply) {
    const parse = validateOrchestrationPlanSchema.safeParse(request.body);
    if (!parse.success) {
      throw new ValidationError('Invalid orchestration plan validation request', parse.error.format());
    }

    const userId = request.user!.userId;
    const result = await orchestrationService.validatePlan(userId, parse.data);
    return reply.status(200).send(createSuccessResponse(result));
  }

  /**
   * POST /v1/ai/short-orchestration/apply
   * Explicit user-initiated application of approved orchestration commands via ProjectBloc.
   * Modifies project canvas, sequences tracks, reframes video, adds captions/audio, and snapshots version.
   */
  async applyPlan(request: FastifyRequest, reply: FastifyReply) {
    const parse = applyOrchestrationPlanSchema.safeParse(request.body);
    if (!parse.success) {
      throw new ValidationError('Invalid apply orchestration plan request', parse.error.format());
    }

    const userId = request.user!.userId;
    const result = await orchestrationService.applyPlan(userId, parse.data);
    return reply.status(200).send(createSuccessResponse(result));
  }

  /**
   * GET /v1/ai/short-orchestration/:id
   * Retrieves previously computed orchestration command plan.
   */
  async getPlan(request: FastifyRequest, reply: FastifyReply) {
    const parse = orchestrationParamsSchema.safeParse(request.params);
    if (!parse.success) {
      throw new ValidationError('Invalid orchestration plan ID parameter', parse.error.format());
    }

    const userId = request.user!.userId;
    const plan = await orchestrationService.getPlan(userId, parse.data.id);
    return reply.status(200).send(createSuccessResponse(plan));
  }
}

export const orchestrationController = new OrchestrationController();
