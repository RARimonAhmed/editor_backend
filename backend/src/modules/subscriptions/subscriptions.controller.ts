import { FastifyRequest, FastifyReply } from 'fastify';
import { subscriptionsService } from './subscriptions.service.js';
import { createSuccessResponse } from '../../core/response.js';

export class SubscriptionsController {
  async getPlans(_request: FastifyRequest, reply: FastifyReply) {
    const plans = subscriptionsService.getPlans();
    return reply.status(200).send(createSuccessResponse(plans));
  }

  async getCurrentSubscription(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user!.userId;
    const sub = await subscriptionsService.getUserSubscription(userId);
    return reply.status(200).send(createSuccessResponse(sub));
  }
}

export const subscriptionsController = new SubscriptionsController();
