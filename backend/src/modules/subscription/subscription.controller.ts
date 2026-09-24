import { FastifyRequest, FastifyReply } from 'fastify';
import { subscriptionService } from './subscription.service.js';
import { ValidationError, NotFoundError } from '../../core/errors.js';
import { createSuccessResponse } from '../../core/response.js';

export class SubscriptionController {
  /**
   * GET /v1/subscription/me
   * Returns the current user's subscription details.
   */
  async getMySubscription(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user!.userId;
    const sub = await subscriptionService.getSubscription(userId);
    if (!sub) {
      throw new NotFoundError('Subscription not found for user');
    }
    return reply.status(200).send(createSuccessResponse(sub));
  }

  /**
   * POST /v1/subscription/change
   * Change the user's subscription plan.
   */
  async changePlan(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user!.userId;
    const body = request.body as { planId: string };
    if (!body?.planId) {
      throw new ValidationError('planId is required');
    }
    const updated = await subscriptionService.changePlan(userId, body.planId);
    return reply.status(200).send(createSuccessResponse(updated));
  }

  /**
   * POST /v1/subscription/cancel
   * Cancel the user's subscription.
   */
  async cancelSubscription(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user!.userId;
    const cancelled = await subscriptionService.cancelSubscription(userId);
    return reply.status(200).send(createSuccessResponse(cancelled));
  }
}

export const subscriptionController = new SubscriptionController();
