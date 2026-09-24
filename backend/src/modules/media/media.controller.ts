import { FastifyRequest, FastifyReply } from 'fastify';
import { mediaService } from './media.service.js';
import {
  presignUploadSchema,
  completeUploadSchema,
  registerMediaSchema,
  directUploadSchema,
  renameMediaSchema,
  moveMediaSchema,
  favoriteMediaSchema,
  createFolderSchema,
  renameFolderSchema,
  moveFolderSchema,
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

  // POST /v1/media/register
  async register(request: FastifyRequest, reply: FastifyReply) {
    const parseResult = registerMediaSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid media registration parameters', parseResult.error.format());
    }

    const userId = request.user!.userId;
    const asset = await mediaService.registerMedia(userId, parseResult.data);
    return reply.status(201).send(createSuccessResponse(asset));
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

  // PATCH /v1/media/:id/rename
  async rename(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const parseResult = renameMediaSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid rename parameters', parseResult.error.format());
    }

    const userId = request.user!.userId;
    const asset = await mediaService.rename(userId, request.params.id, parseResult.data.name);
    return reply.status(200).send(createSuccessResponse(asset));
  }

  // PATCH /v1/media/:id/move
  async move(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const parseResult = moveMediaSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid move parameters', parseResult.error.format());
    }

    const userId = request.user!.userId;
    const asset = await mediaService.move(userId, request.params.id, parseResult.data.folderId);
    return reply.status(200).send(createSuccessResponse(asset));
  }

  // POST /v1/media/:id/favorite or PATCH /v1/media/:id/favorite
  async favorite(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const parseResult = favoriteMediaSchema.safeParse(request.body || {});
    const isFavorite = parseResult.success ? parseResult.data.isFavorite : true;

    const userId = request.user!.userId;
    const asset = await mediaService.setFavorite(userId, request.params.id, isFavorite);
    return reply.status(200).send(createSuccessResponse(asset));
  }

  // POST /v1/media/:id/archive
  async archive(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const userId = request.user!.userId;
    const asset = await mediaService.archive(userId, request.params.id);
    return reply.status(200).send(createSuccessResponse(asset));
  }

  // POST /v1/media/:id/restore
  async restore(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const userId = request.user!.userId;
    const asset = await mediaService.restore(userId, request.params.id);
    return reply.status(200).send(createSuccessResponse(asset));
  }

  // GET /v1/media/:id
  async getById(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const userId = request.user!.userId;
    const asset = await mediaService.getById(userId, request.params.id);
    return reply.status(200).send(createSuccessResponse(asset));
  }

  // DELETE /v1/media/:id
  async delete(
    request: FastifyRequest<{ Params: { id: string }; Querystring: { permanent?: string } }>,
    reply: FastifyReply
  ) {
    const userId = request.user!.userId;
    const permanent = request.query.permanent === 'true';
    const result = await mediaService.delete(userId, request.params.id, permanent);
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
    const { media, total, page, limit, totalPages } = await mediaService.list(userId, parseResult.data);
    return reply.status(200).send(
      createSuccessResponse(media, {
        total,
        page,
        limit,
        totalPages,
      })
    );
  }

  // ============================================================================
  // FOLDERS ENDPOINTS
  // ============================================================================
  // POST /v1/media/folders
  async createFolder(request: FastifyRequest, reply: FastifyReply) {
    const parseResult = createFolderSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid folder creation parameters', parseResult.error.format());
    }

    const userId = request.user!.userId;
    const folder = await mediaService.createFolder(userId, parseResult.data);
    return reply.status(201).send(createSuccessResponse(folder));
  }

  // GET /v1/media/folders
  async listFolders(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user!.userId;
    const folders = await mediaService.listFolders(userId);
    return reply.status(200).send(createSuccessResponse(folders));
  }

  // GET /v1/media/folders/:id
  async getFolderById(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const userId = request.user!.userId;
    const folder = await mediaService.getFolderById(userId, request.params.id);
    return reply.status(200).send(createSuccessResponse(folder));
  }

  // PATCH /v1/media/folders/:id
  async renameFolder(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const parseResult = renameFolderSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid folder rename parameters', parseResult.error.format());
    }

    const userId = request.user!.userId;
    const folder = await mediaService.renameFolder(userId, request.params.id, parseResult.data);
    return reply.status(200).send(createSuccessResponse(folder));
  }

  // PATCH /v1/media/folders/:id/move
  async moveFolder(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const parseResult = moveFolderSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid folder move parameters', parseResult.error.format());
    }

    const userId = request.user!.userId;
    const folder = await mediaService.moveFolder(userId, request.params.id, parseResult.data);
    return reply.status(200).send(createSuccessResponse(folder));
  }

  // DELETE /v1/media/folders/:id
  async deleteFolder(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const userId = request.user!.userId;
    const result = await mediaService.deleteFolder(userId, request.params.id);
    return reply.status(200).send(createSuccessResponse(result));
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
