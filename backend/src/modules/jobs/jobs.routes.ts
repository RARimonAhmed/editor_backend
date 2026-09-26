import { FastifyInstance } from 'fastify';
import { jobsController } from './jobs.controller.js';
import { renderJobController } from './render-job.controller.js';
import { authenticate } from '../auth/auth.middleware.js';

export async function jobsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  // ============================================================================
  // CANONICAL CLOUD RENDER JOB PIPELINE ROUTES (/api/v1/jobs/render)
  // ============================================================================

  // 1. Submit Render Job: POST /api/v1/jobs/render
  fastify.post(
    '/render',
    {
      schema: {
        description: 'Submit an asynchronous video timeline rendering export job',
        tags: ['Render Jobs'],
        security: [{ bearerAuth: [] }],
      },
    },
    renderJobController.createRenderJob.bind(renderJobController)
  );

  // 2. List Render Jobs: GET /api/v1/jobs/render
  fastify.get(
    '/render',
    {
      schema: {
        description: 'List render jobs for authenticated user with pagination and filters',
        tags: ['Render Jobs'],
        security: [{ bearerAuth: [] }],
      },
    },
    renderJobController.listRenderJobs.bind(renderJobController)
  );

  // 3. Get Render Job: GET /api/v1/jobs/render/:id
  fastify.get(
    '/render/:id',
    {
      schema: {
        description: 'Get render job status, progress percentage, settings, and output details',
        tags: ['Render Jobs'],
        security: [{ bearerAuth: [] }],
      },
    },
    renderJobController.getRenderJob.bind(renderJobController)
  );

  // 4. Cancel Render Job: POST /api/v1/jobs/render/:id/cancel
  fastify.post(
    '/render/:id/cancel',
    {
      schema: {
        description: 'Cancel an ongoing or queued cloud render job',
        tags: ['Render Jobs'],
        security: [{ bearerAuth: [] }],
      },
    },
    renderJobController.cancelRenderJob.bind(renderJobController)
  );

  // 5. Retry Render Job: POST /api/v1/jobs/render/:id/retry
  fastify.post(
    '/render/:id/retry',
    {
      schema: {
        description: 'Retry a failed cloud render job',
        tags: ['Render Jobs'],
        security: [{ bearerAuth: [] }],
      },
    },
    renderJobController.retryRenderJob.bind(renderJobController)
  );

  // ============================================================================
  // BACKWARDS COMPATIBILITY ROUTES (/api/v1/jobs/:id)
  // ============================================================================

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
    async (request, reply) => {
      // Check render jobs first for seamless backwards compatibility
      try {
        const userId = request.user?.userId;
        const userRole = request.user?.role;
        const renderJob = await (await import('./render-job.service.js')).renderJobService.getRenderJob(
          (request.params as any).id,
          userId,
          userRole
        );
        return reply.status(200).send({ success: true, data: renderJob });
      } catch {
        return jobsController.getJob(request as any, reply);
      }
    }
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
    async (request, reply) => {
      try {
        const userId = request.user?.userId;
        const userRole = request.user?.role;
        const renderJob = await (await import('./render-job.service.js')).renderJobService.cancelRenderJob(
          (request.params as any).id,
          userId!,
          userRole
        );
        return reply.status(200).send({ success: true, data: renderJob });
      } catch {
        return jobsController.cancelJob(request as any, reply);
      }
    }
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
    async (request, reply) => {
      try {
        const userId = request.user?.userId;
        const userRole = request.user?.role;
        const renderJob = await (await import('./render-job.service.js')).renderJobService.retryRenderJob(
          (request.params as any).id,
          userId!,
          userRole
        );
        return reply.status(200).send({ success: true, data: renderJob });
      } catch {
        return jobsController.retryJob(request as any, reply);
      }
    }
  );
}
