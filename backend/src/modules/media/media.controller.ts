import { FastifyRequest, FastifyReply } from 'fastify';
import { mediaService } from './media.service.js';
import {
  presignUploadSchema,
  completeUploadSchema,
  directUploadSchema,
  listMediaQuerySchema,
  requestUploadUrlSchema,
  confirmUploadSchema,
} from './media.schemas.js';
import { createSuccessResponse } from '../../core/response.js';
import { ValidationError } from '../../core/errors.js';

export class MediaController {
  // POST /v1/media/presign
  async presign(request: FastifyRequest, reply: FastifyReply) {
    const parseResult = presignUploadSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid presign upload parameters', parseResult.error.format());
    }

    const userId = request.user!.userId;
    const result = await mediaService.presign(userId, parseResult.data);
    return reply.status(200).send(createSuccessResponse(result));
  }

  // POST /v1/media/complete
  async complete(request: FastifyRequest, reply: FastifyReply) {
    const parseResult = completeUploadSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid complete upload parameters', parseResult.error.format());
    }

    const userId = request.user!.userId;
    const asset = await mediaService.complete(userId, parseResult.data);
    return reply.status(200).send(createSuccessResponse(asset));
  }

  // POST /v1/media/upload (Direct upload for small assets)
  async directUpload(request: FastifyRequest, reply: FastifyReply) {
    const parseResult = directUploadSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid direct upload parameters', parseResult.error.format());
    }

    const userId = request.user!.userId;
    const asset = await mediaService.directUpload(userId, parseResult.data);
    return reply.status(201).send(createSuccessResponse(asset));
  }

  // GET /v1/media/:id
  async getById(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const userId = request.user!.userId;
    const asset = await mediaService.getById(request.params.id, userId);
    return reply.status(200).send(createSuccessResponse(asset));
  }

  // DELETE /v1/media/:id
  async delete(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const userId = request.user!.userId;
    const result = await mediaService.delete(request.params.id, userId);
    return reply.status(200).send(createSuccessResponse(result));
  }

  // POST /v1/media/:id/cancel
  async cancel(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const userId = request.user!.userId;
    const result = await mediaService.cancel(request.params.id, userId);
    return reply.status(200).send(createSuccessResponse(result));
  }

  // POST /v1/media/:id/retry
  async retry(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const userId = request.user!.userId;
    const result = await mediaService.retry(request.params.id, userId);
    return reply.status(200).send(createSuccessResponse(result));
  }

  // GET /v1/media/:id/processing-job
  async getProcessingJob(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const userId = request.user!.userId;
    const result = await mediaService.getProcessingJob(request.params.id, userId);
    return reply.status(200).send(createSuccessResponse(result));
  }

  // POST /v1/media/:id/cancel-processing
  async cancelProcessing(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const userId = request.user!.userId;
    const result = await mediaService.cancelProcessing(request.params.id, userId);
    return reply.status(200).send(createSuccessResponse(result));
  }

  // GET /v1/media
  async list(request: FastifyRequest, reply: FastifyReply) {
    const parseResult = listMediaQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      throw new ValidationError('Invalid media list query', parseResult.error.format());
    }

    const userId = request.user!.userId;
    const { media, total } = await mediaService.list(userId, parseResult.data);
    return reply.status(200).send(
      createSuccessResponse(media, {
        total,
        limit: parseResult.data.limit,
        offset: parseResult.data.offset,
      })
    );
  }

  // ============================================================================
  // BACKWARDS COMPATIBILITY HANDLERS
  // ============================================================================
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

