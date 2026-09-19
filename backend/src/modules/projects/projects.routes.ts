import { FastifyInstance } from 'fastify';
import { projectsController } from './projects.controller.js';
import { authenticate } from '../auth/auth.middleware.js';

export async function projectsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  // 1. Create Project
  fastify.post(
    '/',
    {
      schema: {
        description: 'Create a new video editing project (metadata, canvas, timeline, assets, settings)',
        tags: ['Projects'],
        security: [{ bearerAuth: [] }],
      },
    },
    projectsController.create.bind(projectsController)
  );

  // 2. List & Search Projects
  fastify.get(
    '/',
    {
      schema: {
        description: 'List user video projects with search, status filtering, and pagination',
        tags: ['Projects'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            search: { type: 'string' },
            q: { type: 'string' },
            status: { type: 'string', enum: ['active', 'archived', 'deleted', 'all'] },
            limit: { type: 'integer', default: 20 },
            offset: { type: 'integer', default: 0 },
            sortBy: { type: 'string', enum: ['updatedAt', 'createdAt', 'title'] },
            sortOrder: { type: 'string', enum: ['asc', 'desc'] },
          },
        },
      },
    },
    projectsController.list.bind(projectsController)
  );

  // 3. Open Project (Get by ID)
  fastify.get(
    '/:id',
    {
      schema: {
        description: 'Open video project and retrieve full document (metadata, canvas, timeline, assets, versions, settings)',
        tags: ['Projects'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
      },
    },
    projectsController.getById.bind(projectsController)
  );

  // 4. Update / Rename Project (PATCH with Optimistic Concurrency Check)
  fastify.patch(
    '/:id',
    {
      schema: {
        description: 'Update or rename project with optimistic concurrency conflict prevention (expectedVersion / If-Match)',
        tags: ['Projects'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
      },
    },
    projectsController.update.bind(projectsController)
  );

  // PUT /:id alias for backward compatibility
  fastify.put(
    '/:id',
    {
      schema: {
        description: 'Update project timeline, tracks, and metadata (concurrency protected)',
        tags: ['Projects'],
        security: [{ bearerAuth: [] }],
      },
    },
    projectsController.update.bind(projectsController)
  );

  // 5. Autosave Cloud Sync (Non-destructive)
  fastify.post(
    '/:id/autosave',
    {
      schema: {
        description: 'Non-destructive autosave cloud sync endpoint with multi-device conflict checking',
        tags: ['Projects'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
      },
    },
    projectsController.autosave.bind(projectsController)
  );

  // POST /:id/sync alias
  fastify.post(
    '/:id/sync',
    {
      schema: {
        description: 'Sync project timeline state non-destructively',
        tags: ['Projects'],
        security: [{ bearerAuth: [] }],
      },
    },
    projectsController.autosave.bind(projectsController)
  );

  // 6. Duplicate Project
  fastify.post(
    '/:id/duplicate',
    {
      schema: {
        description: 'Duplicate project creating a full deep copy starting at version 1',
        tags: ['Projects'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
      },
    },
    projectsController.duplicate.bind(projectsController)
  );

  // 7. Archive Project
  fastify.post(
    '/:id/archive',
    {
      schema: {
        description: 'Archive video project',
        tags: ['Projects'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
      },
    },
    projectsController.archive.bind(projectsController)
  );

  // 8. Restore Project
  fastify.post(
    '/:id/restore',
    {
      schema: {
        description: 'Restore archived or deleted video project back to active status',
        tags: ['Projects'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
      },
    },
    projectsController.restore.bind(projectsController)
  );

  // 9. Delete Project (Soft-delete)
  fastify.delete(
    '/:id',
    {
      schema: {
        description: 'Soft-delete video project (recoverable via restore)',
        tags: ['Projects'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
      },
    },
    projectsController.delete.bind(projectsController)
  );

  // 10. Version History
  fastify.get(
    '/:id/versions',
    {
      schema: {
        description: 'Get immutable version snapshots history for project',
        tags: ['Projects'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
      },
    },
    projectsController.getVersions.bind(projectsController)
  );
}
