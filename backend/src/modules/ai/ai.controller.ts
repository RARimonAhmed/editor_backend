import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { aiService } from './ai.service.js';
import { createSuccessResponse } from '../../core/response.js';
import { ValidationError } from '../../core/errors.js';

const transcribeSchema = z.object({
  mediaUrl: z.string().url('A valid media URL is required'),
  language: z.string().default('en'),
  provider: z.string().optional(),
});

const captionsSchema = z.object({
  mediaUrl: z.string().url('A valid media URL is required'),
  style: z.string().default('cinematic-glow'),
  provider: z.string().optional(),
});

const silenceSchema = z.object({
  mediaUrl: z.string().url('A valid media URL is required'),
  minSilenceDurationSeconds: z.number().positive().default(0.5),
  provider: z.string().optional(),
});

const brollSchema = z.object({
  prompt: z.string().min(3, 'Prompt must be at least 3 characters'),
  durationSeconds: z.number().int().min(1).max(30).default(5),
  provider: z.string().optional(),
});

export class AIController {
  async transcribe(request: FastifyRequest, reply: FastifyReply) {
    const parseResult = transcribeSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid transcribe request', parseResult.error.format());
    }

    const userId = request.user!.userId;
    const { mediaUrl, language, provider } = parseResult.data;
    const result = await aiService.transcribe(userId, mediaUrl, language, provider);
    return reply.status(200).send(createSuccessResponse(result));
  }

  async generateCaptions(request: FastifyRequest, reply: FastifyReply) {
    const parseResult = captionsSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid captions request', parseResult.error.format());
    }

    const userId = request.user!.userId;
    const { mediaUrl, style, provider } = parseResult.data;
    const result = await aiService.generateCaptions(userId, mediaUrl, style, provider);
    return reply.status(200).send(createSuccessResponse(result));
  }

  async detectSilences(request: FastifyRequest, reply: FastifyReply) {
    const parseResult = silenceSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid silence detection request', parseResult.error.format());
    }

    const userId = request.user!.userId;
    const { mediaUrl, minSilenceDurationSeconds, provider } = parseResult.data;
    const result = await aiService.detectSilences(userId, mediaUrl, minSilenceDurationSeconds, provider);
    return reply.status(200).send(createSuccessResponse(result));
  }

  async generateBroll(request: FastifyRequest, reply: FastifyReply) {
    const parseResult = brollSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid B-roll request', parseResult.error.format());
    }

    const userId = request.user!.userId;
    const { prompt, durationSeconds, provider } = parseResult.data;
    const result = await aiService.generateBroll(userId, prompt, durationSeconds, provider);
    return reply.status(200).send(createSuccessResponse(result));
  }
}

export const aiController = new AIController();
