import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { WebSocket } from 'ws';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { buildApp } from '../src/app.js';
import { renderWorker } from '../src/modules/jobs/render-worker.service.js';
import { renderJobService, mockRenderJobs } from '../src/modules/jobs/render-job.service.js';
import { creditsService } from '../src/modules/credits/credits.service.js';
import { storageService } from '../src/services/storage/index.js';
import { ffmpegService } from '../src/modules/media/ffmpeg.service.js';
import { projectsService } from '../src/modules/projects/projects.service.js';
import { mockMediaAssets } from '../src/modules/media/media.service.js';
import { RealtimeEnvelope } from '../src/modules/realtime/realtime.types.js';

describe('DAY 5 COMMAND 24: Realtime Render Progress, Cancellation & Reconnect', () => {
  let app: FastifyInstance;
  let serverAddress: string;
  let wsBaseUrl: string;

  let userA: { id: string; token: string; email: string };
  let userB: { id: string; token: string; email: string };
  let projectAId: string;
  let assetAId: string;
  let tempTestDir: string;

  beforeAll(async () => {
    app = await buildApp();
    serverAddress = await app.listen({ port: 0, host: '127.0.0.1' });
    const url = new URL(serverAddress);
    wsBaseUrl = `ws://${url.host}/ws/v1/realtime`;

    tempTestDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'render_realtime_test_'));

    // 1. Create User A
    const regA = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: `realtime_user_a_${Date.now()}@techxayan.com`,
        password: 'Password123!',
        displayName: 'Realtime Lead A',
      },
    });
    const bodyA = JSON.parse(regA.body).data;
    userA = {
      id: bodyA.user.id,
      token: bodyA.tokens.accessToken,
      email: bodyA.user.email,
    };

    // 2. Create User B (unauthorized third-party)
    const regB = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: `realtime_user_b_${Date.now()}@techxayan.com`,
        password: 'Password123!',
        displayName: 'Realtime Lead B',
      },
    });
    const bodyB = JSON.parse(regB.body).data;
    userB = {
      id: bodyB.user.id,
      token: bodyB.tokens.accessToken,
      email: bodyB.user.email,
    };

    // 3. Grant credits to User A
    await creditsService.grantCredits(userA.id, 500, 'system_grant', 'Realtime test credit pool');

    // 4. Create synthetic video asset and upload to storage for User A
    const clipLocal = path.join(tempTestDir, 'clipA.mp4');
    await renderWorker.generateSyntheticClip(clipLocal, {
      duration: 3,
      width: 640,
      height: 360,
      fps: 30,
      label: 'Realtime Scene',
      audioToneHz: 440,
    });

    assetAId = `asset-rt-${Date.now()}`;
    const clipKey = `users/${userA.id}/media/video/${assetAId}.mp4`;
    const clipBuf = await fs.promises.readFile(clipLocal);
    await storageService.putObject(clipKey, clipBuf, 'video/mp4');

    mockMediaAssets.set(assetAId, {
      id: assetAId,
      userId: userA.id,
      name: 'Realtime Test Clip',
      fileKey: clipKey,
      mimeType: 'video/mp4',
      status: 'READY',
      fileSizeBytes: clipBuf.length,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any);

    // 5. Create Project for User A
    const project = await projectsService.create(userA.id, {
      title: 'Realtime Render Test Project',
    });
    projectAId = project.id;

    await projectsService.update(projectAId, userA.id, {
      timeline: {
        duration: 3,
        framerate: 30,
        tracks: [
          {
            id: 'vtrack-rt',
            type: 'video',
            name: 'Video Track',
            clips: [
              {
                id: 'clip-rt-1',
                mediaAssetId: assetAId,
                name: 'Clip',
                start: 0,
                duration: 3,
              },
            ],
          },
        ],
        markers: [],
      },
    });
  });

  afterAll(async () => {
    try {
      await fs.promises.rm(tempTestDir, { recursive: true, force: true });
    } catch {}
    await app.close();
  });

  // Helper to connect WebSocket and collect events
  function connectWebSocket(token: string, channels: string[] = []): {
    ws: WebSocket;
    events: RealtimeEnvelope[];
    waitForEvent: (eventType: string, timeoutMs?: number) => Promise<RealtimeEnvelope>;
    close: () => void;
  } {
    const channelQuery = channels.length > 0 ? `&channels=${channels.join(',')}` : '';
    const ws = new WebSocket(`${wsBaseUrl}?token=${token}${channelQuery}`);
    const events: RealtimeEnvelope[] = [];

    ws.on('message', (raw) => {
      try {
        const parsed = JSON.parse(raw.toString());
        if (parsed.eventType) {
          events.push(parsed);
        }
      } catch {}
    });

    const waitForEvent = (eventType: string, timeoutMs: number = 8000): Promise<RealtimeEnvelope> => {
      return new Promise((resolve, reject) => {
        const found = events.find((e) => e.eventType === eventType);
        if (found) return resolve(found);

        const timer = setTimeout(() => {
          clearInterval(checker);
          reject(new Error(`Timeout waiting for event '${eventType}'. Received: [${events.map((e) => e.eventType).join(', ')}]`));
        }, timeoutMs);

        const checker = setInterval(() => {
          const ev = events.find((e) => e.eventType === eventType);
          if (ev) {
            clearTimeout(timer);
            clearInterval(checker);
            resolve(ev);
          }
        }, 50);
      });
    };

    return {
      ws,
      events,
      waitForEvent,
      close: () => {
        try {
          ws.close();
        } catch {}
      },
    };
  }

  it('1. Event Contract: render:queued emitted upon render job submission with only necessary fields', async () => {
    const client = connectWebSocket(userA.token, [`project:${projectAId}`]);
    await new Promise((r) => setTimeout(r, 200));

    const res = await app.inject({
      method: 'POST',
      url: '/v1/jobs/render',
      headers: { authorization: `Bearer ${userA.token}` },
      payload: {
        projectId: projectAId,
        settings: {
          format: 'mp4',
          resolutionWidth: 640,
          resolutionHeight: 360,
          framerate: 30,
          durationSeconds: 3,
        },
      },
    });

    expect([201, 202]).toContain(res.statusCode);
    const jobData = JSON.parse(res.body).data;
    const jobId = jobData.id;

    // Verify render:queued event received by client
    const queuedEvent = await client.waitForEvent('render:queued');
    expect(queuedEvent).toBeDefined();
    expect([`project:${projectAId}`, `user:${userA.id}`]).toContain(queuedEvent.channel);
    
    // Validate strict minimal payload schema
    const payload = queuedEvent.payload;
    expect(payload.jobId).toBe(jobId);
    expect(payload.projectId).toBe(projectAId);
    expect(payload.userId).toBe(userA.id);
    expect(payload.status).toBe('queued');
    expect(payload.stage).toBe('queued');
    expect(payload.timestamp).toBeDefined();

    client.close();
  });

  it('2. Event Contract: render:started, render:stage, and truthful render:progress emitted during worker execution', async () => {
    const client = connectWebSocket(userA.token, [`project:${projectAId}`]);
    await new Promise((r) => setTimeout(r, 200));

    // Submit render job
    const res = await app.inject({
      method: 'POST',
      url: '/v1/jobs/render',
      headers: { authorization: `Bearer ${userA.token}` },
      payload: {
        projectId: projectAId,
        settings: {
          format: 'mp4',
          resolutionWidth: 640,
          resolutionHeight: 360,
          framerate: 30,
          durationSeconds: 3,
          quality: 'high', // fresh setting to avoid duplicate cache
        },
      },
    });

    const jobData = JSON.parse(res.body).data;
    const jobId = jobData.id;

    // Worker executes job
    const workerPromise = renderWorker.processRenderJob({
      id: jobId,
      type: 'render_jobs',
      data: {
        renderJobId: jobId,
        projectId: projectAId,
      },
    } as any);

    // Wait for render:started event
    const startedEvent = await client.waitForEvent('render:started');
    expect(startedEvent.payload.jobId).toBe(jobId);
    expect(startedEvent.payload.status).toBe('running');

    // Wait for render:stage event (e.g. resolving_assets or preparing_plan)
    const stageEvent = await client.waitForEvent('render:stage');
    expect(stageEvent.payload.jobId).toBe(jobId);
    expect(stageEvent.payload.stage).toBeDefined();
    // Verify no fabricated progress percentage during stage event
    expect(stageEvent.payload.progress).toBeUndefined();

    // Wait for render:progress event during actual rendering
    const progressEvent = await client.waitForEvent('render:progress');
    expect(progressEvent.payload.jobId).toBe(jobId);
    expect(progressEvent.payload.status).toBe('running');
    expect(progressEvent.payload.stage).toBe('rendering');
    expect(typeof progressEvent.payload.progress).toBe('number');
    expect(progressEvent.payload.progress).toBeGreaterThanOrEqual(1);

    // Wait for completion
    await workerPromise;
    const completedEvent = await client.waitForEvent('render:completed');
    expect(completedEvent.payload.jobId).toBe(jobId);
    expect(completedEvent.payload.status).toBe('completed');
    expect(completedEvent.payload.progress).toBe(100);

    client.close();
  });

  it('3. Reconnect & Persistence: Worker continues when client disconnects; database state is authoritative', async () => {
    // 1. Submit render job
    const res = await app.inject({
      method: 'POST',
      url: '/v1/jobs/render',
      headers: { authorization: `Bearer ${userA.token}` },
      payload: {
        projectId: projectAId,
        settings: {
          format: 'mp4',
          resolutionWidth: 640,
          resolutionHeight: 360,
          framerate: 30,
          durationSeconds: 3,
          crf: 22,
        },
      },
    });

    const jobData = JSON.parse(res.body).data;
    const jobId = jobData.id;

    // 2. Connect client and quickly disconnect
    const client = connectWebSocket(userA.token, [`job:${jobId}`]);
    await new Promise((r) => setTimeout(r, 200));
    client.close(); // Client disconnected!

    // 3. Worker executes job in the background uninterrupted
    await renderWorker.processRenderJob({
      id: jobId,
      type: 'render_jobs',
      data: {
        renderJobId: jobId,
        projectId: projectAId,
      },
    } as any);

    // 4. Reconnect via REST API to fetch authoritative state from database
    const pollRes = await app.inject({
      method: 'GET',
      url: `/v1/jobs/render/${jobId}`,
      headers: { authorization: `Bearer ${userA.token}` },
    });

    expect(pollRes.statusCode).toBe(200);
    const authoritativeJob = JSON.parse(pollRes.body).data;
    expect(authoritativeJob.id).toBe(jobId);
    expect(authoritativeJob.status).toBe('completed');
    expect(authoritativeJob.progress).toBe(100);
    expect(authoritativeJob.outputObject).toBeDefined();
    expect(authoritativeJob.outputObject.storageKey).toBeDefined();
  });

  it('4. Cancellation: Cancel queued job transitions queued -> cancelled and refunds credits', async () => {
    const client = connectWebSocket(userA.token, [`user:${userA.id}`]);
    await new Promise((r) => setTimeout(r, 200));

    const creditsBefore = await creditsService.getBalance(userA.id);

    // Submit job
    const res = await app.inject({
      method: 'POST',
      url: '/v1/jobs/render',
      headers: { authorization: `Bearer ${userA.token}` },
      payload: {
        projectId: projectAId,
        settings: {
          format: 'mp4',
          resolutionWidth: 640,
          resolutionHeight: 360,
          framerate: 30,
          durationSeconds: 3,
          crf: 20,
        },
      },
    });

    const jobData = JSON.parse(res.body).data;
    const jobId = jobData.id;

    // Cancel while queued via POST /api/v1/jobs/render/:id/cancel
    const cancelRes = await app.inject({
      method: 'POST',
      url: `/api/v1/jobs/render/${jobId}/cancel`,
      headers: { authorization: `Bearer ${userA.token}` },
    });

    expect(cancelRes.statusCode).toBe(200);
    const cancelledJob = JSON.parse(cancelRes.body).data;
    expect(cancelledJob.status).toBe('cancelled');
    expect(cancelledJob.stage).toBe('cancelled');

    // Verify render:cancelled event received
    const cancelledEvent = await client.waitForEvent('render:cancelled');
    expect(cancelledEvent.payload.jobId).toBe(jobId);
    expect(cancelledEvent.payload.status).toBe('cancelled');

    // Verify credit refund
    const creditsAfter = await creditsService.getBalance(userA.id);
    expect(creditsAfter).toBe(creditsBefore);

    // Verify authoritative DB status
    const dbJob = await renderJobService.getRenderJob(jobId, userA.id);
    expect(dbJob.status).toBe('cancelled');

    client.close();
  });

  it('5. Cancellation: Cancel running job transitions running -> cancelling -> terminate process -> cancelled', async () => {
    const client = connectWebSocket(userA.token, [`project:${projectAId}`, `user:${userA.id}`]);
    await new Promise((r) => setTimeout(r, 200));

    // Submit job
    const res = await app.inject({
      method: 'POST',
      url: '/v1/jobs/render',
      headers: { authorization: `Bearer ${userA.token}` },
      payload: {
        projectId: projectAId,
        settings: {
          format: 'mp4',
          resolutionWidth: 640,
          resolutionHeight: 360,
          framerate: 30,
          durationSeconds: 3,
          crf: 19,
        },
      },
    });

    const jobData = JSON.parse(res.body).data;
    const jobId = jobData.id;

    // Start worker in background
    const workerPromise = renderWorker.processRenderJob({
      id: jobId,
      type: 'render_jobs',
      data: {
        renderJobId: jobId,
        projectId: projectAId,
      },
    } as any).catch((err) => {
      // Expected to reject when cancelled
      return { cancelled: true, message: err.message };
    });

    // Wait until started
    await client.waitForEvent('render:started');

    // Cancel while running
    const cancelRes = await app.inject({
      method: 'POST',
      url: `/v1/jobs/render/${jobId}/cancel`,
      headers: { authorization: `Bearer ${userA.token}` },
    });

    expect(cancelRes.statusCode).toBe(200);
    const cancelBody = JSON.parse(cancelRes.body).data;
    expect(['cancelling', 'cancelled']).toContain(cancelBody.status);

    // Client receives render:cancelling and/or render:cancelled
    const cancelledEvent = await client.waitForEvent('render:cancelled');
    expect(cancelledEvent.payload.jobId).toBe(jobId);
    expect(cancelledEvent.payload.status).toBe('cancelled');

    await workerPromise;

    // Authoritative state must be cancelled, NEVER completed
    const finalJob = await renderJobService.getRenderJob(jobId, userA.id);
    expect(finalJob.status).toBe('cancelled');
    expect(finalJob.outputObject).toBeNull();

    client.close();
  });

  it('6. Failure handling: Emits render:failed with safe error code and refunds credits', async () => {
    const client = connectWebSocket(userA.token, [`user:${userA.id}`]);
    await new Promise((r) => setTimeout(r, 200));

    // Deduct reservation credits for the job
    await creditsService.deductCredits(userA.id, 10, 'job_reservation', 'Fake job reservation');
    const creditsBefore = await creditsService.getBalance(userA.id);

    // Create a job pointing to a non-existent project to trigger worker failure
    const fakeJobId = `job-fail-${Date.now()}`;
    const fakeJob: any = {
      id: fakeJobId,
      userId: userA.id,
      projectId: 'proj-non-existent-999',
      status: 'queued',
      stage: 'queued',
      progress: 0,
      settings: {
        format: 'mp4',
        resolutionWidth: 640,
        resolutionHeight: 360,
        framerate: 30,
      },
      creditCost: 10,
      creditReservationId: 'res-fail-1',
      attempts: 0,
      maxAttempts: 3,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    mockRenderJobs.set(fakeJobId, fakeJob);

    // Worker fails because project does not exist
    try {
      await renderWorker.processRenderJob({
        id: fakeJobId,
        type: 'render_jobs',
        data: {
          renderJobId: fakeJobId,
          projectId: 'proj-non-existent-999',
        },
      } as any);
    } catch {}

    const failedEvent = await client.waitForEvent('render:failed');
    expect(failedEvent.payload.jobId).toBe(fakeJobId);
    expect(failedEvent.payload.status).toBe('failed');
    expect(failedEvent.payload.errorCode).toBeDefined();
    expect(failedEvent.payload.errorMessage).toBeDefined();

    // Verify credits refunded (balance restored by 10)
    const creditsAfter = await creditsService.getBalance(userA.id);
    expect(creditsAfter).toBe(creditsBefore + 10);

    client.close();
  });

  it('7. Retry flow: Failed job can be retried, re-reserves credits and emits render:queued', async () => {
    const client = connectWebSocket(userA.token, [`user:${userA.id}`]);
    await new Promise((r) => setTimeout(r, 200));

    // Submit and cancel a job to get a retryable cancelled job
    const res = await app.inject({
      method: 'POST',
      url: '/v1/jobs/render',
      headers: { authorization: `Bearer ${userA.token}` },
      payload: {
        projectId: projectAId,
        settings: {
          format: 'mp4',
          resolutionWidth: 640,
          resolutionHeight: 360,
          framerate: 30,
          durationSeconds: 3,
          crf: 18,
        },
      },
    });

    const jobData = JSON.parse(res.body).data;
    const jobId = jobData.id;

    // Cancel it first
    await app.inject({
      method: 'POST',
      url: `/v1/jobs/render/${jobId}/cancel`,
      headers: { authorization: `Bearer ${userA.token}` },
    });

    // Now call retry: POST /api/v1/jobs/render/:id/retry
    const retryRes = await app.inject({
      method: 'POST',
      url: `/api/v1/jobs/render/${jobId}/retry`,
      headers: { authorization: `Bearer ${userA.token}` },
    });

    expect(retryRes.statusCode).toBe(200);
    const retriedJob = JSON.parse(retryRes.body).data;
    expect(retriedJob.status).toBe('queued');
    expect(retriedJob.attempts).toBe(1);

    // Receives render:queued
    const queuedEvent = await client.waitForEvent('render:queued');
    expect(queuedEvent.payload.jobId).toBe(jobId);
    expect(queuedEvent.payload.status).toBe('queued');

    client.close();
  });

  it('8. Authorization: User B cannot subscribe to User A job channel and receives subscription_error', async () => {
    // User A creates a job
    const res = await app.inject({
      method: 'POST',
      url: '/v1/jobs/render',
      headers: { authorization: `Bearer ${userA.token}` },
      payload: {
        projectId: projectAId,
        settings: {
          format: 'mp4',
          resolutionWidth: 640,
          resolutionHeight: 360,
          framerate: 30,
          durationSeconds: 3,
          crf: 17,
        },
      },
    });

    const jobData = JSON.parse(res.body).data;
    const jobAId = jobData.id;

    // User B attempts to subscribe to User A's job channel
    const wsB = new WebSocket(`${wsBaseUrl}?token=${userB.token}`);
    let receivedSubscriptionError = false;
    const userBEvents: any[] = [];

    await new Promise<void>((resolve) => {
      wsB.on('open', () => {
        wsB.send(JSON.stringify({ action: 'subscribe', channels: [`job:${jobAId}`] }));
      });

      wsB.on('message', (raw) => {
        try {
          const parsed = JSON.parse(raw.toString());
          if (parsed.action === 'subscription_error') {
            receivedSubscriptionError = true;
            resolve();
          }
          if (parsed.eventType) {
            userBEvents.push(parsed);
          }
        } catch {}
      });

      setTimeout(resolve, 1500);
    });

    expect(receivedSubscriptionError).toBe(true);

    // User A worker emits progress
    mockRenderJobs.get(jobAId)!.status = 'running';
    mockRenderJobs.get(jobAId)!.stage = 'rendering';
    renderJobService['realtimeService']?.notifyRenderProgress(mockRenderJobs.get(jobAId)!, 50, 'rendering');

    await new Promise((r) => setTimeout(r, 200));

    // User B should NOT have received User A's render:progress event
    const leakEvent = userBEvents.find((e) => e.payload?.jobId === jobAId);
    expect(leakEvent).toBeUndefined();

    wsB.close();
  });
});
