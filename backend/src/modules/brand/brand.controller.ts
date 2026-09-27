import { FastifyRequest, FastifyReply } from 'fastify';
import { brandService } from './brand.service.js';
import { projectsService } from '../projects/projects.service.js';
import { SocialPlatform } from './brand.types.js';
import {
  querySocialPresetsSchema,
  upsertBrandKitSchema,
  applyBrandKitToProjectSchema,
} from './brand.schemas.js';
import { createSuccessResponse } from '../../core/response.js';
import { ValidationError, NotFoundError, AuthenticationError } from '../../core/errors.js';

export class BrandController {
  /**
   * GET /api/v1/presets/social
   */
  async listSocialPresets(request: FastifyRequest, reply: FastifyReply) {
    const parse = querySocialPresetsSchema.safeParse({ query: request.query });
    const platform = parse.success ? (parse.data.query.platform as SocialPlatform | undefined) : undefined;
    const presets = brandService.getSocialExportPresets(platform);
    return reply.status(200).send(createSuccessResponse(presets));
  }

  /**
   * GET /api/v1/presets/social/:id
   */
  async getSocialPreset(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    const { id } = request.params;
    const preset = brandService.getSocialExportPresetById(id);
    if (!preset) {
      throw new NotFoundError(`Social preset '${id}' not found`);
    }
    return reply.status(200).send(createSuccessResponse(preset));
  }

  /**
   * GET /api/v1/brand-kit
   */
  async getBrandKit(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user?.userId;
    if (!userId) {
      throw new AuthenticationError('Authentication required');
    }
    const brandKit = await brandService.getBrandKit(userId);
    return reply.status(200).send(createSuccessResponse(brandKit));
  }

  /**
   * PUT /api/v1/brand-kit
   */
  async upsertBrandKit(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user?.userId;
    if (!userId) {
      throw new AuthenticationError('Authentication required');
    }

    const parse = upsertBrandKitSchema.safeParse({ body: request.body });
    if (!parse.success) {
      throw new ValidationError('Invalid brand kit payload', parse.error.format());
    }

    const brandKit = await brandService.upsertBrandKit(userId, parse.data.body);
    return reply.status(200).send(createSuccessResponse(brandKit));
  }

  /**
   * POST /api/v1/brand-kit/apply
   */
  async applyToProject(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user?.userId;
    if (!userId) {
      throw new AuthenticationError('Authentication required');
    }

    const parse = applyBrandKitToProjectSchema.safeParse({ body: request.body });
    if (!parse.success) {
      throw new ValidationError('Invalid apply payload', parse.error.format());
    }

    const { projectId } = parse.data.body;
    const saved = await brandService.applyBrandKitToProjectId(projectId, userId);

    return reply.status(200).send(
      createSuccessResponse(saved, {
        message: 'Brand kit applied to project successfully',
      })
    );
  }
}

export const brandController = new BrandController();
