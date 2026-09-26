import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';
import { buildApp } from '../src/app.js';
import { db } from '../src/database/client.js';
import { renderWorker } from '../src/modules/jobs/render-worker.service.js';
import { renderJobService, mockRenderJobs } from '../src/modules/jobs/render-job.service.js';
import { RenderJob } from '../src/modules/jobs/render-job.types.js';
import { creditsService } from '../src/modules/credits/credits.service.js';
import { storageService } from '../src/services/storage/index.js';
import { ffmpegService } from '../src/modules/media/ffmpeg.service.js';
import { mockProjects } from '../src/modules/projects/projects.service.js';
import { mockMediaAssets } from '../src/modules/media/media.service.js';

describe('DAY 5 COMMAND 22: Real Asynchronous Render Worker & Pipeline with Real Media', () => {
  let app: FastifyInstance;
  let testUserId: string;
  let testUserToken: string;
  let testProjectId: string;
  let tempTestDir: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    tempTestDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'render_test_media_'));

    // 1. Create authenticated test user
    const regRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: `render_worker_test_${Date.now()}@techxayan.com`,
        password: 'Password123!',
        displayName: 'Render Worker Test Lead',
      },
    });

    const regData = JSON.parse(regRes.body).data;
    testUserId = regData.user.id;
    testUserToken = regData.tokens.accessToken;

    // 2. Grant credits to user for rendering
    await creditsService.grantCredits(testUserId, 200, 'system_grant', 'Initial test rendering credits');

    // 3. Generate 2 real media clips with FFmpeg and upload to storage
    const clip1Local = path.join(tempTestDir, 'clip1.mp4');
    const clip2Local = path.join(tempTestDir, 'clip2.mp4');

    await renderWorker.generateSyntheticClip(clip1Local, {
      duration: 2,
      width: 640,
      height: 360,
      fps: 30,
      label: 'Scene 1',
      audioToneHz: 440,
    });

    await renderWorker.generateSyntheticClip(clip2Local, {
      duration: 2,
      width: 640,
      height: 360,
      fps: 30,
      label: 'Scene 2',
      audioToneHz: 880,
    });

    const clip1Key = `users/${testUserId}/media/video/clip1_${Date.now()}.mp4`;
    const clip2Key = `users/${testUserId}/media/video/clip2_${Date.now()}.mp4`;

    const clip1Buf = await fs.promises.readFile(clip1Local);
    const clip2Buf = await fs.promises.readFile(clip2Local);

    await storageService.putObject(clip1Key, clip1Buf, 'video/mp4');
    await storageService.putObject(clip2Key, clip2Buf, 'video/mp4');

    mockMediaAssets.set('asset-clip-1', {
      id: 'asset-clip-1',
      userId: testUserId,
      name: 'Clip 1 (440Hz)',
      fileKey: clip1Key,
      mimeType: 'video/mp4',
      status: 'READY',
      fileSizeBytes: clip1Buf.length,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any);

    mockMediaAssets.set('asset-clip-2', {
      id: 'asset-clip-2',
      userId: testUserId,
      name: 'Clip 2 (880Hz)',
      fileKey: clip2Key,
      mimeType: 'video/mp4',
      status: 'READY',
      fileSizeBytes: clip2Buf.length,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any);

    // 4. Create a test project with 2 video clips, 1 audio track, 1 text layer, and transition
    testProjectId = randomUUID();
    mockProjects.set(testProjectId, {
      id: testProjectId,
      userId: testUserId,
      title: 'Real Media Multi-Track Test Project',
      status: 'active',
      version: 1,
      projectVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      etag: 'etag_test',
      canvas: {
        resolutionWidth: 640,
        resolutionHeight: 360,
        framerate: 30,
        aspectRatio: '16:9',
        colorSpace: 'rec709',
        backgroundColor: '#000000',
      },
      settings: {
        autoSaveIntervalSeconds: 30,
        snapToGrid: true,
        rippleEditing: false,
        proxyEnabled: false,
        defaultAudioGain: 0,
      },
      metadata: {
        id: testProjectId,
        userId: testUserId,
        title: 'Real Media Multi-Track Test Project',
        description: 'Test project with 2 clips, 1 audio track, 1 text layer',
        status: 'active',
        thumbnailUrl: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      timeline: {
        duration: 4,
        framerate: 30,
        tracks: [
          {
            id: 'track-v1',
            type: 'video',
            name: 'Video Track 1',
            muted: false,
            locked: false,
            clips: [
              {
                id: 'c1',
                mediaAssetId: 'asset-clip-1',
                start: 0,
                duration: 2,
                sourceStart: 0,
                sourceEnd: 2,
              },
              {
                id: 'c2',
                mediaAssetId: 'asset-clip-2',
                start: 2,
                duration: 2,
                sourceStart: 0,
                sourceEnd: 2,
              },
            ],
          },
          {
            id: 'track-a1',
            type: 'audio',
            name: 'Background Audio Track',
            muted: false,
            locked: false,
            clips: [
              {
                id: 'ca1',
                name: 'Audio Bed',
                start: 0,
                duration: 4,
                volume: 0.8,
              },
            ],
          },
          {
            id: 'track-txt1',
            type: 'text',
            name: 'Title Track',
            muted: false,
            locked: false,
            clips: [
              {
                id: 'ctxt1',
                text: 'TechXayan Cloud Render Test',
                start: 0,
                duration: 4,
                fontSize: 32,
                color: 'yellow',
              },
            ],
          },
        ],
        markers: [],
      },
      assets: [],
      versions: {
        currentVersion: 1,
        etag: 'etag_1',
        versionToken: 'token_1',
        totalVersions: 1,
        recentVersions: [],
      },
      resolutionWidth: 640,
      resolutionHeight: 360,
      framerate: 30,
      aspectRatio: '16:9',
      timelineData: {} as any,
      thumbnailUrl: null,
    });
  });

  afterAll(async () => {
    try {
      await fs.promises.rm(tempTestDir, { recursive: true, force: true });
    } catch {}
    await app.close();
  });

  it('1. Verifies FFmpeg and FFprobe binary health probe', async () => {
    const health = await ffmpegService.checkHealth();
    expect(health.healthy).toBe(true);
    expect(health.version).toBeDefined();
    expect(health.supportedCodecs).toContain('h264');
  });

  it('2. Submits a cloud render job via REST API, renders real MP4 video, validates with ffprobe and uploads to storage', async () => {
    // Submit render job
    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/jobs/render',
      headers: {
        authorization: `Bearer ${testUserToken}`,
      },
      payload: {
        projectId: testProjectId,
        settings: {
          format: 'mp4',
          resolutionWidth: 640,
          resolutionHeight: 360,
          framerate: 30,
          videoCodec: 'h264',
          audioCodec: 'aac',
          durationSeconds: 4,
        },
      },
    });

    expect([201, 202]).toContain(createRes.statusCode);
    const createBody = JSON.parse(createRes.body);
    expect(createBody.success).toBe(true);

    const renderJobId = createBody.data.id;
    expect(renderJobId).toBeDefined();
    expect(createBody.data.status).toBe('queued');
    expect(createBody.data.creditCost).toBeGreaterThan(0);

    // Execute actual render worker pipeline
    const output = await renderWorker.processRenderJob({
      id: renderJobId,
      type: 'render_jobs',
      data: {
        renderJobId,
        projectId: testProjectId,
      },
    } as any);

    // Verify output structure
    expect(output).toBeDefined();
    expect(output.storageKey).toBeDefined();
    expect(output.downloadUrl).toBeDefined();
    expect(output.sizeBytes).toBeGreaterThan(1000); // Real video has size > 1KB
    expect(output.durationSeconds).toBeGreaterThanOrEqual(3.5);
    expect(output.width).toBe(640);
    expect(output.height).toBe(360);
    expect(output.format).toBe('mp4');
    expect(output.checksumSha256).toBeDefined();

    // Verify object actually exists in object storage
    const downloadedBytes = await storageService.getObject(output.storageKey!);
    expect(downloadedBytes.length).toBe(output.sizeBytes);

    // Probe the downloaded video with ffprobe to verify valid container and streams
    const probeTempPath = path.join(tempTestDir, 'verify_probe.mp4');
    await fs.promises.writeFile(probeTempPath, downloadedBytes);

    const probe = await ffmpegService.probeMedia(probeTempPath);
    expect(probe.codec).toBe('h264');
    expect(probe.audioCodec).toBe('aac');
    expect(probe.resolution.width).toBe(640);
    expect(probe.resolution.height).toBe(360);
    expect(probe.duration).toBeGreaterThanOrEqual(3.5);

    // Verify job in database/service is marked completed with 100% progress
    const completedJob = await renderJobService.getRenderJob(renderJobId, testUserId);
    expect(completedJob.status).toBe('completed');
    expect(completedJob.stage).toBe('completed');
    expect(completedJob.progress).toBe(100);
    expect(completedJob.outputObject).toBeDefined();
    expect(completedJob.completedAt).not.toBeNull();
  });

  it('3. Ensures idempotent handling of already completed render job', async () => {
    // Create and complete a render job
    const job = await renderJobService.createRenderJob(testUserId, {
      projectId: testProjectId,
      settings: {
        format: 'mp4',
        resolutionWidth: 640,
        resolutionHeight: 360,
        framerate: 30,
        durationSeconds: 2,
      },
    });

    const firstOutput = await renderWorker.processRenderJob({
      id: job.id,
      type: 'render_jobs',
      data: { renderJobId: job.id, projectId: testProjectId },
    } as any);

    // Run again - must return identical output immediately without re-rendering
    const secondOutput = await renderWorker.processRenderJob({
      id: job.id,
      type: 'render_jobs',
      data: { renderJobId: job.id, projectId: testProjectId },
    } as any);

    expect(secondOutput.storageKey).toBe(firstOutput.storageKey);
    expect(secondOutput.checksumSha256).toBe(firstOutput.checksumSha256);
  });

  it('4. Handles cancellation of queued render jobs and compensates reserved credits', async () => {
    const initialBalance = await creditsService.getBalance(testUserId);

    const job = await renderJobService.createRenderJob(testUserId, {
      projectId: testProjectId,
      settings: {
        format: 'mp4',
        resolutionWidth: 640,
        resolutionHeight: 360,
        durationSeconds: 3,
      },
    });

    // Check credits were reserved
    const reservedBalance = await creditsService.getBalance(testUserId);
    expect(reservedBalance).toBe(initialBalance - job.creditCost);

    // Cancel while queued
    const cancelledJob = await renderJobService.cancelRenderJob(job.id, testUserId);
    expect(cancelledJob.status).toBe('cancelled');
    expect(cancelledJob.cancelledAt).not.toBeNull();

    // Verify full credit refund compensation
    const finalBalance = await creditsService.getBalance(testUserId);
    expect(finalBalance).toBe(initialBalance);
  });

  it('5. Handles render job failure safely, records safe diagnostic error, and compensates credits', async () => {
    const initialBalance = await creditsService.getBalance(testUserId);
    const failJobId = randomUUID();
    const fakeProjectId = randomUUID();

    // Deduct reservation credits to simulate real credit reservation
    await creditsService.deductCredits(testUserId, 10, 'Render export reservation', `res_${failJobId}`);

    const jobData: RenderJob = {
      id: failJobId,
      userId: testUserId,
      projectId: fakeProjectId,
      status: 'queued',
      stage: 'queued',
      progress: 0,
      settings: {
        format: 'mp4',
        resolutionWidth: 640,
        resolutionHeight: 360,
        framerate: 30,
        videoCodec: 'h264',
        audioCodec: 'aac',
        durationSeconds: 3,
      },
      creditCost: 10,
      creditReservationId: `res_${failJobId}`,
      workerMetadata: {},
      attempts: 0,
      maxAttempts: 3,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    mockRenderJobs.set(failJobId, jobData);
    await db.query(
      `INSERT INTO render_jobs (id, user_id, project_id, project_version_id, settings, worker_metadata, max_attempts, credit_reservation_id, credit_cost)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);`,
      [failJobId, testUserId, fakeProjectId, null, JSON.stringify(jobData.settings), JSON.stringify({}), 3, `res_${failJobId}`, 10]
    );

    // Intentionally process job with non-existent project to force failure
    await expect(
      renderWorker.processRenderJob({
        id: failJobId,
        type: 'render_jobs',
        data: {
          renderJobId: failJobId,
          projectId: fakeProjectId,
        },
      } as any)
    ).rejects.toThrow();

    // Verify job transitioned to failed with safe diagnostic error
    const failedJob = await renderJobService.getRenderJob(failJobId, testUserId);
    expect(failedJob.status).toBe('failed');
    expect(failedJob.errorCode).toBe('RENDER_EXECUTION_FAILED');
    expect(failedJob.errorMessage).toBeDefined();

    // Verify credits were compensated/refunded
    const finalBalance = await creditsService.getBalance(testUserId);
    expect(finalBalance).toBe(initialBalance);
  });

  it('6. Rejects malicious or invalid render settings (Security enforcement)', () => {
    // Arbitrary shell injection or unsupported codecs
    expect(() =>
      renderJobService.validateSettings({
        format: 'mp4',
        videoCodec: 'invalid_hacker_codec' as any,
      })
    ).toThrow(/does not support video codec/);

    // Out of bounds resolution
    expect(() =>
      renderJobService.validateSettings({
        format: 'mp4',
        resolutionWidth: 999999,
      })
    ).toThrow(/out of supported bounds/);

    // Out of bounds framerate
    expect(() =>
      renderJobService.validateSettings({
        format: 'mp4',
        framerate: 500,
      })
    ).toThrow(/Framerate 500 is out of supported bounds/);
  });
});
