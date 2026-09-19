import { FastifyInstance } from 'fastify';
import { mediaController } from './media.controller.js';
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

  // 3. Direct Upload (Small Assets: Fonts, LUTs, Stickers)
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

  // 4. Get Media by ID
  fastify.get(
    '/:id',
    {
      schema: {
        description: 'Retrieve media asset metadata, lifecycle status, checksum, dimensions, and signed download URL',
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

  // 5. Delete Media (Soft Delete & S3 Object Cleanup)
  fastify.delete(
    '/:id',
    {
      schema: {
        description: 'Delete media asset and clean up storage object',
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

  // 6. Cancel In-Progress Upload
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

  // 7. Retry Failed Media
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

  // 8. List Media Assets
  fastify.get(
    '/',
    {
      schema: {
        description: 'List user media assets with category, status, and project filtering',
        tags: ['Media Assets'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            category: { type: 'string', enum: ['video', 'audio', 'image', 'font', 'lut', 'sticker', 'template', 'all'] },
            status: { type: 'string', enum: ['UPLOADING', 'PROCESSING', 'READY', 'FAILED', 'DELETED', 'all'] },
            projectId: { type: 'string' },
            search: { type: 'string' },
            limit: { type: 'integer', default: 20 },
            offset: { type: 'integer', default: 0 },
          },
        },
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
