import { describe, it, expect, beforeAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { aiGatewayService } from '../src/modules/ai/ai-gateway.service.js';
import { FakeAIProviderAdapter } from '../src/modules/ai/providers/fake.provider.js';

describe('AI Short-Video Orchestration & Editor Command Plan Pipeline', () => {
  let app: FastifyInstance;
  let userToken: string;
  let userId: string;
  let otherToken: string;
  let testProjectId: string;
  let testMediaAssetId: string;
  let fakeAdapter: FakeAIProviderAdapter;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    // 1. Register primary creator user
    const regRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: `shorts_creator_${Date.now()}@techxayan.com`,
        password: 'Password123!',
        displayName: 'Viral Short Creator',
      },
    });
    const bodyA = JSON.parse(regRes.body);
    userToken = bodyA.data.tokens.accessToken;
    userId = bodyA.data.user.id;

    // 2. Register second user for multi-tenant isolation tests
    const otherRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: `other_creator_${Date.now()}@techxayan.com`,
        password: 'Password123!',
        displayName: 'Other Creator',
      },
    });
    const bodyB = JSON.parse(otherRes.body);
    otherToken = bodyB.data.tokens.accessToken;

    fakeAdapter = aiGatewayService.getAdapter('fake') as FakeAIProviderAdapter;
    fakeAdapter.resetSimulation();

    // 3. Create a long-form video project
    const projRes = await app.inject({
      method: 'POST',
      url: '/v1/projects',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        title: 'Long-Form Podcast Master',
        canvas: {
          resolutionWidth: 1920,
          resolutionHeight: 1080,
          aspectRatio: '16:9',
          framerate: 30,
        },
        timeline: {
          duration: 180.0, // 3 minutes long-form
          framerate: 30,
          tracks: [
            {
              id: 'track-v1',
              type: 'video',
              name: 'Main Camera',
              muted: false,
              locked: false,
              clips: [
                {
                  id: 'clip-master-v1',
                  name: 'Studio Camera 1080p',
                  start: 0.0,
                  duration: 180.0,
                  sourceStart: 0.0,
                  speed: 1.0,
                  volume: 1.0,
                },
              ],
            },
            {
              id: 'track-a1',
              type: 'audio',
              name: 'Studio Podcast Mic',
              muted: false,
              locked: false,
              clips: [
                {
                  id: 'clip-master-a1',
                  name: 'Mic Audio Track',
                  start: 0.0,
                  duration: 180.0,
                  sourceStart: 0.0,
                  speed: 1.0,
                  volume: 1.0,
                },
              ],
            },
          ],
          markers: [],
        },
      },
    });
    const projBody = JSON.parse(projRes.body);
    testProjectId = projBody.data.id;

    // 4. Presign and complete a media asset
    const presignRes = await app.inject({
      method: 'POST',
      url: '/v1/media/presign',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        fileName: 'keynote_master.mp4',
        mimeType: 'video/mp4',
        fileSizeBytes: 85 * 1024 * 1024,
        category: 'video',
        projectId: testProjectId,
      },
    });
    const presignBody = JSON.parse(presignRes.body);
    testMediaAssetId = presignBody.data.mediaId;

    await app.inject({
      method: 'POST',
      url: '/v1/media/complete',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        mediaId: testMediaAssetId,
        uploadId: presignBody.data.uploadId,
        durationSeconds: 120.0,
        width: 1920,
        height: 1080,
      },
    });
  });

  it('1. Generates 60s vertical (9:16) short-video orchestration plan with complete commands', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/ai/short-orchestration',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        projectId: testProjectId,
        targetDuration: 60,
        aspectRatio: '9:16',
        captionPreset: 'bold_yellow',
        colorPreset: 'cinematic_warm',
        musicPreset: 'upbeat_ambient',
        duckingAmount: 0.2,
        autoReframeTracking: 'face',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);

    const plan = body.data;
    expect(plan.id).toBeDefined();
    expect(plan.targetDuration).toBe(60);
    expect(plan.aspectRatio).toBe('9:16');
    expect(plan.viralScore).toBeGreaterThan(0.5);
    expect(plan.segmentsUsed.length).toBeGreaterThan(0);
    expect(plan.hookSummary).toBeDefined();

    // Verify commands in the plan
    const commands = plan.commands;
    expect(commands.length).toBeGreaterThan(5);

    // 1. SET_CANVAS command (9:16 -> 1080x1920)
    const canvasCmd = commands.find((c: any) => c.type === 'SET_CANVAS');
    expect(canvasCmd).toBeDefined();
    expect(canvasCmd.width).toBe(1080);
    expect(canvasCmd.height).toBe(1920);
    expect(canvasCmd.aspectRatio).toBe('9:16');

    // 2. CREATE_SEQUENCE command
    const seqCmd = commands.find((c: any) => c.type === 'CREATE_SEQUENCE');
    expect(seqCmd).toBeDefined();
    expect(seqCmd.clips.length).toBeGreaterThan(0);
    expect(seqCmd.targetDuration).toBeLessThanOrEqual(65);

    // 3. SET_REFRAME commands
    const reframeCmds = commands.filter((c: any) => c.type === 'SET_REFRAME');
    expect(reframeCmds.length).toBe(seqCmd.clips.length);
    expect(reframeCmds[0].keyframes.length).toBeGreaterThan(0);
    expect(reframeCmds[0].aspectRatio).toBe('9:16');

    // 4. ADD_CAPTIONS command
    const capCmd = commands.find((c: any) => c.type === 'ADD_CAPTIONS');
    expect(capCmd).toBeDefined();
    expect(capCmd.preset).toBe('bold_yellow');
    expect(capCmd.captions.length).toBeGreaterThan(0);
    expect(capCmd.captions[0].words.length).toBeGreaterThan(0);

    // 5. ADD_AUDIO and SET_AUDIO_DUCKING commands
    const audioCmd = commands.find((c: any) => c.type === 'ADD_AUDIO');
    expect(audioCmd).toBeDefined();
    expect(audioCmd.preset).toBe('upbeat_ambient');

    const duckCmd = commands.find((c: any) => c.type === 'SET_AUDIO_DUCKING');
    expect(duckCmd).toBeDefined();
    expect(duckCmd.duckVolume).toBe(0.2);
    expect(duckCmd.duckingRanges.length).toBeGreaterThan(0);

    // 6. ADD_EFFECT command
    const effCmd = commands.find((c: any) => c.type === 'ADD_EFFECT');
    expect(effCmd).toBeDefined();
    expect(effCmd.config.preset).toBe('cinematic_warm');
  });

  it('2. Supports 30s and 45s target durations and alternative aspect ratios (1:1 and 4:5)', async () => {
    // 30s with 1:1 square aspect ratio
    const res30 = await app.inject({
      method: 'POST',
      url: '/v1/ai/short-orchestration',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        projectId: testProjectId,
        targetDuration: 30,
        aspectRatio: '1:1',
        captionPreset: 'karaoke_glow',
        colorPreset: 'vibrant_boost',
      },
    });

    expect(res30.statusCode).toBe(200);
    const body30 = JSON.parse(res30.body);
    const plan30 = body30.data;
    expect(plan30.targetDuration).toBe(30);
    expect(plan30.aspectRatio).toBe('1:1');

    const canvas30 = plan30.commands.find((c: any) => c.type === 'SET_CANVAS');
    expect(canvas30.width).toBe(1080);
    expect(canvas30.height).toBe(1080);

    // 45s with 4:5 portrait aspect ratio
    const res45 = await app.inject({
      method: 'POST',
      url: '/v1/ai/short-orchestration',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        mediaAssetId: testMediaAssetId,
        targetDuration: 45,
        aspectRatio: '4:5',
      },
    });

    expect(res45.statusCode).toBe(200);
    const body45 = JSON.parse(res45.body);
    const plan45 = body45.data;
    expect(plan45.targetDuration).toBe(45);
    expect(plan45.aspectRatio).toBe('4:5');

    const canvas45 = plan45.commands.find((c: any) => c.type === 'SET_CANVAS');
    expect(canvas45.width).toBe(1080);
    expect(canvas45.height).toBe(1350);
  });

  it('3. Guarantees non-destructive invariant: Project in database is NOT mutated upon plan creation', async () => {
    // Check project version before plan creation
    const projBeforeRes = await app.inject({
      method: 'GET',
      url: `/v1/projects/${testProjectId}`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    const projBefore = JSON.parse(projBeforeRes.body).data;
    const versionBefore = projBefore.version;
    const canvasBefore = projBefore.canvas;
    const durationBefore = projBefore.timeline.duration;

    // Create an orchestration plan
    await app.inject({
      method: 'POST',
      url: '/v1/ai/short-orchestration',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        projectId: testProjectId,
        targetDuration: 30,
        aspectRatio: '9:16',
      },
    });

    // Check project after plan creation: MUST BE COMPLETELY UNCHANGED
    const projAfterRes = await app.inject({
      method: 'GET',
      url: `/v1/projects/${testProjectId}`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    const projAfter = JSON.parse(projAfterRes.body).data;

    expect(projAfter.version).toBe(versionBefore);
    expect(projAfter.canvas.resolutionWidth).toBe(canvasBefore.resolutionWidth);
    expect(projAfter.canvas.resolutionHeight).toBe(canvasBefore.resolutionHeight);
    expect(projAfter.canvas.aspectRatio).toBe(canvasBefore.aspectRatio);
    expect(projAfter.timeline.duration).toBe(durationBefore);
  });

  it('4. Validates orchestration commands and previews timeline diff via /validate', async () => {
    // Generate a plan to get valid commands
    const planRes = await app.inject({
      method: 'POST',
      url: '/v1/ai/short-orchestration',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        projectId: testProjectId,
        targetDuration: 45,
        aspectRatio: '9:16',
      },
    });
    const plan = JSON.parse(planRes.body).data;

    // Validate the plan
    const valRes = await app.inject({
      method: 'POST',
      url: '/v1/ai/short-orchestration/validate',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        projectId: testProjectId,
        commands: plan.commands,
        targetDuration: 45,
        aspectRatio: '9:16',
      },
    });

    expect(valRes.statusCode).toBe(200);
    const valBody = JSON.parse(valRes.body);
    expect(valBody.data.isValid).toBe(true);
    expect(valBody.data.errors).toHaveLength(0);
    expect(valBody.data.previewTimeline.targetDuration).toBe(45);
    expect(valBody.data.previewTimeline.aspectRatio).toBe('9:16');
  });

  it('5. Applies approved command plan via ProjectBloc with optimistic concurrency', async () => {
    // Fetch current project version
    const projRes = await app.inject({
      method: 'GET',
      url: `/v1/projects/${testProjectId}`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    const currentVersion = JSON.parse(projRes.body).data.version;

    // Generate fresh plan
    const planRes = await app.inject({
      method: 'POST',
      url: '/v1/ai/short-orchestration',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        projectId: testProjectId,
        targetDuration: 60,
        aspectRatio: '9:16',
        captionPreset: 'bold_yellow',
        colorPreset: 'cinematic_warm',
      },
    });
    const plan = JSON.parse(planRes.body).data;

    // 5a. Stale expectedVersion should fail
    const conflictRes = await app.inject({
      method: 'POST',
      url: '/v1/ai/short-orchestration/apply',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        projectId: testProjectId,
        planId: plan.id,
        expectedVersion: currentVersion + 99, // Stale version!
      },
    });
    expect(conflictRes.statusCode).toBe(400);

    // 5b. Correct expectedVersion should succeed and mutate project
    const applyRes = await app.inject({
      method: 'POST',
      url: '/v1/ai/short-orchestration/apply',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        projectId: testProjectId,
        planId: plan.id,
        expectedVersion: currentVersion,
      },
    });

    expect(applyRes.statusCode).toBe(200);
    const updatedProj = JSON.parse(applyRes.body).data;

    // Verify canvas updated to 9:16
    expect(updatedProj.canvas.aspectRatio).toBe('9:16');
    expect(updatedProj.canvas.resolutionWidth).toBe(1080);
    expect(updatedProj.canvas.resolutionHeight).toBe(1920);

    // Verify tracks: video, audio, music, captions
    const tracks = updatedProj.timeline.tracks;
    expect(tracks.length).toBeGreaterThanOrEqual(3);
    expect(tracks.some((t: any) => t.type === 'video')).toBe(true);
    expect(tracks.some((t: any) => t.type === 'audio')).toBe(true);
    expect(tracks.some((t: any) => t.type === 'text')).toBe(true);

    // Verify version was incremented
    expect(updatedProj.version).toBe(currentVersion + 1);
  });

  it('6. Enforces multi-tenant security isolation: User B cannot retrieve or apply User A plan', async () => {
    // Generate plan as User A
    const planRes = await app.inject({
      method: 'POST',
      url: '/v1/ai/short-orchestration',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        projectId: testProjectId,
        targetDuration: 30,
        aspectRatio: '9:16',
      },
    });
    const planA = JSON.parse(planRes.body).data;

    // User A can access
    const getResA = await app.inject({
      method: 'GET',
      url: `/v1/ai/short-orchestration/${planA.id}`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(getResA.statusCode).toBe(200);

    // User B cannot access (HTTP 403 Forbidden)
    const getResB = await app.inject({
      method: 'GET',
      url: `/v1/ai/short-orchestration/${planA.id}`,
      headers: { authorization: `Bearer ${otherToken}` },
    });
    expect(getResB.statusCode).toBe(403);

    // User B cannot apply plan to User A's project (HTTP 403 Forbidden)
    const applyResB = await app.inject({
      method: 'POST',
      url: '/v1/ai/short-orchestration/apply',
      headers: { authorization: `Bearer ${otherToken}` },
      payload: {
        projectId: testProjectId,
        planId: planA.id,
      },
    });
    expect(applyResB.statusCode).toBe(403);
  });
});
