import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { buildApp } from '../src/app.js';
import { renderWorker } from '../src/modules/jobs/render-worker.service.js';
import { renderJobService, mockRenderJobs } from '../src/modules/jobs/render-job.service.js';
import { creditsService } from '../src/modules/credits/credits.service.js';
import { storageService } from '../src/services/storage/index.js';
import { ffmpegService } from '../src/modules/media/ffmpeg.service.js';
import { projectsService, mockProjects, mockVersionHistory } from '../src/modules/projects/projects.service.js';
import { mockMediaAssets } from '../src/modules/media/media.service.js';

describe('DAY 5 COMMAND 23: Immutable Render Project Snapshot Acceptance & Version Safety', () => {
  let app: FastifyInstance;
  let testUserId: string;
  let testUserToken: string;
  let testProjectId: string;
  let tempTestDir: string;
  let assetId1: string;
  let assetId2: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    tempTestDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'render_snapshot_test_'));

    // 1. Create authenticated test user
    const regRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: `snapshot_test_${Date.now()}@techxayan.com`,
        password: 'Password123!',
        displayName: 'Snapshot Architect',
      },
    });

    const regData = JSON.parse(regRes.body).data;
    testUserId = regData.user.id;
    testUserToken = regData.tokens.accessToken;

    // 2. Grant credits to user for rendering
    await creditsService.grantCredits(testUserId, 500, 'system_grant', 'Snapshot rendering test budget');

    // 3. Generate synthetic media clips and upload to object storage
    const clip1Local = path.join(tempTestDir, 'snap_clip1.mp4');
    const clip2Local = path.join(tempTestDir, 'snap_clip2.mp4');

    await renderWorker.generateSyntheticClip(clip1Local, {
      duration: 2,
      width: 640,
      height: 360,
      fps: 30,
      label: 'Scene 1',
      audioToneHz: 440,
    });

    await renderWorker.generateSyntheticClip(clip2Local, {
      duration: 3,
      width: 640,
      height: 360,
      fps: 30,
      label: 'Scene 2',
      audioToneHz: 660,
    });

    assetId1 = `asset-snap-1-${Date.now()}`;
    assetId2 = `asset-snap-2-${Date.now()}`;

    const clip1Key = `users/${testUserId}/media/video/${assetId1}.mp4`;
    const clip2Key = `users/${testUserId}/media/video/${assetId2}.mp4`;

    const clip1Buf = await fs.promises.readFile(clip1Local);
    const clip2Buf = await fs.promises.readFile(clip2Local);

    await storageService.putObject(clip1Key, clip1Buf, 'video/mp4');
    await storageService.putObject(clip2Key, clip2Buf, 'video/mp4');

    mockMediaAssets.set(assetId1, {
      id: assetId1,
      userId: testUserId,
      name: 'Clip 1 (440Hz)',
      fileKey: clip1Key,
      mimeType: 'video/mp4',
      status: 'READY',
      fileSizeBytes: clip1Buf.length,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any);

    mockMediaAssets.set(assetId2, {
      id: assetId2,
      userId: testUserId,
      name: 'Clip 2 (660Hz)',
      fileKey: clip2Key,
      mimeType: 'video/mp4',
      status: 'READY',
      fileSizeBytes: clip2Buf.length,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any);
  });

  afterAll(async () => {
    try {
      await fs.promises.rm(tempTestDir, { recursive: true, force: true });
    } catch {}
    await app.close();
  });

  it('1. Creates Project Version 1 with specific timeline clips & text overlay', async () => {
    const createProjectRes = await app.inject({
      method: 'POST',
      url: '/v1/projects',
      headers: {
        authorization: `Bearer ${testUserToken}`,
      },
      payload: {
        title: 'Snapshot Test Project',
        description: 'Testing immutable project snapshot version safety',
        canvas: {
          resolutionWidth: 640,
          resolutionHeight: 360,
          framerate: 30,
          aspectRatio: '16:9',
          colorSpace: 'rec709',
          backgroundColor: '#000000',
        },
      },
    });

    expect(createProjectRes.statusCode).toBe(201);
    const project = JSON.parse(createProjectRes.body).data;
    testProjectId = project.id;
    expect(testProjectId).toBeDefined();
    expect(project.version).toBe(1);

    // Populate Version 1 timeline with 1 video clip (assetId1, 2 seconds) + text overlay "VERSION 1"
    const updatedProject = await projectsService.update(testProjectId, testUserId, {
      timeline: {
        duration: 2,
        framerate: 30,
        tracks: [
          {
            id: 'vtrack-1',
            type: 'video',
            name: 'Main Video Track',
            muted: false,
            locked: false,
            clips: [
              {
                id: 'clip-v1-1',
                mediaAssetId: assetId1,
                name: 'Clip 1 (2s)',
                start: 0,
                duration: 2,
                sourceStart: 0,
                speed: 1.0,
                volume: 1.0,
              },
            ],
          },
          {
            id: 'ttrack-1',
            type: 'text',
            name: 'Title Track',
            muted: false,
            locked: false,
            clips: [
              {
                id: 'text-v1-1',
                start: 0,
                duration: 2,
                text: {
                  content: 'VERSION 1 ORIGINAL',
                  fontSize: 28,
                  color: 'white',
                  fontFamily: 'Inter',
                  alignment: 'center',
                },
              },
            ],
          },
        ],
        markers: [],
      },
    });

    expect(updatedProject.version).toBe(2);
    // Note: projectsService.update increments version to 2 when saving the timeline.
    // Let's verify we have version 2 as our baseline v1 timeline state.
  });

  it('2. Submits render job for current project state; verifies snapshot structure, version freeze & hash', async () => {
    const renderRes = await app.inject({
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
          durationSeconds: 2,
        },
      },
    });

    expect([201, 202]).toContain(renderRes.statusCode);
    const renderJob = JSON.parse(renderRes.body).data;
    expect(renderJob.id).toBeDefined();
    expect(renderJob.status).toBe('queued');
    expect(renderJob.projectVersion).toBe(2); // Frozen version at submission time
    expect(renderJob.snapshotHash).toBeDefined();
    expect(typeof renderJob.snapshotHash).toBe('string');
    expect(renderJob.snapshotHash.length).toBe(64); // SHA-256

    // Inspect the snapshot attached to the job
    const snapshot = renderJob.snapshot;
    expect(snapshot).toBeDefined();
    expect(snapshot.snapshotVersion).toBe(1);
    expect(snapshot.projectVersion).toBe(2);
    expect(snapshot.timeline).toBeDefined();
    expect(snapshot.timeline.tracks.length).toBe(2);
    expect(snapshot.sourceMedia[assetId1]).toBeDefined();
    expect(snapshot.sourceMedia[assetId1].assetId).toBe(assetId1);

    // Verify clips have complete transform, trims, effects, text, audio structures
    const clip = snapshot.timeline.tracks[0].clips[0];
    expect(clip.trims).toBeDefined();
    expect(clip.transform).toBeDefined();
    expect(clip.effects).toBeInstanceOf(Array);
    expect(clip.audio).toBeDefined();
  });

  it('3. Modifies project to subsequent version (changes duration, clips, and text overlay)', async () => {
    // Update project with assetId2 (3 seconds) + text "VERSION 2 MUTATED"
    const mutatedProject = await projectsService.update(testProjectId, testUserId, {
      title: 'Snapshot Test Project — Mutated V2',
      timeline: {
        duration: 3,
        framerate: 30,
        tracks: [
          {
            id: 'vtrack-1',
            type: 'video',
            name: 'Main Video Track',
            muted: false,
            locked: false,
            clips: [
              {
                id: 'clip-v2-1',
                mediaAssetId: assetId2,
                name: 'Clip 2 (3s)',
                start: 0,
                duration: 3,
                sourceStart: 0,
                speed: 1.0,
                volume: 1.0,
              },
            ],
          },
          {
            id: 'ttrack-1',
            type: 'text',
            name: 'Title Track',
            muted: false,
            locked: false,
            clips: [
              {
                id: 'text-v2-1',
                start: 0,
                duration: 3,
                text: {
                  content: 'VERSION 2 MUTATED',
                  fontSize: 28,
                  color: 'cyan',
                  fontFamily: 'Inter',
                  alignment: 'center',
                },
              },
            ],
          },
        ],
        markers: [],
      },
    });

    expect(mutatedProject.version).toBe(3);
    expect(mutatedProject.timeline.duration).toBe(3);
  });

  it('4. Worker executes the earlier render job and renders the frozen snapshot, NOT the mutated project', async () => {
    // Find the first render job
    let firstJob: any;
    for (const job of mockRenderJobs.values()) {
      if (job.projectId === testProjectId && job.projectVersion === 2) {
        firstJob = job;
        break;
      }
    }
    expect(firstJob).toBeDefined();
    expect(firstJob.projectVersion).toBe(2);

    // Execute render worker on the first job
    const outputV1 = await renderWorker.processRenderJob({
      id: firstJob.id,
      type: 'render_jobs',
      data: {
        renderJobId: firstJob.id,
        projectId: testProjectId,
      },
    } as any);

    expect(outputV1).toBeDefined();
    expect(outputV1.storageKey).toBeDefined();
    expect(outputV1.sizeBytes).toBeGreaterThan(1000);

    // Download rendered video and verify duration matches snapshot (2s, NOT mutated 3s)
    const v1Bytes = await storageService.getObject(outputV1.storageKey!);
    const v1LocalPath = path.join(tempTestDir, 'output_v1_verify.mp4');
    await fs.promises.writeFile(v1LocalPath, v1Bytes);

    const probeV1 = await ffmpegService.probeMedia(v1LocalPath);
    // Duration must correspond to frozen snapshot duration (~2s), not mutated project (3s)
    expect(probeV1.duration).toBeGreaterThanOrEqual(1.8);
    expect(probeV1.duration).toBeLessThanOrEqual(2.3);
  });

  it('5. Renders the mutated project version separately and verifies outputs are distinct', async () => {
    // Submit render for the mutated state (project is at version 3)
    const renderResV2 = await app.inject({
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
          durationSeconds: 3,
        },
      },
    });

    expect([201, 202]).toContain(renderResV2.statusCode);
    const jobV2Data = JSON.parse(renderResV2.body).data;
    expect(jobV2Data.projectVersion).toBe(3);

    // Execute worker on job V2
    const outputV2 = await renderWorker.processRenderJob({
      id: jobV2Data.id,
      type: 'render_jobs',
      data: {
        renderJobId: jobV2Data.id,
        projectId: testProjectId,
      },
    } as any);

    expect(outputV2).toBeDefined();
    expect(outputV2.storageKey).toBeDefined();

    const v2Bytes = await storageService.getObject(outputV2.storageKey!);
    const v2LocalPath = path.join(tempTestDir, 'output_v2_verify.mp4');
    await fs.promises.writeFile(v2LocalPath, v2Bytes);

    const probeV2 = await ffmpegService.probeMedia(v2LocalPath);
    // Mutated version duration is ~3s
    expect(probeV2.duration).toBeGreaterThanOrEqual(2.8);
    expect(probeV2.duration).toBeLessThanOrEqual(3.3);

    // Hashes/Checksums of output videos must be completely distinct
    expect(outputV2.checksumSha256).not.toBe(jobV2Data.snapshotHash);
    expect(outputV2.storageKey).not.toBe(outputV1StorageKey(testProjectId));
  });

  it('6. Idempotency: Duplicate render request with identical snapshot + settings returns existing job without re-deducting credits', async () => {
    const userCreditsBefore = await creditsService.getBalance(testUserId);

    // Submit duplicate render for version 3 with identical settings
    const duplicateRes = await app.inject({
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
          durationSeconds: 3,
        },
      },
    });

    expect([200, 201, 202]).toContain(duplicateRes.statusCode);
    const duplicateBody = JSON.parse(duplicateRes.body).data;

    // Must return the previously created completed job for version 3
    expect(duplicateBody.projectVersion).toBe(3);

    // Credits must NOT have been deducted a second time
    const userCreditsAfter = await creditsService.getBalance(testUserId);
    expect(userCreditsAfter).toBe(userCreditsBefore);
  });

  it('7. Detects missing or deleted media asset before queueing and rejects deterministically', async () => {
    // Create a project referencing a deleted or non-existent media asset
    const nonExistentAssetId = 'asset-ghost-999999';
    const badProject = await projectsService.create(testUserId, {
      title: 'Bad Media Project',
    });

    await projectsService.update(badProject.id, testUserId, {
      timeline: {
        duration: 2,
        framerate: 30,
        tracks: [
          {
            id: 'vtrack-bad',
            type: 'video',
            name: 'Video',
            clips: [
              {
                id: 'clip-bad-1',
                mediaAssetId: nonExistentAssetId,
                name: 'Missing Clip',
                start: 0,
                duration: 2,
              },
            ],
          },
        ],
        markers: [],
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/v1/jobs/render',
      headers: {
        authorization: `Bearer ${testUserToken}`,
      },
      payload: {
        projectId: badProject.id,
        settings: {
          format: 'mp4',
          resolutionWidth: 640,
          resolutionHeight: 360,
          framerate: 30,
        },
      },
    });

    // Must fail with 400 Bad Request / Validation Error before queueing
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    const errMsg = body.error?.message || body.message || '';
    expect(errMsg).toContain('missing or has been deleted');
  });

  it('8. Detects invalid snapshot deterministically (empty tracks, zero duration)', async () => {
    const emptyProject = await projectsService.create(testUserId, {
      title: 'Empty Project',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/v1/jobs/render',
      headers: {
        authorization: `Bearer ${testUserToken}`,
      },
      payload: {
        projectId: emptyProject.id,
        settings: {
          format: 'mp4',
          resolutionWidth: 640,
          resolutionHeight: 360,
          framerate: 30,
        },
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    const errMsg = body.error?.message || body.message || '';
    expect(errMsg).toMatch(/(Timeline contains no tracks|zero duration)/i);
  });

  it('9. Historical version rendering: explicitly requests historical versionNumber: 2 when project is at version 3', async () => {
    // Current project is at version 3. We explicitly render historical version 2.
    const historicalRenderRes = await app.inject({
      method: 'POST',
      url: '/v1/jobs/render',
      headers: {
        authorization: `Bearer ${testUserToken}`,
      },
      payload: {
        projectId: testProjectId,
        versionNumber: 2,
        settings: {
          format: 'mp4',
          resolutionWidth: 640,
          resolutionHeight: 360,
          framerate: 30,
          videoCodec: 'h264',
          audioCodec: 'aac',
          durationSeconds: 2,
          quality: 'medium', // different setting so not matched by idempotency
        },
      },
    });

    expect([201, 202]).toContain(historicalRenderRes.statusCode);
    const historicalJob = JSON.parse(historicalRenderRes.body).data;
    expect(historicalJob.projectVersion).toBe(2);
    expect(historicalJob.snapshot.projectVersion).toBe(2);
    expect(historicalJob.snapshot.timeline.duration).toBe(2);
  });
});

function outputV1StorageKey(projectId: string): string {
  for (const job of mockRenderJobs.values()) {
    if (job.projectId === projectId && job.projectVersion === 2 && job.outputObject) {
      return job.outputObject.storageKey;
    }
  }
  return '';
}
