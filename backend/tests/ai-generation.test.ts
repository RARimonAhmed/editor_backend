import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { aiJobService } from '../src/modules/ai/jobs/ai-job.service.js';
import { aiJobWorker } from '../src/modules/ai/jobs/ai-job.worker.js';
import { projectsService } from '../src/modules/projects/projects.service.js';

describe('Asynchronous AI Generation Subsystem', () => {
  let app: FastifyInstance;
  let authToken: string;
  let userId: string;
  let testProjectId: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    // Register test user
    const regRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: `ai_gen_tester_${Date.now()}@techxayan.com`,
        password: 'Password123!',
        displayName: 'AI Generation QA Specialist',
      },
    });

    const body = JSON.parse(regRes.body);
    authToken = body.data.tokens.accessToken;
    userId = body.data.user.id;

    // Create a target project for asset registry auto-linking
    const proj = await projectsService.create(userId, {
      title: 'AI Generation Target Project',
      canvas: { resolutionWidth: 1920, resolutionHeight: 1080, framerate: 30, aspectRatio: '16:9' },
    });
    testProjectId = proj.id;
  });

  afterAll(async () => {
    await app.close();
  });

  // 1. TEXT -> IMAGE GENERATION
  it('POST /v1/ai/generate/image creates async job and links generated image to project assets', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/ai/generate/image',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: {
        prompt: 'Futuristic Cyberpunk Skyline at dusk with neon reflections',
        aspectRatio: '16:9',
        projectId: testProjectId,
      },
    });

    expect(res.statusCode).toBe(202);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.jobId).toBeDefined();
    expect(body.data.type).toBe('generate_image');
    expect(body.data.pollUrl).toBe(`/v1/ai/jobs/${body.data.jobId}`);

    // Process job with worker
    await aiJobWorker.processJob({
      id: 'job-1',
      name: 'ai_job',
      data: {
        jobId: body.data.jobId,
        userId,
        type: 'generate_image',
        input: {
          prompt: 'Futuristic Cyberpunk Skyline',
          aspectRatio: '16:9',
          projectId: testProjectId,
        },
      },
    } as any);

    const completed = aiJobService.getJobInternal(body.data.jobId);
    expect(completed?.status).toBe('COMPLETED');
    expect(completed?.output.assetId).toBeDefined();
    expect(completed?.output.mediaAsset.category).toBe('image');
    expect(completed?.output.mediaAsset.status).toBe('READY');

    // Verify project asset registry was auto-updated
    const updatedProject = await projectsService.getById(testProjectId, userId);
    const registeredAsset = updatedProject.assets?.find((a) => a.id === completed?.output.assetId);
    expect(registeredAsset).toBeDefined();
    expect(registeredAsset?.type).toBe('image');
  });

  // 2. TEXT / IMAGE -> VIDEO GENERATION
  it('POST /v1/ai/generate/video creates async video generation job with resolution telemetry', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/ai/generate/video',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: {
        prompt: 'Drone fly-through shot of Japanese cherry blossom garden',
        durationSeconds: 5,
        resolution: '1080p',
        aspectRatio: '16:9',
        projectId: testProjectId,
      },
    });

    expect(res.statusCode).toBe(202);
    const body = JSON.parse(res.body);
    expect(body.data.type).toBe('generate_video');

    await aiJobWorker.processJob({
      id: 'job-2',
      name: 'ai_job',
      data: {
        jobId: body.data.jobId,
        userId,
        type: 'generate_video',
        input: {
          prompt: 'Drone fly-through shot',
          durationSeconds: 5,
          resolution: '1080p',
          projectId: testProjectId,
        },
      },
    } as any);

    const completed = aiJobService.getJobInternal(body.data.jobId);
    expect(completed?.status).toBe('COMPLETED');
    expect(completed?.output.videoUrl).toBeDefined();
    expect(completed?.output.mediaAsset.category).toBe('video');
  });

  // 3. TEXT -> MUSIC GENERATION
  it('POST /v1/ai/generate/music creates synthetic soundtrack with BPM and mood', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/ai/generate/music',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: {
        prompt: 'Uplifting synthwave retro groove for high-energy travel montage',
        genre: 'synthwave',
        durationSeconds: 30,
        mood: 'energetic',
        projectId: testProjectId,
      },
    });

    expect(res.statusCode).toBe(202);
    const body = JSON.parse(res.body);
    expect(body.data.type).toBe('generate_music');

    await aiJobWorker.processJob({
      id: 'job-3',
      name: 'ai_job',
      data: {
        jobId: body.data.jobId,
        userId,
        type: 'generate_music',
        input: {
          prompt: 'Uplifting synthwave',
          genre: 'synthwave',
          durationSeconds: 30,
          projectId: testProjectId,
        },
      },
    } as any);

    const completed = aiJobService.getJobInternal(body.data.jobId);
    expect(completed?.status).toBe('COMPLETED');
    expect(completed?.output.audioUrl).toBeDefined();
    expect(completed?.output.tempoBpm).toBeDefined();
    expect(completed?.output.mediaAsset.category).toBe('audio');
  });

  // 4. TEXT -> SFX GENERATION
  it('POST /v1/ai/generate/sfx creates sound effect audio asset', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/ai/generate/sfx',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: {
        prompt: 'Cinematic bass whoosh riser transition',
        category: 'whoosh',
        durationSeconds: 2.5,
        projectId: testProjectId,
      },
    });

    expect(res.statusCode).toBe(202);
    const body = JSON.parse(res.body);
    expect(body.data.type).toBe('generate_sfx');
  });

  // 5. TEXT -> VOICE GENERATION
  it('POST /v1/ai/generate/voice generates voiceover speech audio', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/ai/generate/voice',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: {
        prompt: 'Welcome back to another episode of tech breakdowns. Today we build a video editor.',
        voiceGender: 'neutral',
        speed: 1.0,
        projectId: testProjectId,
      },
    });

    expect(res.statusCode).toBe(202);
    const body = JSON.parse(res.body);
    expect(body.data.type).toBe('generate_voice');
  });

  // 6. TEXT -> SCRIPT GENERATION
  it('POST /v1/ai/generate/script generates structured scene script', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/ai/generate/script',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: {
        prompt: 'Top 5 tips for filming professional b-roll on a smartphone',
        targetDurationSeconds: 60,
        genre: 'educational',
      },
    });

    expect(res.statusCode).toBe(202);
    const body = JSON.parse(res.body);
    expect(body.data.type).toBe('generate_script');

    await aiJobWorker.processJob({
      id: 'job-6',
      name: 'ai_job',
      data: {
        jobId: body.data.jobId,
        userId,
        type: 'generate_script',
        input: {
          topic: 'Top 5 tips for smartphone b-roll',
          targetDurationSeconds: 60,
        },
      },
    } as any);

    const completed = aiJobService.getJobInternal(body.data.jobId);
    expect(completed?.status).toBe('COMPLETED');
    expect(completed?.output.script).toBeDefined();
    expect(Array.isArray(completed?.output.script.scenes)).toBe(true);
  });
});
