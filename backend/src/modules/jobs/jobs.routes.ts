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
    '/dead-letter',
    {
      schema: {
        description: 'Get list of dead-letter jobs that have failed max attempts',
        tags: ['Render & Processing Jobs'],
        security: [{ bearerAuth: [] }],
      },
    },
    jobsController.getDeadLetterJobs.bind(jobsController)
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

  fastify.post(
    '/:id/retry',
    {
      schema: {
        description: 'Retry a failed or dead-letter background job',
        tags: ['Render & Processing Jobs'],
        security: [{ bearerAuth: [] }],
      },
    },
    jobsController.retryJob.bind(jobsController)
  );
}
