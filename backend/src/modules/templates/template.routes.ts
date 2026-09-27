import { FastifyInstance } from 'fastify';
import { templateController } from './template.controller.js';
import { authenticate } from '../auth/auth.middleware.js';

export async function templateRoutes(fastify: FastifyInstance) {
  // Public template discovery
  fastify.get('/', templateController.listTemplates.bind(templateController));
  fastify.get('/:id', templateController.getTemplateById.bind(templateController));

  // Authenticated actions
  fastify.post('/:id/use', { preHandler: [authenticate] }, templateController.useTemplate.bind(templateController));
  fastify.post('/:id/favorite', { preHandler: [authenticate] }, templateController.toggleFavorite.bind(templateController));
}
