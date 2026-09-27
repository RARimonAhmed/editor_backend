import { FastifyRequest, FastifyReply } from 'fastify';
import { templateService } from './template.service.js';
import { listTemplatesQuerySchema, useTemplateSchema } from './template.schemas.js';
import { createSuccessResponse } from '../../core/response.js';
import { ValidationError, AuthenticationError } from '../../core/errors.js';

export class TemplateController {
  /**
   * GET /api/v1/templates
   */
  async listTemplates(request: FastifyRequest, reply: FastifyReply) {
    const parse = listTemplatesQuerySchema.safeParse(request.query);
    if (!parse.success) {
      throw new ValidationError('Invalid query parameters', parse.error.format());
    }

    const userId = request.user?.userId;
    const result = await templateService.listTemplates(parse.data, userId);
    return reply.status(200).send(createSuccessResponse(result.items, { pagination: result }));
  }

  /**
   * GET /api/v1/templates/:id
   */
  async getTemplateById(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const template = await templateService.getTemplateById(id);
    return reply.status(200).send(createSuccessResponse(template));
  }

  /**
   * POST /api/v1/templates/:id/use
   */
  async useTemplate(request: FastifyRequest, reply: FastifyReply) {
    if (!request.user?.userId) {
      throw new AuthenticationError('User authentication required to instantiate template');
    }

    const { id } = request.params as { id: string };
    const parse = useTemplateSchema.safeParse(request.body || {});
    if (!parse.success) {
      throw new ValidationError('Invalid use template payload', parse.error.format());
    }

    const userId = request.user.userId;
    const project = await templateService.useTemplate(id, userId, parse.data as any);

    // If applyBrandKit is requested, apply brand kit to instantiated project
    if (parse.data.applyBrandKit || parse.data.brandKitId) {
      const { brandService } = await import('../brand/brand.service.js');
      await brandService.applyBrandKitToProjectId(project.id, userId, parse.data.brandKitId);
    }

    return reply.status(201).send(createSuccessResponse(project));
  }

  /**
   * POST /api/v1/templates/:id/favorite
   */
  async toggleFavorite(request: FastifyRequest, reply: FastifyReply) {
    if (!request.user?.userId) {
      throw new AuthenticationError('User authentication required to favorite template');
    }

    const { id } = request.params as { id: string };
    const result = await templateService.toggleFavorite(id, request.user.userId);
    return reply.status(200).send(createSuccessResponse(result));
  }
}

export const templateController = new TemplateController();
