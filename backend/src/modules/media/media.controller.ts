import { FastifyRequest, FastifyReply } from 'fastify';
import { mediaService } from './media.service.js';
import { requestUploadUrlSchema, confirmUploadSchema } from './media.schemas.js';
import { createSuccessResponse } from '../../core/response.js';
import { ValidationError } from '../../core/errors.js';

export class MediaController {
  async getUploadUrl(request: FastifyRequest, reply: FastifyReply) {
    const parseResult = requestUploadUrlSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid upload URL request', parseResult.error.format());
    }

    const userId = request.user!.userId;
    const result = await mediaService.getUploadUrl(userId, parseResult.data);
    return reply.status(200).send(createSuccessResponse(result));
  }

  async confirmUpload(request: FastifyRequest, reply: FastifyReply) {
    const parseResult = confirmUploadSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid upload confirmation payload', parseResult.error.format());
    }

    const userId = request.user!.userId;
    const asset = await mediaService.confirmUpload(userId, parseResult.data);
    return reply.status(201).send(createSuccessResponse(asset));
  }

  async listAssets(request: FastifyRequest<{ Querystring: { projectId?: string } }>, reply: FastifyReply) {
    const userId = request.user!.userId;
    const projectId = request.query.projectId;
    const assets = await mediaService.listAssets(userId, projectId);
    return reply.status(200).send(createSuccessResponse(assets, { total: assets.length }));
  }
}

export const mediaController = new MediaController();
