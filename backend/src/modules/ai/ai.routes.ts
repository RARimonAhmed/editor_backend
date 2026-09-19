import { FastifyInstance } from 'fastify';
import { aiController } from './ai.controller.js';
import { aiJobController } from './jobs/ai-job.controller.js';
import { authenticate } from '../auth/auth.middleware.js';

export async function aiRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  // 0. List Available AI Providers & Capabilities
  fastify.get(
    '/providers',
    {
      schema: {
        description: 'List available server-side AI providers and supported capabilities',
        tags: ['AI Gateway'],
        security: [{ bearerAuth: [] }],
      },
    },
    aiController.listProviders.bind(aiController)
  );

  // 1. Text Generation
  fastify.post(
    '/text',
    {
      schema: {
        description: 'Generate text, scripts, or translations with provider selection',
        tags: ['AI Gateway'],
        security: [{ bearerAuth: [] }],
      },
    },
    aiController.generateText.bind(aiController)
  );

  // 2. Structured JSON
  fastify.post(
    '/structured-json',
    {
      schema: {
        description: 'Generate structured JSON strictly conforming to provided schema',
        tags: ['AI Gateway'],
        security: [{ bearerAuth: [] }],
      },
    },
    aiController.generateStructuredJson.bind(aiController)
  );

  // 3. Speech-to-Text
  fastify.post(
    '/speech-to-text',
    {
      schema: {
        description: 'Transcribe audio/video to text with word-level timestamps',
        tags: ['AI Gateway'],
        security: [{ bearerAuth: [] }],
      },
    },
    aiController.speechToText.bind(aiController)
  );

  // 4. Text-to-Speech
  fastify.post(
    '/text-to-speech',
    {
      schema: {
        description: 'Synthesize speech/voiceover from text',
        tags: ['AI Gateway'],
        security: [{ bearerAuth: [] }],
      },
    },
    aiController.textToSpeech.bind(aiController)
  );

  // 5. Image Generation
  fastify.post(
    '/image',
    {
      schema: {
        description: 'Generate synthetic visual images from text prompt',
        tags: ['AI Gateway'],
        security: [{ bearerAuth: [] }],
      },
    },
    aiController.generateImage.bind(aiController)
  );

  // 6. Video Generation
  fastify.post(
    '/video',
    {
      schema: {
        description: 'Generate synthetic video clips or B-roll footage',
        tags: ['AI Gateway'],
        security: [{ bearerAuth: [] }],
      },
    },
    aiController.generateVideo.bind(aiController)
  );

  // 7. Embedding
  fastify.post(
    '/embedding',
    {
      schema: {
        description: 'Generate semantic vector embeddings for text search and indexing',
        tags: ['AI Gateway'],
        security: [{ bearerAuth: [] }],
      },
    },
    aiController.generateEmbedding.bind(aiController)
  );

  // 8. Vision
  fastify.post(
    '/vision',
    {
      schema: {
        description: 'Perform multimodal vision understanding and object detection on images',
        tags: ['AI Gateway'],
        security: [{ bearerAuth: [] }],
      },
    },
    aiController.analyzeVision.bind(aiController)
  );

  // 9. Audio Analysis
  fastify.post(
    '/audio-analysis',
    {
      schema: {
        description: 'Analyze audio for silences, beats (BPM), and sound classification',
        tags: ['AI Gateway'],
        security: [{ bearerAuth: [] }],
      },
    },
    aiController.analyzeAudio.bind(aiController)
  );

  // --------------------------------------------------------------------------
  // LEGACY BACKWARD COMPATIBLE VIDEO EDITOR ROUTES
  // --------------------------------------------------------------------------
  fastify.post(
    '/transcribe',
    {
      schema: {
        description: 'Transcribe audio/video to text with word-level timestamps (Legacy)',
        tags: ['AI Video Services'],
        security: [{ bearerAuth: [] }],
      },
    },
    aiController.transcribe.bind(aiController)
  );

  fastify.post(
    '/captions',
    {
      schema: {
        description: 'Generate dynamic, animated subtitle clips from video audio (Legacy)',
        tags: ['AI Video Services'],
        security: [{ bearerAuth: [] }],
      },
    },
    aiController.generateCaptions.bind(aiController)
  );

  fastify.post(
    '/smart-cut',
    {
      schema: {
        description: 'Detect dead air/silences in voiceover for automatic jump-cuts (Legacy)',
        tags: ['AI Video Services'],
        security: [{ bearerAuth: [] }],
      },
    },
    aiController.detectSilences.bind(aiController)
  );

  fastify.post(
    '/broll',
    {
      schema: {
        description: 'Generate synthetic B-roll visual clips from text prompt (Legacy)',
        tags: ['AI Video Services'],
        security: [{ bearerAuth: [] }],
      },
    },
    aiController.generateBroll.bind(aiController)
  );

  // --------------------------------------------------------------------------
  // ASYNCHRONOUS AI JOB SYSTEM (REDIS QUEUE + WORKER + TELEMETRY + NOTIFICATION)
  // --------------------------------------------------------------------------
  fastify.post(
    '/jobs',
    {
      schema: {
        description: 'Submit an asynchronous AI job with idempotency and deduplication',
        tags: ['AI Jobs'],
        security: [{ bearerAuth: [] }],
      },
    },
    aiJobController.createJob.bind(aiJobController)
  );

  fastify.get(
    '/jobs',
    {
      schema: {
        description: 'List user asynchronous AI jobs with status/type filtering and pagination',
        tags: ['AI Jobs'],
        security: [{ bearerAuth: [] }],
      },
    },
    aiJobController.listJobs.bind(aiJobController)
  );

  fastify.get(
    '/jobs/:id',
    {
      schema: {
        description: 'Get status, progress, input, output, usage, and cost of an AI job',
        tags: ['AI Jobs'],
        security: [{ bearerAuth: [] }],
      },
    },
    aiJobController.getJob.bind(aiJobController)
  );

  fastify.post(
    '/jobs/:id/cancel',
    {
      schema: {
        description: 'Cancel an active or queued AI job and refund reserved credits',
        tags: ['AI Jobs'],
        security: [{ bearerAuth: [] }],
      },
    },
    aiJobController.cancelJob.bind(aiJobController)
  );

  fastify.post(
    '/jobs/:id/retry',
    {
      schema: {
        description: 'Retry a failed or cancelled AI job',
        tags: ['AI Jobs'],
        security: [{ bearerAuth: [] }],
      },
    },
    aiJobController.retryJob.bind(aiJobController)
  );

  fastify.get(
    '/jobs/:id/events',
    {
      schema: {
        description: 'Server-Sent Events (SSE) stream for real-time AI job progress and completion',
        tags: ['AI Jobs'],
        security: [{ bearerAuth: [] }],
      },
    },
    aiJobController.getJobEvents.bind(aiJobController)
  );
}
