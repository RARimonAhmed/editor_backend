import { FastifyInstance } from 'fastify';
import { jobsController } from './jobs.controller.js';
import { authenticate } from '../auth/auth.middleware.js';

export async function jobsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  fastify.post(
    '/render',
    {
      schema: {
        description: 'Submit an asynchronous video timeline rendering export job',
        tags: ['Render & Processing Jobs'],
        security: [{ bearerAuth: [] }],
      },
    },
    jobsController.createRenderJob.bind(jobsController)
  );

  fastify.get(
    '/:id',
    {
      schema: {
        description: 'Get background job status, progress percentage, and output download URL',
        tags: ['Render & Processing Jobs'],
        security: [{ bearerAuth: [] }],
      },
    },
    jobsController.getJob.bind(jobsController)
  );

  fastify.post(
    '/:id/cancel',
    {
      schema: {
        description: 'Cancel an ongoing or queued background job',
        tags: ['Render & Processing Jobs'],
        security: [{ bearerAuth: [] }],
      },
    },
    jobsController.cancelJob.bind(jobsController)
  );
}
