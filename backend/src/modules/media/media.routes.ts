import { FastifyInstance } from 'fastify';
import { mediaController } from './media.controller.js';
import { mediaIntelligenceController } from './intelligence/media-intelligence.controller.js';
import { authenticate } from '../auth/auth.middleware.js';

export async function mediaRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  // 1. Presign Upload (Single-Part or Multipart)
  fastify.post(
    '/presign',
    {
      schema: {
        description: 'Initiate upload session and obtain presigned URL(s) for direct S3 single-part or multipart upload',
        tags: ['Media Assets'],
        security: [{ bearerAuth: [] }],
      },
    },
    mediaController.presign.bind(mediaController)
  );

  // 2. Complete Upload
  fastify.post(
    '/complete',
    {
      schema: {
        description: 'Finalize upload, verify SHA-256 checksum, run security/malware scanning hook, and transition to READY',
        tags: ['Media Assets'],
        security: [{ bearerAuth: [] }],
      },
    },
    mediaController.complete.bind(mediaController)
  );

  // 3. Register Pre-Uploaded or External Media Asset
  fastify.post(
    '/register',
    {
      schema: {
        description: 'Directly register an existing media object or metadata with deduplication verification',
        tags: ['Media Assets'],
        security: [{ bearerAuth: [] }],
      },
    },
    mediaController.register.bind(mediaController)
  );

  // 4. Direct Upload (Small Assets: Fonts, LUTs, Stickers)
  fastify.post(
    '/upload',
    {
      schema: {
        description: 'Directly upload small media assets (fonts, LUTs, stickers) through the API',
        tags: ['Media Assets'],
        security: [{ bearerAuth: [] }],
      },
    },
    mediaController.directUpload.bind(mediaController)
  );

  // 5. Folder Hierarchy Management (Placed before /:id)
  fastify.post(
    '/folders',
    {
      schema: {
        description: 'Create a new media bin folder',
        tags: ['Media Folders'],
        security: [{ bearerAuth: [] }],
      },
    },
    mediaController.createFolder.bind(mediaController)
  );

  fastify.get(
    '/folders',
    {
      schema: {
        description: 'List user media bin folders',
        tags: ['Media Folders'],
        security: [{ bearerAuth: [] }],
      },
    },
    mediaController.listFolders.bind(mediaController)
  );

  fastify.get(
    '/folders/:id',
    {
      schema: {
        description: 'Retrieve media folder by ID',
        tags: ['Media Folders'],
        security: [{ bearerAuth: [] }],
      },
    },
    mediaController.getFolderById.bind(mediaController)
  );

  fastify.patch(
    '/folders/:id',
    {
      schema: {
        description: 'Rename media folder or update color',
        tags: ['Media Folders'],
        security: [{ bearerAuth: [] }],
      },
    },
    mediaController.renameFolder.bind(mediaController)
  );

  fastify.patch(
    '/folders/:id/move',
    {
      schema: {
        description: 'Move media folder to a new parent folder or root',
        tags: ['Media Folders'],
        security: [{ bearerAuth: [] }],
      },
    },
    mediaController.moveFolder.bind(mediaController)
  );

  fastify.delete(
    '/folders/:id',
    {
      schema: {
        description: 'Delete media folder and unlink contained assets to root',
        tags: ['Media Folders'],
        security: [{ bearerAuth: [] }],
      },
    },
    mediaController.deleteFolder.bind(mediaController)
  );

  // 6. Multi-Modal Semantic Search (Placed before /:id to avoid param route collision)
  fastify.post(
    '/search/semantic',
    {
      schema: {
        description: 'Multi-modal semantic search querying visual objects, speech, scenes, and vector embeddings with timeline ranges',
        tags: ['Media Intelligence'],
        security: [{ bearerAuth: [] }],
      },
    },
    mediaIntelligenceController.search.bind(mediaIntelligenceController)
  );

  // 7. Get Media by ID
  fastify.get(
    '/:id',
    {
      schema: {
        description: 'Retrieve media asset metadata, lifecycle status, checksum, dimensions, variants, and signed download URL',
        tags: ['Media Assets'],
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
    mediaController.getById.bind(mediaController)
  );

  // 8. Rename Media
  fastify.patch(
    '/:id/rename',
    {
      schema: {
        description: 'Rename media asset',
        tags: ['Media Assets'],
        security: [{ bearerAuth: [] }],
      },
    },
    mediaController.rename.bind(mediaController)
  );

  // 9. Move Media into Folder
  fastify.patch(
    '/:id/move',
    {
      schema: {
        description: 'Move media asset to a folder or root',
        tags: ['Media Assets'],
        security: [{ bearerAuth: [] }],
      },
    },
    mediaController.move.bind(mediaController)
  );

  // 10. Favorite Media
  fastify.post(
    '/:id/favorite',
    {
      schema: {
        description: 'Toggle favorite status for media asset',
        tags: ['Media Assets'],
        security: [{ bearerAuth: [] }],
      },
    },
    mediaController.favorite.bind(mediaController)
  );

  fastify.patch(
    '/:id/favorite',
    {
      schema: {
        description: 'Update favorite status for media asset',
        tags: ['Media Assets'],
        security: [{ bearerAuth: [] }],
      },
    },
    mediaController.favorite.bind(mediaController)
  );

  // 11. Archive Media
  fastify.post(
    '/:id/archive',
    {
      schema: {
        description: 'Archive media asset',
        tags: ['Media Assets'],
        security: [{ bearerAuth: [] }],
      },
    },
    mediaController.archive.bind(mediaController)
  );

  // 12. Restore Media
  fastify.post(
    '/:id/restore',
    {
      schema: {
        description: 'Restore archived media asset back to READY status',
        tags: ['Media Assets'],
        security: [{ bearerAuth: [] }],
      },
    },
    mediaController.restore.bind(mediaController)
  );

  // 13. Delete Media (Soft Delete or Permanent Purge)
  fastify.delete(
    '/:id',
    {
      schema: {
        description: 'Delete media asset (soft delete default, permanent purge with ?permanent=true)',
        tags: ['Media Assets'],
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
    mediaController.delete.bind(mediaController)
  );

  // 14. Cancel In-Progress Upload
  fastify.post(
    '/:id/cancel',
    {
      schema: {
        description: 'Cancel in-progress upload and abort S3 multipart upload session',
        tags: ['Media Assets'],
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
    mediaController.cancel.bind(mediaController)
  );

  // 15. Retry Failed Media
  fastify.post(
    '/:id/retry',
    {
      schema: {
        description: 'Retry failed media processing or upload',
        tags: ['Media Assets'],
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
    mediaController.retry.bind(mediaController)
  );

  // 16. Get Asynchronous Media Processing Job Status & Telemetry
  fastify.get(
    '/:id/processing-job',
    {
      schema: {
        description: 'Retrieve real-time processing job progress, current stage, telemetry, and artifacts',
        tags: ['Media Assets'],
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
    mediaController.getProcessingJob.bind(mediaController)
  );

  // 17. Cancel Asynchronous Media Processing
  fastify.post(
    '/:id/cancel-processing',
    {
      schema: {
        description: 'Cancel an ongoing media processing pipeline job',
        tags: ['Media Assets'],
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
    mediaController.cancelProcessing.bind(mediaController)
  );

  // 18. Generate / Refresh Media Intelligence
  fastify.post(
    '/:id/intelligence',
    {
      schema: {
        description: 'Extract multi-modal searchable intelligence (visual objects, anonymous faces, speech, scenes, audio events, embeddings)',
        tags: ['Media Intelligence'],
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
    mediaIntelligenceController.generateIntelligence.bind(mediaIntelligenceController)
  );

  // 19. Retrieve Media Intelligence Document
  fastify.get(
    '/:id/intelligence',
    {
      schema: {
        description: 'Retrieve multi-modal intelligence document for a media asset',
        tags: ['Media Intelligence'],
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
    mediaIntelligenceController.getIntelligence.bind(mediaIntelligenceController)
  );

  // 20. List Media Assets
  fastify.get(
    '/',
    {
      schema: {
        description: 'List user media assets with category, status, folder, favorites, recent, and text query filtering',
        tags: ['Media Assets'],
        security: [{ bearerAuth: [] }],
      },
    },
    mediaController.list.bind(mediaController)
  );

  // ============================================================================
  // BACKWARDS COMPATIBILITY ROUTES
  // ============================================================================
  fastify.post(
    '/upload-url',
    {
      schema: {
        description: 'Legacy presigned URL endpoint',
        tags: ['Media Assets'],
        security: [{ bearerAuth: [] }],
      },
    },
    mediaController.getUploadUrl.bind(mediaController)
  );

  fastify.post(
    '/confirm',
    {
      schema: {
        description: 'Legacy upload confirmation endpoint',
        tags: ['Media Assets'],
        security: [{ bearerAuth: [] }],
      },
    },
    mediaController.confirmUpload.bind(mediaController)
  );
}
