import { FastifyInstance } from 'fastify';
import { webhooksController } from './webhooks.controller.js';

export async function webhooksRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/stripe',
    {
      schema: {
        description: 'Stripe webhook receiver for subscription events',
        tags: ['Webhooks'],
      },
    },
    webhooksController.handleStripe.bind(webhooksController)
  );

  fastify.post(
    '/worker-callback',
    {
      schema: {
        description: 'Internal callback endpoint for media transcoding and rendering workers',
        tags: ['Webhooks'],
      },
    },
    webhooksController.handleWorkerCallback.bind(webhooksController)
  );

  fastify.post(
    '/providers/:provider',
    {
      schema: {
        description: 'External provider webhook ingestion with signature verification, idempotency, and retries',
        tags: ['Webhooks'],
        params: {
          type: 'object',
          properties: {
            provider: { type: 'string', description: 'Provider identifier (e.g. stripe, mux, replicate, elevenlabs)' },
          },
          required: ['provider'],
        },
      },
    },
    webhooksController.handleProviderIngest.bind(webhooksController)
  );

  fastify.get(
    '/dead-letter',
    {
      schema: {
        description: 'Inspect webhooks in Dead-Letter Queue (DLQ)',
        tags: ['Webhooks'],
      },
    },
    webhooksController.listDeadLetters.bind(webhooksController)
  );

  fastify.post(
    '/dead-letter/:id/retry',
    {
      schema: {
        description: 'Retry a failed webhook from Dead-Letter Queue',
        tags: ['Webhooks'],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
        },
      },
    },
    webhooksController.retryDeadLetter.bind(webhooksController)
  );
}
