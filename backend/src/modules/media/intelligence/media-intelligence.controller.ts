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
   * GET /v1/search/media
   * Multi-modal semantic search querying visual objects, speech, scenes, and vector embeddings via GET query params.
   * Returns matching source assets with real localized timeline intervals.
   */
  async searchMediaGet(request: FastifyRequest, reply: FastifyReply) {
    const query = (request.query || {}) as any;
    const q = query.q || query.query || '';
    if (!q) {
      throw new ValidationError('Query parameter "q" or "query" is required');
    }

    const userId = request.user!.userId;
    const results = await mediaIntelligenceService.search(userId, {
      query: q,
      limit: query.limit ? Number(query.limit) : 20,
      minScore: query.minScore ? Number(query.minScore) : 0.2,
      mode: query.mode || 'hybrid',
      category: query.category,
    });

    return reply.status(200).send(createSuccessResponse(results, { count: results.length, query: q }));
  }

  /**
   * GET /v1/media/:id/intelligence or GET /v1/media/:id/analysis
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

  /**
   * GET /v1/media/:id/analysis (explicit alias)
   */
  async getAnalysis(request: FastifyRequest, reply: FastifyReply) {
    return this.getIntelligence(request, reply);
  }

  /**
   * POST /v1/media/:id/analysis
   * Submits an asynchronous media intelligence analysis pipeline job.
   */
  async startAnalysisJob(request: FastifyRequest, reply: FastifyReply) {
    const paramParse = mediaIntelligenceParamsSchema.safeParse(request.params);
    if (!paramParse.success) {
      throw new ValidationError('Invalid media asset ID', paramParse.error.format());
    }

    const userId = request.user!.userId;
    const assetId = paramParse.data.id;

    const { aiJobService } = await import('../../ai/jobs/ai-job.service.js');
    const { job } = await aiJobService.createJob(userId, {
      type: 'media_analysis',
      input: {
        mediaAssetId: assetId,
        sourceMetadata: (request.body as any)?.sourceMetadata,
      },
    });

    return reply.status(202).send(createSuccessResponse(job));
  }
}

export const mediaIntelligenceController = new MediaIntelligenceController();
