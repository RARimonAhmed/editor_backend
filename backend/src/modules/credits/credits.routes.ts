import { FastifyInstance } from 'fastify';
import { creditsController } from './credits.controller.js';
import { authenticate } from '../auth/auth.middleware.js';

export async function creditsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  fastify.get(
    '/balance',
    {
      schema: {
        description: 'Get current user AI/rendering credit balance',
        tags: ['Credits & Billing'],
        security: [{ bearerAuth: [] }],
      },
    },
    creditsController.getBalance.bind(creditsController)
  );

  fastify.get(
    '/history',
    {
      schema: {
        description: 'Get credit transaction ledger history',
        tags: ['Credits & Billing'],
        security: [{ bearerAuth: [] }],
      },
    },
    creditsController.getHistory.bind(creditsController)
  );
}
