import { FastifyRequest, FastifyReply } from 'fastify';
import { webhooksService } from './webhooks.service.js';
import { createSuccessResponse } from '../../core/response.js';

export class WebhooksController {
  async handleStripe(request: FastifyRequest, reply: FastifyReply) {
    const event = request.body as any;
    await webhooksService.handleStripeEvent(event);
    return reply.status(200).send(createSuccessResponse({ received: true }));
  }

  async handleWorkerCallback(request: FastifyRequest, reply: FastifyReply) {
    const payload = request.body as any;
    await webhooksService.handleWorkerJobCompletion(payload);
    return reply.status(200).send(createSuccessResponse({ received: true }));
  }
}

export const webhooksController = new WebhooksController();
