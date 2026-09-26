import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { renderJobService } from './render-job.service.js';
import { createSuccessResponse } from '../../core/response.js';
import { ValidationError, AuthenticationError } from '../../core/errors.js';
import { RenderFormat, RenderVideoCodec, RenderAudioCodec, RenderPreset } from './render-job.types.js';

const renderSettingsSchema = z.object({
  format: z.enum(['mp4', 'mov', 'webm'] as [RenderFormat, ...RenderFormat[]]).default('mp4'),
  resolutionWidth: z.number().int().min(320).max(7680).default(1920),
  resolutionHeight: z.number().int().min(240).max(4320).default(1080),
  framerate: z.number().min(1).max(120).default(30.0),
  videoCodec: z.enum(['h264', 'hevc', 'vp9', 'prores'] as [RenderVideoCodec, ...RenderVideoCodec[]]).optional(),
  audioCodec: z.enum(['aac', 'opus', 'pcm'] as [RenderAudioCodec, ...RenderAudioCodec[]]).optional(),
  bitrateKbps: z.number().int().min(100).max(100000).optional(),
  audioBitrateKbps: z.number().int().min(32).max(512).optional(),
  crf: z.number().int().min(0).max(51).optional(),
  preset: z.enum([
    'ultrafast',
    'superfast',
    'veryfast',
    'faster',
    'fast',
    'medium',
    'slow',
    'slower',
    'veryslow',
  ] as [RenderPreset, ...RenderPreset[]]).optional(),
  durationSeconds: z.number().positive().optional(),
});

const createRenderJobSchema = z.object({
  projectId: z.string().uuid('Valid project UUID is required'),
  projectVersionId: z.string().uuid().optional(),
  versionNumber: z.number().int().positive().optional(),
  version: z.number().int().positive().optional(),
  settings: renderSettingsSchema.optional(),

  // Also support flat top-level parameters for seamless client compatibility
  format: z.enum(['mp4', 'mov', 'webm'] as [RenderFormat, ...RenderFormat[]]).optional(),
  resolutionWidth: z.number().int().min(320).max(7680).optional(),
  resolutionHeight: z.number().int().min(240).max(4320).optional(),
  framerate: z.number().min(1).max(120).optional(),
  videoCodec: z.enum(['h264', 'hevc', 'vp9', 'prores'] as [RenderVideoCodec, ...RenderVideoCodec[]]).optional(),
  audioCodec: z.enum(['aac', 'opus', 'pcm'] as [RenderAudioCodec, ...RenderAudioCodec[]]).optional(),
  bitrateKbps: z.number().int().min(100).max(100000).optional(),
});

const listRenderJobsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z
    .enum([
      'queued',
      'starting',
      'running',
      'cancelling',
      'cancelled',
      'validating',
      'uploading',
      'completed',
      'failed',
    ])
    .optional(),
  projectId: z.string().uuid().optional(),
  sortBy: z.enum(['created_at', 'updated_at', 'status', 'progress']).default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
  allUsers: z.coerce.boolean().optional(),
});

export class RenderJobController {
  /**
   * POST /api/v1/jobs/render
   */
  async createRenderJob(request: FastifyRequest, reply: FastifyReply) {
    if (!request.user?.userId) {
      throw new AuthenticationError('User authentication required');
    }

    const parseResult = createRenderJobSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid render job payload', parseResult.error.format());
    }

    const body = parseResult.data;

    // Merge flat parameters into settings if provided
    const mergedSettings = {
      ...(body.settings || {}),
      ...(body.format ? { format: body.format } : {}),
      ...(body.resolutionWidth ? { resolutionWidth: body.resolutionWidth } : {}),
      ...(body.resolutionHeight ? { resolutionHeight: body.resolutionHeight } : {}),
      ...(body.framerate ? { framerate: body.framerate } : {}),
      ...(body.videoCodec ? { videoCodec: body.videoCodec } : {}),
      ...(body.audioCodec ? { audioCodec: body.audioCodec } : {}),
      ...(body.bitrateKbps ? { bitrateKbps: body.bitrateKbps } : {}),
    };

    const userId = request.user.userId;
    const userRole = request.user.role;

    const job = await renderJobService.createRenderJob(
      userId,
      {
        projectId: body.projectId,
        projectVersionId: body.projectVersionId,
        versionNumber: body.versionNumber || body.version,
        settings: mergedSettings,
      },
      userRole
    );

    return reply.status(202).send(createSuccessResponse(job));
  }

  /**
   * GET /api/v1/jobs/render/:id
   */
  async getRenderJob(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    if (!request.user?.userId) {
      throw new AuthenticationError('User authentication required');
    }

    const userId = request.user.userId;
    const userRole = request.user.role;
    const job = await renderJobService.getRenderJob(request.params.id, userId, userRole);

    return reply.status(200).send(createSuccessResponse(job));
  }

  /**
   * GET /api/v1/jobs/render/:id/download-url
   */
  async getDownloadUrl(
    request: FastifyRequest<{ Params: { id: string }; Querystring: { expiresIn?: number } }>,
    reply: FastifyReply
  ) {
    if (!request.user?.userId) {
      throw new AuthenticationError('User authentication required');
    }

    const userId = request.user.userId;
    const userRole = request.user.role;
    const expiresIn = request.query.expiresIn ? Number(request.query.expiresIn) : 3600;
    const result = await renderJobService.getDownloadUrl(request.params.id, userId, expiresIn, userRole);

    return reply.status(200).send(createSuccessResponse(result));
  }

  /**
   * GET /api/v1/jobs/render
   */
  async listRenderJobs(
    request: FastifyRequest<{ Querystring: Record<string, unknown> }>,
    reply: FastifyReply
  ) {
    if (!request.user?.userId) {
      throw new AuthenticationError('User authentication required');
    }

    const parseResult = listRenderJobsQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      throw new ValidationError('Invalid query parameters', parseResult.error.format());
    }

    const userId = request.user.userId;
    const userRole = request.user.role;
    const paginated = await renderJobService.listRenderJobs(userId, parseResult.data, userRole);

    return reply.status(200).send(
      createSuccessResponse(paginated.items, {
        page: paginated.page,
        limit: paginated.limit,
        total: paginated.total,
        totalPages: paginated.totalPages,
        pagination: {
          total: paginated.total,
          page: paginated.page,
          limit: paginated.limit,
          totalPages: paginated.totalPages,
        },
      })
    );
  }

  /**
   * POST /api/v1/jobs/render/:id/cancel
   */
  async cancelRenderJob(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    if (!request.user?.userId) {
      throw new AuthenticationError('User authentication required');
    }

    const userId = request.user.userId;
    const userRole = request.user.role;
    const job = await renderJobService.cancelRenderJob(request.params.id, userId, userRole);

    return reply.status(200).send(createSuccessResponse(job));
  }

  /**
   * POST /api/v1/jobs/render/:id/retry
   */
  async retryRenderJob(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    if (!request.user?.userId) {
      throw new AuthenticationError('User authentication required');
    }

    const userId = request.user.userId;
    const userRole = request.user.role;
    const job = await renderJobService.retryRenderJob(request.params.id, userId, userRole);

    return reply.status(200).send(createSuccessResponse(job));
  }
}

export const renderJobController = new RenderJobController();
