import { FastifyInstance } from 'fastify';
import { subscriptionsController } from './subscriptions.controller.js';
import { authenticate } from '../auth/auth.middleware.js';

export async function subscriptionsRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/plans',
    {
      schema: {
        description: 'List all available subscription plans and perks',
        tags: ['Subscriptions'],
      },
    },
    subscriptionsController.getPlans.bind(subscriptionsController)
  );

  fastify.get(
    '/current',
    {
      preHandler: [authenticate],
      schema: {
        description: 'Get current user active subscription and billing details',
        tags: ['Subscriptions'],
        security: [{ bearerAuth: [] }],
      },
    },
    subscriptionsController.getCurrentSubscription.bind(subscriptionsController)
  );
}
