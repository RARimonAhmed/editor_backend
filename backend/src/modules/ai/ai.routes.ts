import { FastifyInstance } from 'fastify';
import { aiController } from './ai.controller.js';
import { authenticate } from '../auth/auth.middleware.js';

export async function aiRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  fastify.post(
    '/transcribe',
    {
      schema: {
        description: 'Transcribe audio/video to text with word-level timestamps (Whisper AI)',
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
        description: 'Generate dynamic, animated subtitle clips from video audio',
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
        description: 'Detect dead air/silences in voiceover for automatic jump-cuts',
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
        description: 'Generate synthetic B-roll visual clips from text prompt',
        tags: ['AI Video Services'],
        security: [{ bearerAuth: [] }],
      },
    },
    aiController.generateBroll.bind(aiController)
  );
}
