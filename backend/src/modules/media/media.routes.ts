import { FastifyInstance } from 'fastify';
import { mediaController } from './media.controller.js';
import { authenticate } from '../auth/auth.middleware.js';

export async function mediaRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  fastify.post(
    '/upload-url',
    {
      schema: {
        description: 'Generate presigned S3 URL for direct client-to-storage upload',
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
        description: 'Confirm completed asset upload and index into media catalog',
        tags: ['Media Assets'],
        security: [{ bearerAuth: [] }],
      },
    },
    mediaController.confirmUpload.bind(mediaController)
  );

  fastify.get(
    '/',
    {
      schema: {
        description: 'List uploaded media assets for user or specific project',
        tags: ['Media Assets'],
        security: [{ bearerAuth: [] }],
      },
    },
    mediaController.listAssets.bind(mediaController)
  );
}
