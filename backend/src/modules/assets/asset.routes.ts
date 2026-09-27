import { FastifyInstance } from 'fastify';
import { assetController } from './asset.controller.js';
import { authenticate } from '../auth/auth.middleware.js';

export async function assetRoutes(fastify: FastifyInstance) {
  // Public / User read endpoints
  fastify.get('/', assetController.listAssets.bind(assetController));
  fastify.get('/:id', assetController.getAssetById.bind(assetController));
  fastify.get('/:id/download-url', assetController.getDownloadUrl.bind(assetController));

  // Authenticated write endpoints
  fastify.post('/upload', { preHandler: [authenticate] }, assetController.uploadAsset.bind(assetController));
  fastify.post('/:id/version', { preHandler: [authenticate] }, assetController.addVersion.bind(assetController));

  // Admin management endpoints
  fastify.patch('/:id/status', { preHandler: [authenticate] }, assetController.updateStatus.bind(assetController));
  fastify.patch('/:id', { preHandler: [authenticate] }, assetController.updateAsset.bind(assetController));
  fastify.delete('/:id', { preHandler: [authenticate] }, assetController.removeAsset.bind(assetController));
}
