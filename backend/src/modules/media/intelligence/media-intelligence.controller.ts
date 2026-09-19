import { FastifyRequest, FastifyReply } from 'fastify';
import { mediaIntelligenceService } from './media-intelligence.service.js';
import {
  semanticSearchQuerySchema,
  generateIntelligenceSchema,
  mediaIntelligenceParamsSchema,
} from './intelligence.schemas.js';
import { createSuccessResponse } from '../../../core/response.js';
import { ValidationError } from '../../../core/errors.js';

export class MediaIntelligenceController {
  /**
   * POST /v1/media/search/semantic
   * Multi-modal semantic search querying visual objects, speech, scenes, and vector embeddings.
   * Returns matching source assets with localized timeline intervals.
   */
  async search(request: FastifyRequest, reply: FastifyReply) {
    const parse = semanticSearchQuerySchema.safeParse(request.body);
    if (!parse.success) {
      throw new ValidationError('Invalid semantic search query', parse.error.format());
    }

    const userId = request.user!.userId;
    const results = await mediaIntelligenceService.search(userId, parse.data);
    return reply.status(200).send(createSuccessResponse(results, { count: results.length }));
  }

  /**
   * POST /v1/media/:id/intelligence
   * Triggers or refreshes multi-modal intelligence extraction for an asset.
   */
  async generateIntelligence(request: FastifyRequest, reply: FastifyReply) {
    const paramParse = mediaIntelligenceParamsSchema.safeParse(request.params);
    if (!paramParse.success) {
      throw new ValidationError('Invalid media asset ID', paramParse.error.format());
    }

    const bodyParse = generateIntelligenceSchema.safeParse(request.body || {});
    const userId = request.user!.userId;

    const result = await mediaIntelligenceService.generateAndIndex(
      paramParse.data.id,
      userId,
      bodyParse.success ? bodyParse.data.sourceMetadata : undefined
    );

    return reply.status(200).send(createSuccessResponse(result));
  }

  /**
   * GET /v1/media/:id/intelligence
   * Retrieves previously generated intelligence document for an asset.
   */
  async getIntelligence(request: FastifyRequest, reply: FastifyReply) {
    const paramParse = mediaIntelligenceParamsSchema.safeParse(request.params);
    if (!paramParse.success) {
      throw new ValidationError('Invalid media asset ID', paramParse.error.format());
    }

    const userId = request.user!.userId;
    const result = await mediaIntelligenceService.getIntelligence(paramParse.data.id, userId);
    return reply.status(200).send(createSuccessResponse(result));
  }
}

export const mediaIntelligenceController = new MediaIntelligenceController();
