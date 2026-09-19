import { FastifyInstance } from 'fastify';
import { billingController } from './billing.controller.js';
import { authenticate } from '../auth/auth.middleware.js';

export async function billingRoutes(fastify: FastifyInstance) {
  // Public endpoints
  fastify.get('/plans', billingController.getPlans.bind(billingController));
  fastify.post('/webhook', billingController.handleWebhook.bind(billingController));

  // Authenticated user billing endpoints
  fastify.register(async (authGroup) => {
    authGroup.addHook('preHandler', authenticate);

    authGroup.get('/usage', billingController.getUsage.bind(billingController));
    authGroup.get('/credits', billingController.getCredits.bind(billingController));
    authGroup.post('/checkout', billingController.createCheckout.bind(billingController));
  });
}
