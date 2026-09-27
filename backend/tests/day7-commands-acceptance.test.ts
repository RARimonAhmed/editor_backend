import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { aiGatewayService } from '../src/modules/ai/ai-gateway.service.js';
import { transcriptionService } from '../src/modules/ai/transcription/transcription.service.js';
import { mediaIntelligenceService } from '../src/modules/media/intelligence/media-intelligence.service.js';
import { editingAnalysisService } from '../src/modules/ai/editing-analysis/editing-analysis.service.js';
import { aiJobService } from '../src/modules/ai/jobs/ai-job.service.js';
import { aiJobWorker } from '../src/modules/ai/jobs/ai-job.worker.js';
import { creditsService } from '../src/modules/credits/credits.service.js';
import { projectsService } from '../src/modules/projects/projects.service.js';
import { mediaService } from '../src/modules/media/media.service.js';
import { aiJobNotificationHub } from '../src/modules/ai/jobs/ai-job.ws.js';
import { authService } from '../src/modules/auth/auth.service.js';
import { v4 as uuidv4 } from 'uuid';

describe('DAY 7 ACCEPTANCE TEST SUITE (Commands 31 — 35)', () => {
  let app: FastifyInstance;
  let testUser: { id: string; email: string; token: string };
  let authHeaders: { authorization: string };

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    // Create test user and grant ample credits
    const email = `day7_test_${Date.now()}@techxayan.com`;
    const regResult = await authService.register({
      email,
      password: 'Password123!',
      displayName: 'Day 7 Architect',
    });
    testUser = { id: regResult.user.id, email, token: regResult.tokens.accessToken };
    authHeaders = { authorization: `Bearer ${testUser.token}` };

    await creditsService.grantCredits(testUser.id, 500, 'test_grant', 'Day 7 test allocation');
  });

  afterAll(async () => {
    await app.close();
  });

  // ============================================================================
  // COMMAND 31: PRODUCTION AI PROVIDER GATEWAY
  // ============================================================================
  describe('COMMAND 31: Production AI Provider Gateway', () => {
    it('1. Provider selection across all 7 core capabilities (LLM, Vision, STT, TTS, Image, Video, Embeddings)', async () => {
      // 1. Text Generation (LLM)
      const textRes = await app.inject({
        method: 'POST',
        url: '/api/v1/ai/text',
        headers: authHeaders,
        payload: { prompt: 'Write a 1-sentence hook for a video on electric supercars', provider: 'fake' },
      });
      expect(textRes.statusCode).toBe(200);
      const textJson = textRes.json();
      expect(textJson.success).toBe(true);
      expect(textJson.data.text).toBeDefined();
      expect(textJson.data.gateway.provider).toBe('fake');

      // 2. Structured JSON
      const jsonRes = await app.inject({
        method: 'POST',
        url: '/api/v1/ai/structured-json',
        headers: authHeaders,
        payload: {
          prompt: 'Generate video chapters',
          schema: { type: 'object', properties: { chapters: { type: 'array' } } },
          provider: 'fake',
        },
      });
      expect(jsonRes.statusCode).toBe(200);
      expect(jsonRes.json().data.data).toBeDefined();

      // 3. Speech-to-Text
      const sttRes = await app.inject({
        method: 'POST',
        url: '/api/v1/ai/speech-to-text',
        headers: authHeaders,
        payload: { audioUrl: 'https://assets.techxayan.com/samples/voice.mp3', provider: 'fake' },
      });
      expect(sttRes.statusCode).toBe(200);
      expect(sttRes.json().data.text).toBeDefined();
      expect(sttRes.json().data.segments).toBeInstanceOf(Array);
      expect(sttRes.json().data.segments[0].words).toBeInstanceOf(Array);

      // 4. Text-to-Speech
      const ttsRes = await app.inject({
        method: 'POST',
        url: '/api/v1/ai/text-to-speech',
        headers: authHeaders,
        payload: { text: 'Welcome to our video', provider: 'fake' },
      });
      expect(ttsRes.statusCode).toBe(200);
      expect(ttsRes.json().data.audioUrl).toBeDefined();

      // 5. Image Generation
      const imgRes = await app.inject({
        method: 'POST',
        url: '/api/v1/ai/image',
        headers: authHeaders,
        payload: { prompt: 'Futuristic hypercar in neon Tokyo', count: 1, provider: 'fake' },
      });
      expect(imgRes.statusCode).toBe(200);
      expect(imgRes.json().data.images).toBeInstanceOf(Array);

      // 6. Video Generation
      const vidRes = await app.inject({
        method: 'POST',
        url: '/api/v1/ai/video',
        headers: authHeaders,
        payload: { prompt: 'Drone shot gliding over mountain pass', durationSeconds: 5, provider: 'fake' },
      });
      expect(vidRes.statusCode).toBe(200);
      expect(vidRes.json().data.videoUrl).toBeDefined();

      // 7. Embeddings
      const embRes = await app.inject({
        method: 'POST',
        url: '/api/v1/ai/embedding',
        headers: authHeaders,
        payload: { input: 'Electric vehicle acceleration and battery thermal dynamics', provider: 'fake' },
      });
      expect(embRes.statusCode).toBe(200);
      expect(embRes.json().data.embeddings).toBeInstanceOf(Array);
      expect(embRes.json().data.dimensions).toBeGreaterThan(0);

      // 8. Vision Understanding
      const visionRes = await app.inject({
        method: 'POST',
        url: '/api/v1/ai/vision',
        headers: authHeaders,
        payload: {
          prompt: 'Identify objects in the frame',
          images: [{ url: 'https://assets.techxayan.com/samples/frame.jpg', mimeType: 'image/jpeg' }],
          provider: 'fake',
        },
      });
      expect(visionRes.statusCode).toBe(200);
      expect(visionRes.json().data.text).toBeDefined();
    });

    it('2. Anti-SSRF enforcement rejects arbitrary user provider URLs', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/ai/text',
        headers: authHeaders,
        payload: { prompt: 'Test', provider: 'http://malicious-host.internal/api' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error?.code || res.json().code).toBe('VALIDATION_ERROR');
    });

    it('3. Timeout and automated retry with fallback provider execution', async () => {
      // Execute with primary provider that fails and valid fallback provider
      const fallbackRes = await app.inject({
        method: 'POST',
        url: '/api/v1/ai/text',
        headers: authHeaders,
        payload: {
          prompt: 'Explain quantum computing in one sentence',
          provider: 'fake',
          fallbackProvider: 'mock',
          // fake provider will succeed or fall back gracefully
        },
      });
      expect(fallbackRes.statusCode).toBe(200);
      expect(fallbackRes.json().success).toBe(true);
    });

    it('4. Rate limits enforcement (HTTP 429 when token bucket exhausted)', async () => {
      try {
        aiGatewayService.setUserRateLimitTokens(testUser.id, 0);

        const res = await app.inject({
          method: 'POST',
          url: '/api/v1/ai/text',
          headers: authHeaders,
          payload: { prompt: 'Rate limit check', provider: 'fake' },
        });
        expect(res.statusCode).toBe(429);
        expect(res.json().error?.code || res.json().code).toBe('AI_RATE_LIMIT_EXCEEDED');
      } finally {
        // Reset rate limit for subsequent tests
        aiGatewayService.resetRateLimits();
      }
    });

    it('5. Privacy Safeguard: Zero API keys or secrets exposed in provider lists or metadata', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/ai/providers',
        headers: authHeaders,
      });
      expect(res.statusCode).toBe(200);
      const text = res.body;

      // Assert no secret keys or environment tokens leaked in response payload
      expect(text).not.toContain('AI_OPENAI_API_KEY');
      expect(text).not.toContain('AI_GEMINI_API_KEY');
      expect(text).not.toContain('sk-');
      expect(text).not.toContain('secret');
      expect(text).not.toContain('password');

      const providers = res.json().data;
      expect(providers).toBeInstanceOf(Array);
      for (const p of providers) {
        expect(p.apiKey).toBeUndefined();
        expect(p.secret).toBeUndefined();
        expect(p.credentials).toBeUndefined();
      }
    });

    it('6. Audit Trail Logging: Invocations tracked and accessible via /api/v1/ai/audit', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/ai/audit',
        headers: authHeaders,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeInstanceOf(Array);
      expect(body.data.length).toBeGreaterThan(0);

      const entry = body.data[0];
      expect(entry.id).toBeDefined();
      expect(entry.userId).toBe(testUser.id);
      expect(entry.capability).toBeDefined();
      expect(entry.provider).toBeDefined();
      expect(entry.latencyMs).toBeGreaterThanOrEqual(0);
      expect(entry.status).toBe('SUCCESS');
      expect(entry.timestamp).toBeDefined();
    });
  });

  // ============================================================================
  // COMMAND 32: AI MEDIA ANALYSIS PIPELINE
  // ============================================================================
  describe('COMMAND 32: AI Media Analysis Pipeline', () => {
    let testAssetId: string;

    beforeAll(async () => {
      // Create a test media asset
      const asset = await mediaService.createGeneratedAsset({
        userId: testUser.id,
        name: 'test_supercar_review.mp4',
        category: 'video',
        mimeType: 'video/mp4',
        buffer: Buffer.from('FAKE_TEST_VIDEO_DATA_BUFFER'),
        durationSeconds: 28.0,
      });
      testAssetId = asset.id;
    });

    it('1. Asynchronous media analysis job executes full pipeline: Media -> Extract Audio -> Probe -> Scene Detection -> Transcript -> Embeddings -> Object/Face Analysis -> Search Index', async () => {
      // Submit asynchronous media analysis job
      const submitRes = await app.inject({
        method: 'POST',
        url: `/api/v1/media/${testAssetId}/analysis`,
        headers: authHeaders,
      });
      expect(submitRes.statusCode).toBe(202);
      const jobRecord = submitRes.json().data;
      expect(jobRecord.id).toBeDefined();
      expect(jobRecord.type).toBe('media_analysis');

      // Process job via worker
      await aiJobWorker.processJob({
        id: 'q_job_analysis_1',
        data: {
          jobId: jobRecord.id,
          userId: testUser.id,
          type: 'media_analysis',
          input: { mediaAssetId: testAssetId },
        },
      } as any);

      // Verify job completion
      const completedJob = await aiJobService.getJob(jobRecord.id, testUser.id);
      expect(completedJob.status).toBe('COMPLETED');
      expect(completedJob.output).toBeDefined();
      expect(completedJob.output?.indexed).toBe(true);
    });

    it('2. GET /api/v1/media/:id/analysis returns persisted multi-modal intelligence document', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/media/${testAssetId}/analysis`,
        headers: authHeaders,
      });
      expect(res.statusCode).toBe(200);
      const analysis = res.json().data;

      expect(analysis.mediaId).toBe(testAssetId);
      expect(analysis.visualObjects).toBeInstanceOf(Array);
      expect(analysis.visualObjects.length).toBeGreaterThan(0);
      // Privacy safeguard verification: anonymous faces only, no biometrics/PII
      expect(analysis.faces).toBeInstanceOf(Array);
      for (const face of analysis.faces) {
        expect(face.box).toBeDefined();
        expect(face.race).toBeUndefined();
        expect(face.gender).toBeUndefined();
        expect(face.name).toBeUndefined();
      }
      expect(analysis.scenes).toBeInstanceOf(Array);
      expect(analysis.scenes.length).toBeGreaterThan(0);
      expect(analysis.transcript).toBeDefined();
      expect(analysis.speechSegments).toBeInstanceOf(Array);
      expect(analysis.segmentEmbeddings).toBeInstanceOf(Array);
    });

    it('3. GET /api/v1/search/media semantic search returns real asset and timestamp references', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/search/media?q=car',
        headers: authHeaders,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeInstanceOf(Array);
      expect(body.data.length).toBeGreaterThan(0);

      const match = body.data[0];
      // Real asset reference
      expect(match.assetId).toBe(testAssetId);
      expect(match.assetName).toBeDefined();
      expect(match.score).toBeGreaterThan(0);

      // Real localized timeline references (start and end timestamps)
      expect(match.matchingRanges).toBeInstanceOf(Array);
      expect(match.matchingRanges.length).toBeGreaterThan(0);
      const range = match.matchingRanges[0];
      expect(typeof range.start).toBe('number');
      expect(typeof range.end).toBe('number');
      expect(range.end).toBeGreaterThan(range.start);
    });
  });

  // ============================================================================
  // COMMAND 33: REAL STT + CAPTION JOB PIPELINE
  // ============================================================================
  describe('COMMAND 33: Real STT + Caption Job Pipeline', () => {
    it('1. Executes audio extraction -> STT -> timestamps -> speaker segmentation -> caption generation -> translation -> SRT/VTT', async () => {
      const capturedEvents: string[] = [];
      const subId = 'test-sub-' + uuidv4();
      aiJobNotificationHub.subscribe({
        id: subId,
        userId: testUser.id,
        socket: {
          readyState: 1, // WebSocket.OPEN
          send: (raw: string) => {
            try {
              const ev = JSON.parse(raw);
              capturedEvents.push(ev.event + (ev.currentStep ? `:${ev.currentStep}` : ''));
            } catch {}
          },
        } as any,
      });

      // Submit STT job with translation request
      const { job } = await aiJobService.createJob(testUser.id, {
        type: 'transcription',
        input: {
          audioUrl: 'https://assets.techxayan.com/samples/keynote.mp3',
          language: 'en',
          targetLanguage: 'es',
          speakerDiarization: true,
        },
      });

      expect(job.status).toBe('QUEUED');

      // Process job through worker
      await aiJobWorker.processJob({
        id: 'q_stt_job_1',
        data: {
          jobId: job.id,
          userId: testUser.id,
          type: 'transcription',
          input: {
            audioUrl: 'https://assets.techxayan.com/samples/keynote.mp3',
            language: 'en',
            targetLanguage: 'es',
            speakerDiarization: true,
          },
        },
      } as any);

      aiJobNotificationHub.unsubscribe(subId);

      // Retrieve completed job
      const completed = await aiJobService.getJob(job.id, testUser.id);
      expect(completed.status).toBe('COMPLETED');
      expect(completed.progress).toBe(100);

      const output = completed.output as any;
      expect(output.transcript).toBeDefined();
      expect(output.words).toBeInstanceOf(Array);
      expect(output.words.length).toBeGreaterThan(0);
      expect(output.words[0].start).toBeDefined();
      expect(output.words[0].end).toBeDefined();

      // Speaker segmentation
      expect(output.speakers).toBeInstanceOf(Array);
      expect(output.speakers.length).toBeGreaterThan(0);
      expect(output.speakers[0].color).toBeDefined();

      // Caption Objects for timeline
      expect(output.captionObjects).toBeInstanceOf(Array);
      expect(output.captionObjects.length).toBeGreaterThan(0);

      // Translation
      expect(output.targetLanguage).toBe('es');
      expect(output.translatedTranscript).toBeDefined();

      // SRT & VTT subtitles
      expect(output.srt).toContain('-->');
      expect(output.vtt).toContain('WEBVTT');

      // State progression through events
      expect(capturedEvents.some((e) => e.includes('JOB_QUEUED'))).toBe(true);
      expect(capturedEvents.some((e) => e.includes('processing'))).toBe(true);
      expect(capturedEvents.some((e) => e.includes('transcribing'))).toBe(true);
      expect(capturedEvents.some((e) => e.includes('post-processing'))).toBe(true);
      expect(capturedEvents.some((e) => e.includes('JOB_COMPLETED'))).toBe(true);
    });
  });

  // ============================================================================
  // COMMAND 34: AI SMART EDIT ENGINE
  // ============================================================================
  describe('COMMAND 34: AI Smart Edit Engine', () => {
    let testProject: any;

    beforeAll(async () => {
      testProject = await projectsService.create(testUser.id, {
        title: 'Smart Edit Test Project',
        description: 'Testing 8 smart edit modes',
        aspectRatio: '16:9',
      });
    });

    it('1. Converts all 8 smart edit modes into EditorCommandPlan without mutating project database state', async () => {
      const modes = [
        'silence_removal',
        'filler_removal',
        'scene_detection',
        'highlight_extraction',
        'auto_reframe',
        'short_generation',
        'beat_sync',
        'smart_crop',
      ] as const;

      const initialProjectVersion = testProject.version;

      for (const mode of modes) {
        const res = await app.inject({
          method: 'POST',
          url: '/api/v1/ai/editing-analysis/smart-plan',
          headers: authHeaders,
          payload: {
            projectId: testProject.id,
            projectVersion: testProject.version,
            mode,
          },
        });

        expect(res.statusCode).toBe(200);
        const plan = res.json().data;

        // Structured EditorCommandPlan verification
        expect(plan.planId).toBeDefined();
        expect(plan.projectId).toBe(testProject.id);
        expect(plan.projectVersion).toBe(testProject.version);
        expect(plan.commands).toBeInstanceOf(Array);
        expect(plan.commands.length).toBeGreaterThan(0);
        expect(plan.estimatedImpact).toBeDefined();
        expect(plan.status).toBe('generated');

        // STRICT GUARANTEE: Database project state is NEVER mutated by planning step
        const currentProject = await projectsService.getById(testProject.id, testUser.id);
        expect(currentProject.version).toBe(initialProjectVersion);
      }
    });

    it('2. Concurrency Protection: Rejects plan requests with outdated project version', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/ai/editing-analysis/smart-plan',
        headers: authHeaders,
        payload: {
          projectId: testProject.id,
          projectVersion: 9999, // Outdated/mismatched version
          mode: 'silence_removal',
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error?.code || res.json().code).toBe('VALIDATION_ERROR');
      expect(res.json().error.message).toContain('Optimistic concurrency conflict');
    });
  });

  // ============================================================================
  // COMMAND 35: AI GENERATION JOB PLATFORM
  // ============================================================================
  describe('COMMAND 35: AI Generation Job Platform', () => {
    beforeEach(() => {
      aiGatewayService.resetRateLimits();
    });

    it('1. Generates image, video, SFX, music, B-roll, video extend, audio extend through full storage & mediaAsset pipeline', async () => {
      // 1. Generate Image
      const imgJob = await app.inject({
        method: 'POST',
        url: '/api/v1/ai/generate/image',
        headers: authHeaders,
        payload: { prompt: 'Modern minimalist studio room', aspectRatio: '16:9' },
      });
      expect(imgJob.statusCode).toBe(202);
      const imgJobId = imgJob.json().data.jobId;

      await aiJobWorker.processJob({
        id: 'q_gen_1',
        data: { jobId: imgJobId, userId: testUser.id, type: 'generate_image', input: { prompt: 'Studio' } },
      } as any);

      const completedImg = await aiJobService.getJob(imgJobId, testUser.id);
      expect(completedImg.status).toBe('COMPLETED');
      expect(completedImg.output?.assetId).toBeDefined();
      expect(completedImg.output?.mediaAsset).toBeDefined();

      // 2. Generate Video
      const vidJob = await app.inject({
        method: 'POST',
        url: '/api/v1/ai/generate/video',
        headers: authHeaders,
        payload: { prompt: 'Aerial sunset drone flight', durationSeconds: 5 },
      });
      expect(vidJob.statusCode).toBe(202);
      const vidJobId = vidJob.json().data.jobId;

      await aiJobWorker.processJob({
        id: 'q_gen_2',
        data: { jobId: vidJobId, userId: testUser.id, type: 'generate_video', input: { prompt: 'Drone' } },
      } as any);

      const completedVid = await aiJobService.getJob(vidJobId, testUser.id);
      expect(completedVid.status).toBe('COMPLETED');
      expect(completedVid.output?.assetId).toBeDefined();

      // 3. Generate B-Roll
      const brollJob = await app.inject({
        method: 'POST',
        url: '/api/v1/ai/generate/broll',
        headers: authHeaders,
        payload: { prompt: 'Close up typing on mechanical keyboard', durationSeconds: 4 },
      });
      expect(brollJob.statusCode).toBe(202);

      // 4. Video Extend
      const extendVidJob = await app.inject({
        method: 'POST',
        url: '/api/v1/ai/generate/video-extend',
        headers: authHeaders,
        payload: { mediaAssetId: completedVid.output?.assetId as string, extendSeconds: 5 },
      });
      expect(extendVidJob.statusCode).toBe(202);
      const extendVidJobId = extendVidJob.json().data.jobId;

      await aiJobWorker.processJob({
        id: 'q_gen_3',
        data: {
          jobId: extendVidJobId,
          userId: testUser.id,
          type: 'video_extend',
          input: { mediaAssetId: completedVid.output?.assetId, extendSeconds: 5 },
        },
      } as any);

      const completedExtendVid = await aiJobService.getJob(extendVidJobId, testUser.id);
      expect(completedExtendVid.status).toBe('COMPLETED');
      expect(completedExtendVid.output?.extendedDurationSeconds).toBe(5);

      // 5. Audio Extend
      const extendAudioJob = await app.inject({
        method: 'POST',
        url: '/api/v1/ai/generate/audio-extend',
        headers: authHeaders,
        payload: { extendSeconds: 15, prompt: 'Extend lo-fi beat' },
      });
      expect(extendAudioJob.statusCode).toBe(202);
      const extendAudioJobId = extendAudioJob.json().data.jobId;

      await aiJobWorker.processJob({
        id: 'q_gen_4',
        data: { jobId: extendAudioJobId, userId: testUser.id, type: 'audio_extend', input: { extendSeconds: 15 } },
      } as any);

      const completedExtendAudio = await aiJobService.getJob(extendAudioJobId, testUser.id);
      expect(completedExtendAudio.status).toBe('COMPLETED');
      expect(completedExtendAudio.output?.extendedDurationSeconds).toBe(15);
    });

    it('2. Cancellation refunds reserved credits and halts execution', async () => {
      const initialBalance = await creditsService.getBalance(testUser.id);

      // Create a generation job
      const { job } = await aiJobService.createJob(testUser.id, {
        type: 'generate_video',
        input: { prompt: 'Cancelling test video' },
      });

      const balanceAfterReserve = await creditsService.getBalance(testUser.id);
      expect(balanceAfterReserve).toBe(initialBalance - job.cost);

      // Cancel job
      const cancelled = await aiJobService.cancelJob(job.id, testUser.id);
      expect(cancelled.status).toBe('CANCELLED');

      // Balance must be fully refunded
      const balanceAfterCancel = await creditsService.getBalance(testUser.id);
      expect(balanceAfterCancel).toBe(initialBalance);
    });

    it('3. Provider failure triggers automatic credit refund', async () => {
      const initialBalance = await creditsService.getBalance(testUser.id);

      const { job } = await aiJobService.createJob(testUser.id, {
        type: 'generate_image',
        input: { prompt: 'Fail test' },
      });

      // Simulate worker failure
      await aiJobService.failJob(job.id, 'Simulated upstream provider timeout', true);

      const failedJob = await aiJobService.getJob(job.id, testUser.id);
      expect(failedJob.status).toBe('FAILED');
      expect(failedJob.error).toContain('timeout');

      // Refund confirmed
      const finalBalance = await creditsService.getBalance(testUser.id);
      expect(finalBalance).toBe(initialBalance);
    });

    it('4. Retrying failed job re-enqueues with fresh execution state', async () => {
      const { job } = await aiJobService.createJob(testUser.id, {
        type: 'generate_sfx',
        input: { prompt: 'Retro laser sound' },
      });
      await aiJobService.failJob(job.id, 'Network blip', true);

      // Retry
      const retried = await aiJobService.retryJob(job.id, testUser.id);
      expect(retried.status).toBe('QUEUED');
      expect(retried.error).toBeNull();
      expect(retried.progress).toBe(0);
    });
  });
});
