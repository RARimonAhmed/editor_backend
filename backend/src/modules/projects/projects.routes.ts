import { FastifyInstance } from 'fastify';
import { projectsController } from './projects.controller.js';
import { reviewController } from './review/review.controller.js';
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

  // 4b. Rename Project
  fastify.patch(
    '/:id/rename',
    {
      schema: {
        description: 'Rename video project title (concurrency protected)',
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
    projectsController.rename.bind(projectsController)
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

  // 9. Delete Project (Soft-delete or permanent)
  fastify.delete(
    '/:id',
    {
      schema: {
        description: 'Soft-delete video project (or permanent delete with ?permanent=true)',
        tags: ['Projects'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        querystring: {
          type: 'object',
          properties: {
            permanent: { type: 'boolean', default: false },
          },
        },
      },
    },
    projectsController.delete.bind(projectsController)
  );

  // 9b. Permanent Delete Project
  fastify.post(
    '/:id/permanent-delete',
    {
      schema: {
        description: 'Permanently delete video project and all associated timelines/versions',
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
    projectsController.permanentDelete.bind(projectsController)
  );

  // 9c. Project Snapshots / Backup Aliases
  fastify.post(
    '/:id/snapshots',
    {
      schema: {
        description: 'Create an immutable backup snapshot of project state',
        tags: ['Projects'],
        security: [{ bearerAuth: [] }],
      },
    },
    projectsController.createSnapshot.bind(projectsController)
  );

  fastify.get(
    '/:id/snapshots',
    {
      schema: {
        description: 'List immutable backup snapshots for project',
        tags: ['Projects'],
        security: [{ bearerAuth: [] }],
      },
    },
    projectsController.listSnapshots.bind(projectsController)
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

  // 11. Create Named Immutable Version Snapshot
  fastify.post(
    '/:id/versions',
    {
      schema: {
        description: 'Create a named immutable version snapshot of the current project state',
        tags: ['Project Review & Versions'],
        security: [{ bearerAuth: [] }],
      },
    },
    reviewController.createSnapshot.bind(reviewController)
  );

  // 12. Compare Version Snapshots Diff
  fastify.get(
    '/:id/versions/compare',
    {
      schema: {
        description: 'Compare metadata and timeline track/clip diff between any two version snapshots',
        tags: ['Project Review & Versions'],
        security: [{ bearerAuth: [] }],
      },
    },
    reviewController.compareVersions.bind(reviewController)
  );

  // 13. Get Version Snapshot by Version Number
  fastify.get(
    '/:id/versions/:versionNumber',
    {
      schema: {
        description: 'Retrieve a specific immutable version snapshot by version number',
        tags: ['Project Review & Versions'],
        security: [{ bearerAuth: [] }],
      },
    },
    reviewController.getSnapshot.bind(reviewController)
  );

  // 14. Restore Version Snapshot (Non-destructive)
  fastify.post(
    '/:id/versions/:versionNumber/restore',
    {
      schema: {
        description: 'Restore project to state from a previous snapshot non-destructively by creating a new version',
        tags: ['Project Review & Versions'],
        security: [{ bearerAuth: [] }],
      },
    },
    reviewController.restoreSnapshot.bind(reviewController)
  );

  // 15. Create Timecode / Review Comment
  fastify.post(
    '/:id/comments',
    {
      schema: {
        description: 'Add a timeline timecode-level, asset-level, or project-level review comment',
        tags: ['Project Review & Comments'],
        security: [{ bearerAuth: [] }],
      },
    },
    reviewController.createComment.bind(reviewController)
  );

  // 16. List Review Comments
  fastify.get(
    '/:id/comments',
    {
      schema: {
        description: 'List project review comments with filters (type, status, timecode window)',
        tags: ['Project Review & Comments'],
        security: [{ bearerAuth: [] }],
      },
    },
    reviewController.listComments.bind(reviewController)
  );

  // 17. Update / Resolve Review Comment
  fastify.patch(
    '/:id/comments/:commentId',
    {
      schema: {
        description: 'Update or resolve a review comment (status: OPEN | RESOLVED)',
        tags: ['Project Review & Comments'],
        security: [{ bearerAuth: [] }],
      },
    },
    reviewController.updateComment.bind(reviewController)
  );

  fastify.patch(
    '/:id/comments/:commentId/resolve',
    {
      schema: {
        description: 'Resolve a review comment directly',
        tags: ['Project Review & Comments'],
        security: [{ bearerAuth: [] }],
      },
    },
    reviewController.updateComment.bind(reviewController)
  );

  // 18. Delete Review Comment
  fastify.delete(
    '/:id/comments/:commentId',
    {
      schema: {
        description: 'Delete a review comment',
        tags: ['Project Review & Comments'],
        security: [{ bearerAuth: [] }],
      },
    },
    reviewController.deleteComment.bind(reviewController)
  );
}
