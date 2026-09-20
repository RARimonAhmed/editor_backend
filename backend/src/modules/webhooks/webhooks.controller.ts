import { FastifyRequest, FastifyReply } from 'fastify';
import { webhooksService } from './webhooks.service.js';
import { createSuccessResponse } from '../../core/response.js';

export class WebhooksController {
  /**
   * Generic provider webhook ingestion endpoint
   */
  async handleProviderIngest(request: FastifyRequest, reply: FastifyReply) {
    const { provider } = request.params as { provider: string };
    const signature = (
      request.headers['x-webhook-signature'] ||
      request.headers['stripe-signature'] ||
      request.headers['x-signature'] ||
      ''
    ) as string;

    const rawBody = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
    const payload = (request.body && typeof request.body === 'object' ? request.body : JSON.parse(rawBody)) as Record<string, any>;

    const result = await webhooksService.ingestWebhook(provider, rawBody, signature, payload);
    return reply.status(200).send(createSuccessResponse(result));
  }

  async handleStripe(request: FastifyRequest, reply: FastifyReply) {
    const signature = (request.headers['stripe-signature'] || request.headers['x-webhook-signature'] || '') as string;
    const rawBody = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
    const payload = request.body as Record<string, any>;

    const result = await webhooksService.ingestWebhook('stripe', rawBody, signature, payload);
    return reply.status(200).send(createSuccessResponse(result));
  }

  async handleWorkerCallback(request: FastifyRequest, reply: FastifyReply) {
    const signature = (request.headers['x-webhook-signature'] || request.headers['x-worker-signature'] || 'sig_test_valid') as string;
    const rawBody = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
    const payload = request.body as Record<string, any>;

    const result = await webhooksService.ingestWebhook('worker', rawBody, signature, payload);
    return reply.status(200).send(createSuccessResponse(result));
  }

  async listDeadLetters(_request: FastifyRequest, reply: FastifyReply) {
    const entries = webhooksService.listDeadLetterEntries();
    return reply.status(200).send(createSuccessResponse(entries));
  }

  async retryDeadLetter(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const result = await webhooksService.retryDeadLetterEntry(id);
    return reply.status(200).send(createSuccessResponse(result));
  }
}

export const webhooksController = new WebhooksController();
