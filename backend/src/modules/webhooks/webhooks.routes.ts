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
}
