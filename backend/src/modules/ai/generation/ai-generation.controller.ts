import { FastifyRequest, FastifyReply } from 'fastify';
import { aiGenerationService } from './ai-generation.service.js';
import {
  generateImageSchema,
  generateVideoSchema,
  generateMusicSchema,
  generateSfxSchema,
  generateVoiceSchema,
  generateScriptSchema,
} from './ai-generation.schemas.js';

export class AIGenerationController {
  async generateImage(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = (request as any).user?.userId || (request as any).user?.id || (request.headers['x-user-id'] as string) || 'anonymous';
    const parsed = generateImageSchema.parse(request.body);
    const job = await aiGenerationService.generateImage(userId, parsed as any);
    reply.status(202).send({
      success: true,
      data: {
        jobId: job.id,
        status: job.status,
        type: job.type,
        estimatedCostCredits: job.usage?.estimatedCostCredits || 5,
        pollUrl: `/v1/ai/jobs/${job.id}`,
      },
    });
  }

  async generateVideo(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = (request as any).user?.userId || (request as any).user?.id || (request.headers['x-user-id'] as string) || 'anonymous';
    const parsed = generateVideoSchema.parse(request.body);
    const job = await aiGenerationService.generateVideo(userId, parsed as any);
    reply.status(202).send({
      success: true,
      data: {
        jobId: job.id,
        status: job.status,
        type: job.type,
        estimatedCostCredits: job.usage?.estimatedCostCredits || 15,
        pollUrl: `/v1/ai/jobs/${job.id}`,
      },
    });
  }

  async generateMusic(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = (request as any).user?.userId || (request as any).user?.id || (request.headers['x-user-id'] as string) || 'anonymous';
    const parsed = generateMusicSchema.parse(request.body);
    const job = await aiGenerationService.generateMusic(userId, parsed as any);
    reply.status(202).send({
      success: true,
      data: {
        jobId: job.id,
        status: job.status,
        type: job.type,
        estimatedCostCredits: job.usage?.estimatedCostCredits || 5,
        pollUrl: `/v1/ai/jobs/${job.id}`,
      },
    });
  }

  async generateSfx(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = (request as any).user?.userId || (request as any).user?.id || (request.headers['x-user-id'] as string) || 'anonymous';
    const parsed = generateSfxSchema.parse(request.body);
    const job = await aiGenerationService.generateSfx(userId, parsed as any);
    reply.status(202).send({
      success: true,
      data: {
        jobId: job.id,
        status: job.status,
        type: job.type,
        estimatedCostCredits: job.usage?.estimatedCostCredits || 2,
        pollUrl: `/v1/ai/jobs/${job.id}`,
      },
    });
  }

  async generateVoice(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = (request as any).user?.userId || (request as any).user?.id || (request.headers['x-user-id'] as string) || 'anonymous';
    const parsed = generateVoiceSchema.parse(request.body);
    const job = await aiGenerationService.generateVoice(userId, parsed as any);
    reply.status(202).send({
      success: true,
      data: {
        jobId: job.id,
        status: job.status,
        type: job.type,
        estimatedCostCredits: job.usage?.estimatedCostCredits || 2,
        pollUrl: `/v1/ai/jobs/${job.id}`,
      },
    });
  }

  async generateScript(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = (request as any).user?.userId || (request as any).user?.id || (request.headers['x-user-id'] as string) || 'anonymous';
    const parsed = generateScriptSchema.parse(request.body);
    const job = await aiGenerationService.generateScript(userId, parsed as any);
    reply.status(202).send({
      success: true,
      data: {
        jobId: job.id,
        status: job.status,
        type: job.type,
        estimatedCostCredits: job.usage?.estimatedCostCredits || 2,
        pollUrl: `/v1/ai/jobs/${job.id}`,
      },
    });
  }
}

export const aiGenerationController = new AIGenerationController();
