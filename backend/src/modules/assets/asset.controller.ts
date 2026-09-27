import { FastifyRequest, FastifyReply } from 'fastify';
import { assetService } from './asset.service.js';
import {
  listAssetsQuerySchema,
  directUploadAssetSchema,
  addVersionSchema,
  updateAssetStatusSchema,
  updateAssetSchema,
} from './asset.schemas.js';
import { createSuccessResponse } from '../../core/response.js';
import { ValidationError, ForbiddenError } from '../../core/errors.js';

export class AssetController {
  /**
   * GET /api/v1/assets
   */
  async listAssets(request: FastifyRequest, reply: FastifyReply) {
    const parse = listAssetsQuerySchema.safeParse(request.query);
    if (!parse.success) {
      throw new ValidationError('Invalid query parameters', parse.error.format());
    }
    const result = await assetService.listAssets(parse.data);
    return reply.status(200).send(createSuccessResponse(result.items, { pagination: result }));
  }

  /**
   * GET /api/v1/assets/:id
   */
  async getAssetById(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const asset = await assetService.getAssetById(id);
    return reply.status(200).send(createSuccessResponse(asset));
  }

  /**
   * POST /api/v1/assets/upload
   */
  async uploadAsset(request: FastifyRequest, reply: FastifyReply) {
    const parse = directUploadAssetSchema.safeParse(request.body);
    if (!parse.success) {
      throw new ValidationError('Invalid asset upload payload', parse.error.format());
    }

    const userId = request.user?.userId || 'system';
    const buffer = Buffer.from(parse.data.fileBase64, 'base64');

    const asset = await assetService.ingestAsset(userId, {
      type: parse.data.type,
      category: parse.data.category,
      name: parse.data.name,
      tags: parse.data.tags,
      buffer,
      mimeType: parse.data.mimeType,
      filename: parse.data.filename,
      aspectRatios: parse.data.aspectRatios,
      supportedPlatforms: parse.data.supportedPlatforms,
      status: parse.data.status,
      isFeatured: parse.data.isFeatured,
      licenseMetadata: parse.data.licenseMetadata,
      compatibility: parse.data.compatibility,
    });

    return reply.status(201).send(createSuccessResponse(asset));
  }

  /**
   * POST /api/v1/assets/:id/version
   */
  async addVersion(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const parse = addVersionSchema.safeParse(request.body);
    if (!parse.success) {
      throw new ValidationError('Invalid asset version payload', parse.error.format());
    }

    const userId = request.user?.userId || 'system';
    const buffer = Buffer.from(parse.data.fileBase64, 'base64');

    const asset = await assetService.addVersion(
      id,
      userId,
      buffer,
      parse.data.changeLog,
      parse.data.filename,
      parse.data.mimeType
    );

    return reply.status(200).send(createSuccessResponse(asset));
  }

  /**
   * GET /api/v1/assets/:id/download-url
   */
  async getDownloadUrl(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const query = request.query as { expiresIn?: number; signed?: boolean };
    const asset = await assetService.getAssetById(id);
    const signed = query.signed !== false;
    const expiresIn = query.expiresIn ? Number(query.expiresIn) : 3600;

    const url = await assetService.getCdnUrl(asset.storageKey, {
      signed,
      expiresIn,
      filename: `${asset.slug}.${asset.metadata.format || 'bin'}`,
    });

    return reply.status(200).send(createSuccessResponse({ downloadUrl: url, expiresIn, assetId: asset.id }));
  }

  /**
   * PATCH /api/v1/assets/:id/status (Admin)
   */
  async updateStatus(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const parse = updateAssetStatusSchema.safeParse(request.body);
    if (!parse.success) {
      throw new ValidationError('Invalid status payload', parse.error.format());
    }
    const asset = await assetService.updateAssetStatus(id, parse.data.status);
    return reply.status(200).send(createSuccessResponse(asset));
  }

  /**
   * PATCH /api/v1/assets/:id (Admin)
   */
  async updateAsset(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const parse = updateAssetSchema.safeParse(request.body);
    if (!parse.success) {
      throw new ValidationError('Invalid update payload', parse.error.format());
    }
    const asset = await assetService.updateAsset(id, parse.data);
    return reply.status(200).send(createSuccessResponse(asset));
  }

  /**
   * DELETE /api/v1/assets/:id (Admin)
   */
  async removeAsset(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    await assetService.removeAsset(id);
    return reply.status(200).send(createSuccessResponse({ success: true, removedId: id }));
  }
}

export const assetController = new AssetController();
