import { FastifyInstance } from 'fastify';
import { brandController } from './brand.controller.js';
import { authenticate } from '../auth/auth.middleware.js';

export async function brandRoutes(fastify: FastifyInstance) {
  // Social export presets (accessible publicly / by Flutter client)
  fastify.get('/presets/social', brandController.listSocialPresets.bind(brandController));
  fastify.get('/presets/social/:id', brandController.getSocialPreset.bind(brandController));

  // User Brand Kit management (authenticated)
  fastify.get('/brand-kit', { preHandler: [authenticate] }, brandController.getBrandKit.bind(brandController));
  fastify.put('/brand-kit', { preHandler: [authenticate] }, brandController.upsertBrandKit.bind(brandController));
  fastify.post('/brand-kit/apply', { preHandler: [authenticate] }, brandController.applyToProject.bind(brandController));
}
