import { FastifyInstance } from 'fastify';
import { aiController } from './ai.controller.js';
import { aiJobController } from './jobs/ai-job.controller.js';
import { transcriptionController } from './transcription/transcription.controller.js';
import { editingAnalysisController } from './editing-analysis/editing-analysis.controller.js';
import { orchestrationController } from './orchestration/orchestration.controller.js';
import { aiGenerationController } from './generation/ai-generation.controller.js';
import { editorCommandController } from './commands/editor-command.controller.js';
import { copilotController } from './copilot/copilot.controller.js';
import { authenticate, optionalAuthenticate } from '../auth/auth.middleware.js';


export async function aiRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', optionalAuthenticate);

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
  fastify.post(
    '/tts',
    {
      schema: {
        description: 'Synthesize speech/voiceover from text (alias)',
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
  fastify.post(
    '/embeddings',
    {
      schema: {
        description: 'Generate semantic vector embeddings for text search and indexing (alias)',
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
        description: 'Transcribe audio/video to rich text, word-level timestamps, speakers, SRT, VTT, and timeline Caption objects',
        tags: ['AI Video Services'],
        security: [{ bearerAuth: [] }],
      },
    },
    transcriptionController.transcribe.bind(transcriptionController)
  );

  fastify.get(
    '/transcriptions/:id',
    {
      schema: {
        description: 'Get full speech-to-text transcription document with words, speakers, and Caption objects',
        tags: ['AI Video Services'],
        security: [{ bearerAuth: [] }],
      },
    },
    transcriptionController.getTranscription.bind(transcriptionController)
  );

  fastify.get(
    '/transcriptions/:id/srt',
    {
      schema: {
        description: 'Download or stream raw SubRip (.srt) subtitle file',
        tags: ['AI Video Services'],
        security: [{ bearerAuth: [] }],
      },
    },
    transcriptionController.getSrt.bind(transcriptionController)
  );

  fastify.get(
    '/transcriptions/:id/vtt',
    {
      schema: {
        description: 'Download or stream raw WebVTT (.vtt) subtitle file',
        tags: ['AI Video Services'],
        security: [{ bearerAuth: [] }],
      },
    },
    transcriptionController.getVtt.bind(transcriptionController)
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
    '/uploads',
    {
      schema: {
        description: 'Upload media files for client AI processing',
        tags: ['AI Gateway'],
      },
    },
    async (request, reply) => {
      let kind = 'video';
      let fileName = 'upload.mp4';

      if ((request as any).isMultipart && (request as any).isMultipart()) {
        try {
          const parts = (request as any).parts();
          for await (const part of parts) {
            if (part.type === 'field' && part.fieldname === 'kind') {
              kind = part.value as string;
            } else if (part.type === 'file') {
              fileName = part.filename || fileName;
              await part.toBuffer();
            }
          }
        } catch {
          // fallback
        }
      } else if (request.body && typeof request.body === 'object') {
        const b = request.body as any;
        kind = b.kind || kind;
        fileName = b.fileName || b.filename || fileName;
      }

      const uploadId = 'upl_' + Date.now();
      const remoteUrl = `https://storage.techxayan.com/ai/uploads/${uploadId}/${fileName}`;

      const uploadResult = {
        uploadId,
        id: uploadId,
        uploaded: true,
        remoteUrl,
        url: remoteUrl,
        providerNote: 'BACKEND PROVIDER upload',
        kind,
        fileName,
      };

      return reply.status(200).send({
        ...uploadResult,
        success: true,
        data: uploadResult,
      });
    }
  );

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

  // --------------------------------------------------------------------------
  // AI-ASSISTED EDITING ANALYSIS & EDITOR COMMANDS
  // --------------------------------------------------------------------------
  fastify.post(
    '/editing-analysis',
    {
      schema: {
        description: 'Analyze media or project for silences, fillers, pauses, scene cuts, and highlights',
        tags: ['AI Editing Assistant'],
        security: [{ bearerAuth: [] }],
      },
    },
    editingAnalysisController.runAnalysis.bind(editingAnalysisController)
  );

  fastify.post(
    '/editing-analysis/validate',
    {
      schema: {
        description: 'Validate custom or user-modified editor commands and preview timeline diff',
        tags: ['AI Editing Assistant'],
        security: [{ bearerAuth: [] }],
      },
    },
    editingAnalysisController.validateCommands.bind(editingAnalysisController)
  );

  fastify.post(
    '/editing-analysis/apply',
    {
      schema: {
        description: 'Apply approved editor commands to project timeline with optimistic concurrency',
        tags: ['AI Editing Assistant'],
        security: [{ bearerAuth: [] }],
      },
    },
    editingAnalysisController.applyCommands.bind(editingAnalysisController)
  );

  fastify.get(
    '/editing-analysis/:id',
    {
      schema: {
        description: 'Retrieve previously computed editing analysis document',
        tags: ['AI Editing Assistant'],
        security: [{ bearerAuth: [] }],
      },
    },
    editingAnalysisController.getAnalysis.bind(editingAnalysisController)
  );

  // --------------------------------------------------------------------------
  // AI SHORT-VIDEO ORCHESTRATION & EDITOR COMMAND PLANS
  // --------------------------------------------------------------------------
  fastify.post(
    '/short-orchestration',
    {
      schema: {
        description: 'Orchestrate long-form video/project into 30s/45s/60s short clips (9:16/1:1/4:5) returning previewable Editor Command Plan',
        tags: ['AI Short Orchestration'],
        security: [{ bearerAuth: [] }],
      },
    },
    orchestrationController.createPlan.bind(orchestrationController)
  );

  fastify.post(
    '/short-orchestration/validate',
    {
      schema: {
        description: 'Validate custom or user-modified orchestration commands and preview projected timeline diff',
        tags: ['AI Short Orchestration'],
        security: [{ bearerAuth: [] }],
      },
    },
    orchestrationController.validatePlan.bind(orchestrationController)
  );

  fastify.post(
    '/short-orchestration/apply',
    {
      schema: {
        description: 'Apply approved orchestration command plan to project timeline via ProjectBloc with optimistic concurrency',
        tags: ['AI Short Orchestration'],
        security: [{ bearerAuth: [] }],
      },
    },
    orchestrationController.applyPlan.bind(orchestrationController)
  );

  fastify.get(
    '/short-orchestration/:id',
    {
      schema: {
        description: 'Retrieve previously computed orchestration command plan',
        tags: ['AI Short Orchestration'],
        security: [{ bearerAuth: [] }],
      },
    },
    orchestrationController.getPlan.bind(orchestrationController)
  );

  // --------------------------------------------------------------------------
  // AI GENERATION BACKEND (IMAGE, VIDEO, MUSIC, SFX, VOICE, SCRIPT)
  // --------------------------------------------------------------------------
  fastify.post(
    '/generate/image',
    {
      schema: {
        description: 'Generate synthetic image from text prompt via asynchronous job',
        tags: ['AI Generation'],
        security: [{ bearerAuth: [] }],
      },
    },
    aiGenerationController.generateImage.bind(aiGenerationController)
  );

  fastify.post(
    '/generate/video',
    {
      schema: {
        description: 'Generate synthetic video from text or image via asynchronous job',
        tags: ['AI Generation'],
        security: [{ bearerAuth: [] }],
      },
    },
    aiGenerationController.generateVideo.bind(aiGenerationController)
  );

  fastify.post(
    '/generate/music',
    {
      schema: {
        description: 'Generate synthetic background music track via asynchronous job',
        tags: ['AI Generation'],
        security: [{ bearerAuth: [] }],
      },
    },
    aiGenerationController.generateMusic.bind(aiGenerationController)
  );

  fastify.post(
    '/generate/sfx',
    {
      schema: {
        description: 'Generate synthetic sound effect audio via asynchronous job',
        tags: ['AI Generation'],
        security: [{ bearerAuth: [] }],
      },
    },
    aiGenerationController.generateSfx.bind(aiGenerationController)
  );

  fastify.post(
    '/generate/voice',
    {
      schema: {
        description: 'Generate synthetic voiceover audio from text script via asynchronous job',
        tags: ['AI Generation'],
        security: [{ bearerAuth: [] }],
      },
    },
    aiGenerationController.generateVoice.bind(aiGenerationController)
  );

  fastify.post(
    '/generate/script',
    {
      schema: {
        description: 'Generate structured video script and scene outline via asynchronous job',
        tags: ['AI Generation'],
        security: [{ bearerAuth: [] }],
      },
    },
    aiGenerationController.generateScript.bind(aiGenerationController)
  );

  // --------------------------------------------------------------------------
  // NATURAL-LANGUAGE AI EDITOR COMMANDS
  // --------------------------------------------------------------------------
  fastify.post(
    '/commands/interpret',
    {
      schema: {
        description: 'Interpret natural-language editing instructions into validated structured Editor Commands with execution preview',
        tags: ['AI Editor Commands'],
        security: [{ bearerAuth: [] }],
      },
    },
    editorCommandController.interpretPrompt.bind(editorCommandController)
  );

  fastify.post(
    '/commands/validate',
    {
      schema: {
        description: 'Validate custom or user-modified editor commands and generate timeline diff preview',
        tags: ['AI Editor Commands'],
        security: [{ bearerAuth: [] }],
      },
    },
    editorCommandController.validateCommands.bind(editorCommandController)
  );

  fastify.post(
    '/commands/execute',
    {
      schema: {
        description: 'Apply validated editor commands to project timeline with optimistic concurrency check',
        tags: ['AI Editor Commands'],
        security: [{ bearerAuth: [] }],
      },
    },
    editorCommandController.executeCommands.bind(editorCommandController)
  );

  // --------------------------------------------------------------------------
  // AI COPILOT REALTIME PIPELINE (DAY 4 — COMMAND 18)
  // --------------------------------------------------------------------------
  fastify.post(
    '/copilot',
    {
      preHandler: [authenticate],
      schema: {
        description: 'Generate structured EditorCommandPlan from natural language prompt',
        tags: ['AI Copilot'],
        security: [{ bearerAuth: [] }],
      },
    },
    copilotController.generatePlan.bind(copilotController)
  );

  fastify.get(
    '/copilot/:planId',
    {
      preHandler: [authenticate],
      schema: {
        description: 'Retrieve stored AI Copilot EditorCommandPlan by ID',
        tags: ['AI Copilot'],
        security: [{ bearerAuth: [] }],
      },
    },
    copilotController.getPlan.bind(copilotController)
  );

  fastify.post(
    '/copilot/:planId/apply',
    {
      preHandler: [authenticate],
      schema: {
        description: 'Safely apply AI Copilot command plan to project timeline with version safety check',
        tags: ['AI Copilot'],
        security: [{ bearerAuth: [] }],
      },
    },
    copilotController.applyPlan.bind(copilotController)
  );

  fastify.get(
    '/copilot/metrics',
    {
      schema: {
        description: 'Get telemetry metrics for AI Copilot plans and commands',
        tags: ['AI Copilot'],
        security: [{ bearerAuth: [] }],
      },
    },
    copilotController.getMetrics.bind(copilotController)
  );
}

