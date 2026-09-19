import { FastifyInstance } from 'fastify';
import { projectsController } from './projects.controller.js';
import { authenticate } from '../auth/auth.middleware.js';

export async function projectsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  fastify.post(
    '/',
    {
      schema: {
        description: 'Create a new video editing project with timeline tracks',
        tags: ['Projects'],
        security: [{ bearerAuth: [] }],
      },
    },
    projectsController.create.bind(projectsController)
  );

  fastify.get(
    '/',
    {
      schema: {
        description: 'List user video projects',
        tags: ['Projects'],
        security: [{ bearerAuth: [] }],
      },
    },
    projectsController.list.bind(projectsController)
  );

  fastify.get(
    '/:id',
    {
      schema: {
        description: 'Get project details and full timeline data',
        tags: ['Projects'],
        security: [{ bearerAuth: [] }],
      },
    },
    projectsController.getById.bind(projectsController)
  );

  fastify.put(
    '/:id',
    {
      schema: {
        description: 'Update project timeline, markers, and video configuration',
        tags: ['Projects'],
        security: [{ bearerAuth: [] }],
      },
    },
    projectsController.update.bind(projectsController)
  );

  fastify.delete(
    '/:id',
    {
      schema: {
        description: 'Delete video editing project',
        tags: ['Projects'],
        security: [{ bearerAuth: [] }],
      },
    },
    projectsController.delete.bind(projectsController)
  );
}
