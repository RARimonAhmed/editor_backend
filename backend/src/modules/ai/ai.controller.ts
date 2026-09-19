import { FastifyRequest, FastifyReply } from 'fastify';
import { aiGatewayService } from './ai-gateway.service.js';
import { aiService } from './ai.service.js';
import {
  textGenerationSchema,
  structuredJsonSchema,
  speechToTextSchema,
  textToSpeechSchema,
  imageGenerationSchema,
  videoGenerationSchema,
  embeddingSchema,
  visionSchema,
  audioAnalysisSchema,
  legacyTranscribeSchema,
  legacyCaptionsSchema,
  legacySmartCutSchema,
  legacyBrollSchema,
} from './ai.schemas.js';
import { createSuccessResponse } from '../../core/response.js';
import { ValidationError } from '../../core/errors.js';

export class AIController {
  // 1. Text Generation: POST /v1/ai/text
  async generateText(request: FastifyRequest, reply: FastifyReply) {
    const parse = textGenerationSchema.safeParse(request.body);
    if (!parse.success) throw new ValidationError('Invalid text generation request', parse.error.format());

    const userId = request.user!.userId;
    const result = await aiGatewayService.generateText(userId, parse.data);
    return reply.status(200).send(createSuccessResponse(result));
  }

  // 2. Structured JSON: POST /v1/ai/structured-json
  async generateStructuredJson(request: FastifyRequest, reply: FastifyReply) {
    const parse = structuredJsonSchema.safeParse(request.body);
    if (!parse.success) throw new ValidationError('Invalid structured JSON request', parse.error.format());

    const userId = request.user!.userId;
    const result = await aiGatewayService.generateStructuredJson(userId, parse.data);
    return reply.status(200).send(createSuccessResponse(result));
  }

  // 3. Speech to Text: POST /v1/ai/speech-to-text
  async speechToText(request: FastifyRequest, reply: FastifyReply) {
    const parse = speechToTextSchema.safeParse(request.body);
    if (!parse.success) throw new ValidationError('Invalid speech-to-text request', parse.error.format());

    const userId = request.user!.userId;
    const result = await aiGatewayService.speechToText(userId, parse.data);
    return reply.status(200).send(createSuccessResponse(result));
  }

  // 4. Text to Speech: POST /v1/ai/text-to-speech
  async textToSpeech(request: FastifyRequest, reply: FastifyReply) {
    const parse = textToSpeechSchema.safeParse(request.body);
    if (!parse.success) throw new ValidationError('Invalid text-to-speech request', parse.error.format());

    const userId = request.user!.userId;
    const result = await aiGatewayService.textToSpeech(userId, parse.data);
    return reply.status(200).send(createSuccessResponse(result));
  }

  // 5. Image Generation: POST /v1/ai/image
  async generateImage(request: FastifyRequest, reply: FastifyReply) {
    const parse = imageGenerationSchema.safeParse(request.body);
    if (!parse.success) throw new ValidationError('Invalid image generation request', parse.error.format());

    const userId = request.user!.userId;
    const result = await aiGatewayService.generateImage(userId, parse.data);
    return reply.status(200).send(createSuccessResponse(result));
  }

  // 6. Video Generation: POST /v1/ai/video
  async generateVideo(request: FastifyRequest, reply: FastifyReply) {
    const parse = videoGenerationSchema.safeParse(request.body);
    if (!parse.success) throw new ValidationError('Invalid video generation request', parse.error.format());

    const userId = request.user!.userId;
    const result = await aiGatewayService.generateVideo(userId, parse.data);
    return reply.status(200).send(createSuccessResponse(result));
  }

  // 7. Embedding: POST /v1/ai/embedding
  async generateEmbedding(request: FastifyRequest, reply: FastifyReply) {
    const parse = embeddingSchema.safeParse(request.body);
    if (!parse.success) throw new ValidationError('Invalid embedding request', parse.error.format());

    const userId = request.user!.userId;
    const result = await aiGatewayService.generateEmbedding(userId, parse.data);
    return reply.status(200).send(createSuccessResponse(result));
  }

  // 8. Vision: POST /v1/ai/vision
  async analyzeVision(request: FastifyRequest, reply: FastifyReply) {
    const parse = visionSchema.safeParse(request.body);
    if (!parse.success) throw new ValidationError('Invalid vision request', parse.error.format());

    const userId = request.user!.userId;
    const result = await aiGatewayService.analyzeVision(userId, parse.data);
    return reply.status(200).send(createSuccessResponse(result));
  }

  // 9. Audio Analysis: POST /v1/ai/audio-analysis
  async analyzeAudio(request: FastifyRequest, reply: FastifyReply) {
    const parse = audioAnalysisSchema.safeParse(request.body);
    if (!parse.success) throw new ValidationError('Invalid audio analysis request', parse.error.format());

    const userId = request.user!.userId;
    const result = await aiGatewayService.analyzeAudio(userId, parse.data);
    return reply.status(200).send(createSuccessResponse(result));
  }

  // List Providers: GET /v1/ai/providers
  async listProviders(_request: FastifyRequest, reply: FastifyReply) {
    const providers = aiGatewayService.listAdapters();
    return reply.status(200).send(createSuccessResponse(providers, { total: providers.length }));
  }

  // --------------------------------------------------------------------------
  // LEGACY BACKWARD COMPATIBLE HANDLERS
  // --------------------------------------------------------------------------
  async transcribe(request: FastifyRequest, reply: FastifyReply) {
    const parse = legacyTranscribeSchema.safeParse(request.body);
    if (!parse.success) throw new ValidationError('Invalid transcribe request', parse.error.format());

    const userId = request.user!.userId;
    const result = await aiService.transcribe(userId, parse.data.mediaUrl, parse.data.language, parse.data.provider);
    return reply.status(200).send(createSuccessResponse(result));
  }

  async generateCaptions(request: FastifyRequest, reply: FastifyReply) {
    const parse = legacyCaptionsSchema.safeParse(request.body);
    if (!parse.success) throw new ValidationError('Invalid captions request', parse.error.format());

    const userId = request.user!.userId;
    const result = await aiService.generateCaptions(userId, parse.data.mediaUrl, parse.data.style, parse.data.provider);
    return reply.status(200).send(createSuccessResponse(result));
  }

  async detectSilences(request: FastifyRequest, reply: FastifyReply) {
    const parse = legacySmartCutSchema.safeParse(request.body);
    if (!parse.success) throw new ValidationError('Invalid silence detection request', parse.error.format());

    const userId = request.user!.userId;
    const result = await aiService.detectSilences(userId, parse.data.mediaUrl, parse.data.minSilenceDurationSeconds, parse.data.provider);
    return reply.status(200).send(createSuccessResponse(result));
  }

  async generateBroll(request: FastifyRequest, reply: FastifyReply) {
    const parse = legacyBrollSchema.safeParse(request.body);
    if (!parse.success) throw new ValidationError('Invalid B-roll request', parse.error.format());

    const userId = request.user!.userId;
    const result = await aiService.generateBroll(userId, parse.data.prompt, parse.data.durationSeconds, parse.data.provider);
    return reply.status(200).send(createSuccessResponse(result));
  }
}

export const aiController = new AIController();
