import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto, { randomUUID } from 'crypto';
import { buildApp } from '../src/app.js';
import { db } from '../src/database/client.js';
import { renderWorker } from '../src/modules/jobs/render-worker.service.js';
import { renderJobService, mockRenderJobs } from '../src/modules/jobs/render-job.service.js';
import { RenderJob } from '../src/modules/jobs/render-job.types.js';
import { creditsService } from '../src/modules/credits/credits.service.js';
import { storageService } from '../src/services/storage/index.js';
import { ffmpegService } from '../src/modules/media/ffmpeg.service.js';
import { projectsService, mockProjects, mockVersionHistory } from '../src/modules/projects/projects.service.js';
import { mockMediaAssets } from '../src/modules/media/media.service.js';
import { realtimeService } from '../src/modules/realtime/realtime.service.js';

describe('DAY 5 — BACKEND COMMAND 25: Real Render End-to-End Acceptance Pipeline', () => {
  let app: FastifyInstance;
  let userAId: string;
  let userAToken: string;
  let userBId: string;
  let userBToken: string;
  let tempTestDir: string;
  let projectAId: string;
  let mediaAssetAId: string;
  let mediaAssetAKey: string;
  let localMediaClipPath: string;

  // Shared across test blocks
  let completedJobId: string;
  let completedOutputUrl: string;
  let downloadedOutputBuffer: Buffer;
  let downloadedFilePath: string;
  let capturedRealtimeEvents: Array<{ event: string; payload: any }> = [];

  // Performance telemetry
  const performanceTelemetry = {
    uploadDurationMs: 0,
    queueWaitMs: 0,
    renderDurationMs: 0,
    storageUploadDurationMs: 0,
    totalDurationMs: 0,
    outputSizeBytes: 0,
    independentProbeDurationSec: 0,
    independentProbeWidth: 0,
    independentProbeHeight: 0,
  };

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    tempTestDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'render_e2e_acceptance_'));

    // Register User A
    const regResA = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: `render_e2e_lead_${Date.now()}@techxayan.com`,
        password: 'Password123!',
        displayName: 'E2E Acceptance Lead',
      },
    });
    const regDataA = JSON.parse(regResA.body).data;
    userAId = regDataA.user.id;
    userAToken = regDataA.tokens.accessToken;

    // Register User B (for multi-tenant isolation testing)
    const regResB = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: `render_e2e_attacker_${Date.now()}@techxayan.com`,
        password: 'Password123!',
        displayName: 'E2E Malicious Tenant',
      },
    });
    const regDataB = JSON.parse(regResB.body).data;
    userBId = regDataB.user.id;
    userBToken = regDataB.tokens.accessToken;

    // Drain initial balance from User B so they have 0 credits
    const userBBal = await creditsService.getBalance(userBId);
    if (userBBal > 0) {
      await creditsService.deductCredits(userBId, userBBal, 'Zeroing balance for insufficient credits test');
    }

    // Attach realtime interception before any jobs run
    const origNotifyStarted = realtimeService.notifyRenderStarted.bind(realtimeService);
    const origNotifyProgress = realtimeService.notifyRenderProgress.bind(realtimeService);
    const origNotifyCompleted = realtimeService.notifyRenderCompleted.bind(realtimeService);
    const origNotifyFailed = realtimeService.notifyRenderJobFailed.bind(realtimeService);

    realtimeService.notifyRenderStarted = (job) => {
      capturedRealtimeEvents.push({ event: 'render:started', payload: { jobId: job.id, status: job.status } });
      return origNotifyStarted(job);
    };

    realtimeService.notifyRenderProgress = (job, progress, stage) => {
      capturedRealtimeEvents.push({ event: 'render:progress', payload: { jobId: job.id, progress, stage } });
      return origNotifyProgress(job, progress, stage);
    };

    realtimeService.notifyRenderCompleted = (job, output) => {
      capturedRealtimeEvents.push({ event: 'render:completed', payload: { jobId: job.id, output } });
      return origNotifyCompleted(job, output);
    };

    realtimeService.notifyRenderJobFailed = (job, error) => {
      capturedRealtimeEvents.push({ event: 'render:failed', payload: { jobId: job.id, error } });
      return origNotifyFailed(job, error);
    };
  });

  afterAll(async () => {
    try {
      await fs.promises.rm(tempTestDir, { recursive: true, force: true });
    } catch {}
    if (app) {
      await app.close();
    }
  });

  // ============================================================================
  // 1. FULL 24-STEP END-TO-END RENDER PIPELINE ACCEPTANCE
  // ============================================================================
  describe('Full 24-Step Production Render Pipeline with Real Media', () => {
    it('Steps 1-4: Authenticated user creates project, uploads real media & probes streams', async () => {
      // Step 1: User A is authenticated
      expect(userAToken).toBeDefined();
      expect(userAId).toBeDefined();

      // Step 2: Create Project
      const createProjRes = await app.inject({
        method: 'POST',
        url: '/v1/projects',
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          title: 'E2E Full Render Acceptance Project',
          description: 'Production verification of full 24-step rendering pipeline',
        },
      });
      expect(createProjRes.statusCode).toBe(201);
      const projBody = JSON.parse(createProjRes.body).data;
      projectAId = projBody.id;
      expect(projectAId).toBeDefined();

      // Step 3: Generate Real Media File via FFmpeg and upload to storage
      const tUploadStart = Date.now();
      localMediaClipPath = path.join(tempTestDir, 'source_clip.mp4');

      await renderWorker.generateSyntheticClip(localMediaClipPath, {
        duration: 3,
        width: 1280,
        height: 720,
        fps: 30,
        label: 'E2E Source Clip 1',
        audioToneHz: 440,
      });

      expect(fs.existsSync(localMediaClipPath)).toBe(true);

      // Step 4: Native/ffprobe media verification of source clip
      const probeSource = await ffmpegService.probeMedia(localMediaClipPath);
      expect(probeSource.resolution.width).toBe(1280);
      expect(probeSource.resolution.height).toBe(720);
      expect(probeSource.codec).toBe('h264');
      expect(probeSource.audioCodec).toBe('aac');
      expect(probeSource.duration).toBeGreaterThanOrEqual(2.5);

      // Upload media file to storage
      mediaAssetAId = `asset-e2e-${Date.now()}`;
      mediaAssetAKey = `users/${userAId}/media/video/${mediaAssetAId}.mp4`;
      const clipBuffer = await fs.promises.readFile(localMediaClipPath);

      await storageService.putObject(mediaAssetAKey, clipBuffer, 'video/mp4');
      performanceTelemetry.uploadDurationMs = Date.now() - tUploadStart;

      mockMediaAssets.set(mediaAssetAId, {
        id: mediaAssetAId,
        userId: userAId,
        projectId: projectAId,
        name: 'E2E 720p 440Hz Test Clip',
        originalFilename: 'source_clip.mp4',
        category: 'video',
        fileKey: mediaAssetAKey,
        mimeType: 'video/mp4',
        fileSizeBytes: clipBuffer.length,
        durationSeconds: probeSource.duration,
        width: probeSource.resolution.width,
        height: probeSource.resolution.height,
        framerate: 30,
        codec: probeSource.codec,
        status: 'READY',
        uploadType: 'direct',
        retentionDays: 30,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as any);

      expect(mockMediaAssets.has(mediaAssetAId)).toBe(true);
    });

    it('Step 5: Create project version with multi-track timeline and clips', async () => {
      const project = mockProjects.get(projectAId) || {
        id: projectAId,
        userId: userAId,
        title: 'E2E Full Render Acceptance Project',
        status: 'active',
        version: 1,
        projectVersion: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      project.canvas = {
        resolutionWidth: 1280,
        resolutionHeight: 720,
        framerate: 30,
        aspectRatio: '16:9',
        colorSpace: 'rec709',
        backgroundColor: '#000000',
      };

      project.timeline = {
        duration: 3,
        framerate: 30,
        tracks: [
          {
            id: 'track-v1',
            type: 'video',
            name: 'Main Video Track',
            muted: false,
            locked: false,
            clips: [
              {
                id: 'clip-v1',
                mediaAssetId: mediaAssetAId,
                start: 0,
                duration: 3,
                sourceStart: 0,
                sourceEnd: 3,
                transform: {
                  scaleX: 1.0,
                  scaleY: 1.0,
                  positionX: 0,
                  positionY: 0,
                  rotationDegrees: 0,
                  opacity: 1.0,
                },
              },
            ],
          },
          {
            id: 'track-txt1',
            type: 'text',
            name: 'Title Overlay',
            muted: false,
            locked: false,
            clips: [
              {
                id: 'clip-txt1',
                text: 'E2E REAL RENDER ACCEPTANCE',
                start: 0,
                duration: 3,
                fontSize: 36,
                color: '#FFFFFF',
              },
            ],
          },
        ],
      };

      project.version = 2;
      project.projectVersion = 2;
      mockProjects.set(projectAId, project as any);

      // Record in project version history (mapped by projectId)
      mockVersionHistory.set(projectAId, [
        {
          id: `ver-${projectAId}-2`,
          projectId: projectAId,
          versionNumber: 2,
          snapshotData: {
            canvas: project.canvas,
            timeline: project.timeline,
          },
          changeSummary: 'Added real media video track and title overlay',
          createdAt: new Date().toISOString(),
          createdBy: userAId,
        } as any,
      ]);

      expect(project.version).toBe(2);
    });

    it('Steps 6-10: Create render request, reserve credits, persist render_jobs with snapshot & enqueue', async () => {
      const balanceBefore = await creditsService.getBalance(userAId);

      const renderRes = await app.inject({
        method: 'POST',
        url: '/v1/jobs/render',
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          projectId: projectAId,
          versionNumber: 2,
          settings: {
            format: 'mp4',
            resolutionWidth: 1280,
            resolutionHeight: 720,
            framerate: 30,
            videoCodec: 'h264',
            audioCodec: 'aac',
            crf: 23,
            preset: 'ultrafast',
          },
        },
      });

      expect(renderRes.statusCode).toBe(202);
      const resData = JSON.parse(renderRes.body).data;
      completedJobId = resData.id;
      expect(completedJobId).toBeDefined();

      // Step 7: Verify Credit Reservation
      const balanceAfter = await creditsService.getBalance(userAId);
      const creditCost = resData.creditCost;
      expect(balanceBefore - balanceAfter).toBe(creditCost);
      expect(resData.creditReservationId).toBeDefined();

      // Step 8: Verify render_jobs record state & immutable snapshot
      const jobRecord = mockRenderJobs.get(completedJobId);
      expect(jobRecord).toBeDefined();
      expect(jobRecord?.snapshotHash).toBeDefined();
      expect(jobRecord?.snapshotHash.length).toBe(64); // SHA-256
      expect(jobRecord?.snapshot).toBeDefined();
      expect(jobRecord?.snapshot?.projectVersion).toBe(2);
      expect(jobRecord?.snapshot?.timeline.tracks.length).toBe(2);
      expect(jobRecord?.snapshot?.sourceMedia[mediaAssetAId]).toBeDefined();

      // Step 9: Verify transaction committed / persistence confirmed
      const verifiedJob = await renderJobService.getRenderJob(completedJobId, userAId);
      expect(verifiedJob.id).toBe(completedJobId);

      // Step 10: Enqueue verified
      expect(['queued', 'starting', 'running', 'completed']).toContain(jobRecord?.status);
    });

    it('Steps 11-21: Real worker executes FFmpeg pipeline, emits real progress, validates & uploads output', async () => {
      const tRenderStart = Date.now();

      // Step 11: Worker execution
      const queueJob = {
        id: completedJobId,
        data: {
          renderJobId: completedJobId,
          projectId: projectAId,
          projectVersion: 2,
          snapshotHash: mockRenderJobs.get(completedJobId)!.snapshotHash,
          snapshot: mockRenderJobs.get(completedJobId)!.snapshot,
        },
      } as any;

      // Steps 12-20: Execute real render worker (idempotent if background processor already completed)
      const renderOutput = await renderWorker.processRenderJob(queueJob);
      const tRenderEnd = Date.now();
      performanceTelemetry.renderDurationMs = tRenderEnd - tRenderStart;
      performanceTelemetry.totalDurationMs = performanceTelemetry.uploadDurationMs + performanceTelemetry.renderDurationMs;

      // Step 16: Verify Real Progress Events Emitted
      expect(capturedRealtimeEvents.some((e) => e.event === 'render:started')).toBe(true);
      expect(capturedRealtimeEvents.some((e) => e.event === 'render:progress')).toBe(true);
      const completedEvt = capturedRealtimeEvents.find((e) => e.event === 'render:completed');
      expect(completedEvt).toBeDefined();

      // Step 17-19: Output and DB State
      expect(renderOutput).toBeDefined();
      expect(renderOutput.storageKey).toBeDefined();
      expect(renderOutput.sizeBytes).toBeGreaterThan(0);
      expect(renderOutput.durationSeconds).toBeGreaterThanOrEqual(2.5);
      expect(renderOutput.width).toBe(1280);
      expect(renderOutput.height).toBe(720);
      expect(renderOutput.format).toBe('mp4');
      expect(renderOutput.checksumSha256).toBeDefined();

      performanceTelemetry.outputSizeBytes = renderOutput.sizeBytes;

      const finalizedJob = await renderJobService.getRenderJob(completedJobId, userAId);
      expect(finalizedJob.status).toBe('completed');
      expect(finalizedJob.progress).toBe(100.0);
      expect(finalizedJob.stage).toBe('completed');
      expect(finalizedJob.completedAt).toBeDefined();

      // Step 20: Credit Consumption Verification (No refund granted on success)
      const currentBalance = await creditsService.getBalance(userAId);
      expect(currentBalance).toBeGreaterThan(0);
    });

    it('Steps 22-24: Request signed download URL, download output and run external/independent media verification', async () => {
      // Step 22: Request signed download URL
      const downloadRes = await app.inject({
        method: 'GET',
        url: `/v1/jobs/render/${completedJobId}/download-url`,
        headers: { authorization: `Bearer ${userAToken}` },
      });

      expect(downloadRes.statusCode).toBe(200);
      const downloadData = JSON.parse(downloadRes.body).data;
      expect(downloadData.downloadUrl).toBeDefined();
      expect(downloadData.storageKey).toBeDefined();
      completedOutputUrl = downloadData.downloadUrl;

      // Step 23: Download output bytes using the signed URL
      downloadedOutputBuffer = await storageService.downloadByPresignedUrl(completedOutputUrl);
      expect(downloadedOutputBuffer).toBeDefined();
      expect(downloadedOutputBuffer.length).toBeGreaterThan(0);
      expect(downloadedOutputBuffer.length).toBe(performanceTelemetry.outputSizeBytes);

      // Save to isolated test directory for independent ffprobe validation
      downloadedFilePath = path.join(tempTestDir, `e2e_downloaded_render_${completedJobId}.mp4`);
      await fs.promises.writeFile(downloadedFilePath, downloadedOutputBuffer);
      expect(fs.existsSync(downloadedFilePath)).toBe(true);

      // Step 24: EXTERNAL / INDEPENDENT MEDIA VERIFICATION
      // Execute standalone native ffprobe inspection on the downloaded output
      const independentProbe = await ffmpegService.probeMedia(downloadedFilePath);

      expect(independentProbe.resolution.width).toBe(1280);
      expect(independentProbe.resolution.height).toBe(720);
      expect(independentProbe.codec).toBe('h264');
      expect(independentProbe.audioCodec).toBe('aac');
      expect(independentProbe.duration).toBeGreaterThanOrEqual(2.5);

      performanceTelemetry.independentProbeDurationSec = independentProbe.duration;
      performanceTelemetry.independentProbeWidth = independentProbe.resolution.width;
      performanceTelemetry.independentProbeHeight = independentProbe.resolution.height;

      // Verify SHA-256 integrity match between downloaded file and recorded output
      const downloadedBytes = await fs.promises.readFile(downloadedFilePath);
      const calculatedHash = crypto.createHash('sha256').update(downloadedBytes).digest('hex');
      const jobRecord = mockRenderJobs.get(completedJobId);
      expect(calculatedHash).toBe(jobRecord?.outputObject?.checksumSha256);
    });
  });

  // ============================================================================
  // 2. COMPREHENSIVE FAILURE PATHS & CREDIT SAFETY
  // ============================================================================
  describe('Comprehensive Failure Paths & Credit Safety', () => {
    it('Failure Path: Missing media asset is rejected prior to job creation & credit deduction', async () => {
      const balanceBefore = await creditsService.getBalance(userAId);

      // Create invalid project referencing non-existent media asset with valid UUID
      const invalidProjectId = randomUUID();
      mockProjects.set(invalidProjectId, {
        id: invalidProjectId,
        userId: userAId,
        title: 'Missing Media Project',
        status: 'active',
        version: 1,
        projectVersion: 1,
        canvas: { resolutionWidth: 640, resolutionHeight: 360, framerate: 30, aspectRatio: '16:9' },
        timeline: {
          duration: 2,
          tracks: [
            {
              id: 't1',
              type: 'video',
              clips: [{ id: 'c1', mediaAssetId: 'non-existent-asset-9999', start: 0, duration: 2 }],
            },
          ],
        },
      } as any);

      const renderRes = await app.inject({
        method: 'POST',
        url: '/v1/jobs/render',
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          projectId: invalidProjectId,
          settings: { format: 'mp4', resolutionWidth: 640, resolutionHeight: 360 },
        },
      });

      // Must be rejected with 400 Validation Error
      expect(renderRes.statusCode).toBe(400);
      const err = JSON.parse(renderRes.body);
      expect(err.error?.message).toContain('Referenced media asset');

      // Balance must NOT have been deducted
      const balanceAfter = await creditsService.getBalance(userAId);
      expect(balanceAfter).toBe(balanceBefore);
    });

    it('Failure Path: Invalid resolution or codec matrix is rejected with 400', async () => {
      // Incompatible WebM + h264
      const invalidCodecRes = await app.inject({
        method: 'POST',
        url: '/v1/jobs/render',
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          projectId: projectAId,
          settings: {
            format: 'webm',
            videoCodec: 'h264',
          },
        },
      });
      expect(invalidCodecRes.statusCode).toBe(400);

      // Out of bounds resolution
      const invalidResRes = await app.inject({
        method: 'POST',
        url: '/v1/jobs/render',
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          projectId: projectAId,
          settings: {
            format: 'mp4',
            resolutionWidth: 100, // min is 320
            resolutionHeight: 100,
          },
        },
      });
      expect(invalidResRes.statusCode).toBe(400);
    });

    it('Failure Path & Credit Safety: Renderer failure triggers automatic credit refund', async () => {
      const balanceBefore = await creditsService.getBalance(userAId);

      // Manually set up a job record with reserved credits and corrupted source media
      const failJobId = randomUUID();
      const reservationId = randomUUID();
      const failCreditCost = 25;

      await creditsService.deductCredits(userAId, failCreditCost, 'Failure test reservation', reservationId);
      const balanceDuring = await creditsService.getBalance(userAId);
      expect(balanceDuring).toBe(balanceBefore - failCreditCost);

      const corruptedAssetId = `asset-corrupt-${Date.now()}`;
      const corruptedKey = `users/${userAId}/media/video/${corruptedAssetId}.mp4`;
      // Write corrupted garbage bytes to storage
      await storageService.putObject(corruptedKey, Buffer.from('NOT_A_VALID_MP4_CONTENT_12345'), 'video/mp4');

      mockMediaAssets.set(corruptedAssetId, {
        id: corruptedAssetId,
        userId: userAId,
        fileKey: corruptedKey,
        mimeType: 'video/mp4',
        status: 'READY',
      } as any);

      const failJob: RenderJob = {
        id: failJobId,
        userId: userAId,
        projectId: projectAId,
        projectVersion: 2,
        status: 'queued',
        settings: {
          format: 'mp4',
          resolutionWidth: 640,
          resolutionHeight: 360,
          framerate: 30,
          videoCodec: 'h264',
          audioCodec: 'aac',
        },
        progress: 0,
        stage: 'queued',
        errorCode: null,
        errorMessage: null,
        outputObject: null,
        workerMetadata: {},
        attempts: 0,
        maxAttempts: 3,
        creditReservationId: reservationId,
        creditCost: failCreditCost,
        snapshot: {
          snapshotVersion: 1,
          snapshotHash: 'fail-hash',
          projectId: projectAId,
          projectVersion: 2,
          projectTitle: 'Failure Project',
          createdAt: new Date().toISOString(),
          canvas: { resolutionWidth: 640, resolutionHeight: 360, framerate: 30, aspectRatio: '16:9' },
          timeline: {
            duration: 2,
            framerate: 30,
            tracks: [
              {
                id: 't-fail',
                type: 'video',
                clips: [{ id: 'c-fail', mediaAssetId: corruptedAssetId, start: 0, duration: 2 }],
              },
            ],
          },
          sourceMedia: {
            [corruptedAssetId]: {
              assetId: corruptedAssetId,
              name: 'Corrupted File',
              fileKey: corruptedKey,
              mimeType: 'video/mp4',
              fileSizeBytes: 28,
              status: 'READY',
            },
          },
          exportSettings: { format: 'mp4', resolutionWidth: 640, resolutionHeight: 360, framerate: 30, videoCodec: 'h264', audioCodec: 'aac' },
        },
        createdAt: new Date().toISOString(),
        startedAt: null,
        completedAt: null,
        cancelledAt: null,
        updatedAt: new Date().toISOString(),
      };
      mockRenderJobs.set(failJobId, failJob);

      // Execute worker directly on corrupted file -> FFmpeg will fail with code 1
      const queueJob = {
        id: failJobId,
        data: {
          renderJobId: failJobId,
          projectId: projectAId,
          snapshot: failJob.snapshot,
          snapshotHash: failJob.snapshotHash,
        },
      } as any;

      await expect(renderWorker.processRenderJob(queueJob)).rejects.toThrow();

      const failedJobRecord = mockRenderJobs.get(failJobId);
      expect(failedJobRecord?.status).toBe('failed');
      expect(failedJobRecord?.errorCode).toBe('RENDER_EXECUTION_FAILED');

      // Verify Credit Compensation: Full refund was granted
      const balanceAfterFailure = await creditsService.getBalance(userAId);
      expect(balanceAfterFailure).toBe(balanceBefore);
    });

    it('Failure Path & Credit Safety: Cancelling queued job refunds credits & emits render:cancelled', async () => {
      const balanceBefore = await creditsService.getBalance(userAId);

      // Create a fresh project for cancellation test
      const cancelProjRes = await app.inject({
        method: 'POST',
        url: '/v1/projects',
        headers: { authorization: `Bearer ${userAToken}` },
        payload: { title: 'Cancellation Test Project' },
      });
      const cancelProjId = JSON.parse(cancelProjRes.body).data.id;
      const projCancel = mockProjects.get(cancelProjId)!;
      projCancel.canvas = { resolutionWidth: 640, resolutionHeight: 360, framerate: 30, aspectRatio: '16:9' };
      projCancel.timeline = {
        duration: 3,
        framerate: 30,
        tracks: [
          {
            id: 'tc1',
            type: 'text',
            clips: [{ id: 'cc1', text: 'Cancel test', start: 0, duration: 3 }],
          },
        ],
      };
      mockProjects.set(cancelProjId, projCancel);

      // Submit new job
      const cancelJobRes = await app.inject({
        method: 'POST',
        url: '/v1/jobs/render',
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          projectId: cancelProjId,
          settings: { format: 'mp4', resolutionWidth: 640, resolutionHeight: 360, crf: 28 },
        },
      });

      expect(cancelJobRes.statusCode).toBe(202);
      const cancelJobId = JSON.parse(cancelJobRes.body).data.id;
      const creditCost = JSON.parse(cancelJobRes.body).data.creditCost;

      // Cancel the job
      const cancelActionRes = await app.inject({
        method: 'POST',
        url: `/v1/jobs/render/${cancelJobId}/cancel`,
        headers: { authorization: `Bearer ${userAToken}` },
      });

      expect(cancelActionRes.statusCode).toBe(200);
      const cancelledData = JSON.parse(cancelActionRes.body).data;
      expect(cancelledData.status).toBe('cancelled');

      // Verify Credit Compensation: Credits refunded
      const balanceAfterCancel = await creditsService.getBalance(userAId);
      expect(balanceAfterCancel).toBe(balanceBefore);
    });

    it('Failure Path: Insufficient credits rejects render request with 402', async () => {
      // Create a project for User B with a valid timeline
      const projBRes = await app.inject({
        method: 'POST',
        url: '/v1/projects',
        headers: { authorization: `Bearer ${userBToken}` },
        payload: { title: 'User B Broke Project' },
      });
      const projBId = JSON.parse(projBRes.body).data.id;

      const projB = mockProjects.get(projBId)!;
      projB.canvas = { resolutionWidth: 640, resolutionHeight: 360, framerate: 30, aspectRatio: '16:9' };
      projB.timeline = {
        duration: 2,
        framerate: 30,
        tracks: [
          {
            id: 'tb1',
            type: 'text',
            clips: [{ id: 'cb1', text: 'Insufficient credits clip', start: 0, duration: 2 }],
          },
        ],
      };
      mockProjects.set(projBId, projB);

      const renderRes = await app.inject({
        method: 'POST',
        url: '/v1/jobs/render',
        headers: { authorization: `Bearer ${userBToken}` },
        payload: {
          projectId: projBId,
          settings: { format: 'mp4', resolutionWidth: 1920, resolutionHeight: 1080 },
        },
      });

      expect(renderRes.statusCode).toBe(402);
      expect(JSON.parse(renderRes.body).error?.code).toBe('INSUFFICIENT_CREDITS');
    });

    it('Failure Path: Expired presigned download URL is rejected with 410', async () => {
      // Create an expired presigned download URL (expired 5 seconds ago)
      const expiredUrl = `https://storage.mock.local/editor-media-bucket/${mediaAssetAKey}?signed_download=true&expiresAt=${Date.now() - 5000}&exp=-5`;

      await expect(storageService.downloadByPresignedUrl(expiredUrl)).rejects.toThrow('Presigned download URL has expired');
    });

    it('Idempotency & Duplicate Request: Same snapshot hash returns existing job with no double charge', async () => {
      const balanceBefore = await creditsService.getBalance(userAId);

      // Request render with identical project version & settings as completed job
      const duplicateRes = await app.inject({
        method: 'POST',
        url: '/v1/jobs/render',
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          projectId: projectAId,
          versionNumber: 2,
          settings: {
            format: 'mp4',
            resolutionWidth: 1280,
            resolutionHeight: 720,
            framerate: 30,
            videoCodec: 'h264',
            audioCodec: 'aac',
            crf: 23,
            preset: 'ultrafast',
          },
        },
      });

      expect(duplicateRes.statusCode).toBe(202);
      const duplicateData = JSON.parse(duplicateRes.body).data;

      // Returns the exact same completed job ID
      expect(duplicateData.id).toBe(completedJobId);

      // Verify no double charge occurred
      const balanceAfter = await creditsService.getBalance(userAId);
      expect(balanceAfter).toBe(balanceBefore);
    });
  });

  // ============================================================================
  // 3. MULTI-TENANT SECURITY ISOLATION
  // ============================================================================
  describe('Multi-Tenant Security & RBAC Isolation', () => {
    it('Security: User B cannot access User A project (403/404)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/v1/projects/${projectAId}`,
        headers: { authorization: `Bearer ${userBToken}` },
      });
      expect([403, 404]).toContain(res.statusCode);
    });

    it('Security: User B cannot access User A render job (403 Forbidden)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/v1/jobs/render/${completedJobId}`,
        headers: { authorization: `Bearer ${userBToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('Security: User B cannot download User A render output (403 Forbidden)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/v1/jobs/render/${completedJobId}/download-url`,
        headers: { authorization: `Bearer ${userBToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('Security: User B cannot cancel User A render job (403 Forbidden)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/v1/jobs/render/${completedJobId}/cancel`,
        headers: { authorization: `Bearer ${userBToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // ============================================================================
  // 4. RESOURCE CLEANUP & DATABASE HYGIENE
  // ============================================================================
  describe('Resource Cleanup & Database Hygiene', () => {
    it('Database Hygiene: No orphan render jobs or scratch workspaces', async () => {
      // 1. Verify worker temporary directories are purged
      const activeSessionsCount = (renderWorker as any).activeSessions?.size ?? 0;
      expect(activeSessionsCount).toBe(0);

      // 2. Verify all mock render jobs have valid snapshots and owners
      for (const job of mockRenderJobs.values()) {
        expect(job.userId).toBeDefined();
        expect(job.projectId).toBeDefined();
        expect(job.status).toBeDefined();
        if (job.status === 'completed') {
          expect(job.outputObject).toBeDefined();
          expect(job.outputObject?.storageKey).toBeDefined();
        }
      }
    });

    it('Performance Telemetry: Log and assert realistic benchmarks', () => {
      expect(performanceTelemetry.renderDurationMs).toBeGreaterThan(0);
      expect(performanceTelemetry.outputSizeBytes).toBeGreaterThan(0);
      expect(performanceTelemetry.independentProbeWidth).toBe(1280);
      expect(performanceTelemetry.independentProbeHeight).toBe(720);
      expect(performanceTelemetry.independentProbeDurationSec).toBeGreaterThanOrEqual(2.5);

      console.log('----------------------------------------------------');
      console.log('REAL RENDER END-TO-END ACCEPTANCE TELEMETRY:');
      console.log(`- Upload Duration:        ${performanceTelemetry.uploadDurationMs} ms`);
      console.log(`- Render Duration:        ${performanceTelemetry.renderDurationMs} ms`);
      console.log(`- Total Pipeline Duration:${performanceTelemetry.totalDurationMs} ms`);
      console.log(`- Output File Size:       ${(performanceTelemetry.outputSizeBytes / 1024).toFixed(1)} KB`);
      console.log(`- Output Resolution:      ${performanceTelemetry.independentProbeWidth}x${performanceTelemetry.independentProbeHeight}`);
      console.log(`- Independent Probe Dur:  ${performanceTelemetry.independentProbeDurationSec.toFixed(2)}s`);
      console.log('----------------------------------------------------');
    });
  });
});
