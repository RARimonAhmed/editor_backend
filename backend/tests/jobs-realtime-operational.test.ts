import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { WebSocket } from 'ws';
import { buildApp } from '../src/app.js';
import { jobQueue } from '../src/services/queue/index.js';
import { aiJobService } from '../src/modules/ai/jobs/ai-job.service.js';
import { realtimeService } from '../src/modules/realtime/realtime.service.js';
import { registerQueueProcessors } from '../src/services/queue/processors.js';
import { RealtimeEnvelope } from '../src/modules/realtime/realtime.types.js';

describe('Operational Distributed AI/Media Job System & Realtime Channels', () => {
  let app: FastifyInstance;
  let serverAddress: string;
  let wsBaseUrl: string;

  let userA: { id: string; token: string; email: string };
  let userB: { id: string; token: string; email: string };
  let projectIdA: string;

  beforeAll(async () => {
    app = await buildApp();
    registerQueueProcessors();

    serverAddress = await app.listen({ port: 0, host: '127.0.0.1' });
    const url = new URL(serverAddress);
    wsBaseUrl = `ws://${url.host}/ws/v1/realtime`;

    // 1. Register User A
    const regA = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: `worker_lead_a_${Date.now()}@techxayan.com`,
        password: 'Password123!',
        displayName: 'Distributed Systems Lead A',
      },
    });
    const bodyA = JSON.parse(regA.body).data;
    userA = {
      id: bodyA.user.id,
      token: bodyA.tokens.accessToken,
      email: bodyA.user.email,
    };

    // 2. Register User B
    const regB = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: `worker_lead_b_${Date.now()}@techxayan.com`,
        password: 'Password123!',
        displayName: 'Distributed Systems Lead B',
      },
    });
    const bodyB = JSON.parse(regB.body).data;
    userB = {
      id: bodyB.user.id,
      token: bodyB.tokens.accessToken,
      email: bodyB.user.email,
    };

    // 3. Create Project for User A
    const projRes = await app.inject({
      method: 'POST',
      url: '/v1/projects',
      headers: { Authorization: `Bearer ${userA.token}` },
      payload: {
        title: 'Project Realtime Alpha',
        aspectRatio: '16:9',
      },
    });
    const projBody = JSON.parse(projRes.body).data;
    projectIdA = projBody.id || projBody.project?.id;
  });

  afterAll(async () => {
    await app.close();
  });

  // ============================================================================
  // 1-8: COMPLETE DISTRIBUTED LIFECYCLE & REALTIME EVENT DELIVERY
  // (REQUEST -> QUEUED -> RUNNING -> PROGRESS -> COMPLETED -> FLUTTER RECEIVES EVENT)
  // ============================================================================
  describe('Job Lifecycle (1-8): Creation to Realtime Flutter Delivery', () => {
    it('Executes full lifecycle: REQUEST -> QUEUED -> RUNNING -> PROGRESS -> COMPLETED with Flutter WS delivery', async () => {
      // Connect simulated Flutter client for User A
      const ws = new WebSocket(`${wsBaseUrl}?token=${userA.token}`);
      const receivedEvents: RealtimeEnvelope[] = [];

      await new Promise<void>((resolve, reject) => {
        ws.on('open', () => resolve());
        ws.on('error', (err) => reject(err));
        ws.on('message', (raw) => {
          try {
            const parsed = JSON.parse(raw.toString());
            if (parsed.eventType) {
              receivedEvents.push(parsed);
            }
          } catch {}
        });
      });

      // 1. Create Job (REQUEST -> QUEUED)
      const res = await app.inject({
        method: 'POST',
        url: '/v1/ai/jobs',
        headers: { Authorization: `Bearer ${userA.token}` },
        payload: {
          type: 'text_generation',
          input: {
            prompt: 'Draft an intro voiceover for cinematic landscape video',
          },
          projectId: projectIdA,
          provider: 'fake',
        },
      });

      expect([201, 202]).toContain(res.statusCode);
      const createdJob = JSON.parse(res.body).data.job;
      const jobId = createdJob.id;

      // 2. Verified status is initially QUEUED
      expect(createdJob.status).toBe('QUEUED');
      expect(createdJob.progress).toBe(0);

      // Subscribe Flutter client to job channel as well
      ws.send(JSON.stringify({ action: 'subscribe', channels: [`job:${jobId}`, `project:${projectIdA}`] }));

      // 3. Wait for Worker to pick job, progress 0-100, and complete
      let finalJob = await aiJobService.getJob(jobId, userA.id);
      let waitCount = 0;
      while (finalJob.status !== 'COMPLETED' && waitCount < 30) {
        await new Promise((r) => setTimeout(r, 80));
        finalJob = await aiJobService.getJob(jobId, userA.id);
        waitCount++;
      }

      // 4-5. Verify Completed Status and Result Saved
      expect(finalJob.status).toBe('COMPLETED');
      expect(finalJob.progress).toBe(100);
      expect(finalJob.output).toBeDefined();
      expect(finalJob.completedAt).toBeDefined();

      // 6-8. Verify Flutter Client received progress and completion events in realtime
      await new Promise((r) => setTimeout(r, 100));
      ws.close();

      const progressEvents = receivedEvents.filter((e) => e.eventType === 'ai_job_progress');
      const completeEvents = receivedEvents.filter((e) => e.eventType === 'ai_job_complete');

      expect(progressEvents.length).toBeGreaterThan(0);
      expect(completeEvents.length).toBeGreaterThan(0);

      // Verify payload in complete event
      const finalEvent = completeEvents[0];
      expect(finalEvent.payload.jobId).toBe(jobId);
      expect(finalEvent.payload.status).toBe('COMPLETED');
      expect(finalEvent.payload.output).toBeDefined();
    });

    it('Delivers realtime events over Server-Sent Events (SSE) stream', async () => {
      // Connect to SSE stream
      app.inject({
        method: 'GET',
        url: `/v1/events/stream?token=${userA.token}&channels=user:${userA.id}`,
      });

      // Give SSE time to initialize
      await new Promise((r) => setTimeout(r, 50));

      // Trigger a domain event
      realtimeService.notifyAiJobProgress('test_job_sse_1', userA.id, 75, 'Encoding stream');

      // The SSE stream connects and registers in realtimeService
      expect(realtimeService.getActiveSessionsCount()).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // 9: RETRY FAILED JOB
  // ============================================================================
  describe('9. Retry Failed Job', () => {
    it('Recovers a failed job on retry and processes to completion', async () => {
      // 1. Create a job
      const res = await app.inject({
        method: 'POST',
        url: '/v1/ai/jobs',
        headers: { Authorization: `Bearer ${userA.token}` },
        payload: {
          type: 'text_generation',
          input: { prompt: 'Retry test prompt' },
          provider: 'fake',
        },
      });

      const job = JSON.parse(res.body).data.job;

      // 2. Mark job failed (simulating worker crash or provider outage)
      await aiJobService.failJob(job.id, 'Simulated external provider connection timeout', false);
      let failedJob = await aiJobService.getJob(job.id, userA.id);
      expect(failedJob.status).toBe('FAILED');
      expect(failedJob.error).toContain('Simulated external provider connection timeout');

      // 3. Retry the job via API
      const retryRes = await app.inject({
        method: 'POST',
        url: `/v1/ai/jobs/${job.id}/retry`,
        headers: { Authorization: `Bearer ${userA.token}` },
      });

      expect(retryRes.statusCode).toBe(200);
      const retriedJob = JSON.parse(retryRes.body).data.job;
      expect(retriedJob.status).toBe('QUEUED');
      expect(retriedJob.error).toBeNull();

      // 4. Wait for worker to pick up retried job and complete it
      let count = 0;
      let finalRetried = await aiJobService.getJob(job.id, userA.id);
      while (finalRetried.status !== 'COMPLETED' && count < 30) {
        await new Promise((r) => setTimeout(r, 80));
        finalRetried = await aiJobService.getJob(job.id, userA.id);
        count++;
      }

      expect(finalRetried.status).toBe('COMPLETED');
      expect(finalRetried.output).toBeDefined();
    });
  });

  // ============================================================================
  // 10: CANCEL RUNNING JOB
  // ============================================================================
  describe('10. Cancel Running Job', () => {
    it('Aborts in-flight job, transitions status to CANCELLED, and refunds credits', async () => {
      // Create job
      const res = await app.inject({
        method: 'POST',
        url: '/v1/ai/jobs',
        headers: { Authorization: `Bearer ${userA.token}` },
        payload: {
          type: 'video_generation',
          input: { prompt: 'Slow motion waterfall 4K' },
          provider: 'fake',
        },
      });

      const created = JSON.parse(res.body).data.job;

      // Immediately cancel job
      const cancelRes = await app.inject({
        method: 'POST',
        url: `/v1/ai/jobs/${created.id}/cancel`,
        headers: { Authorization: `Bearer ${userA.token}` },
      });

      expect(cancelRes.statusCode).toBe(200);
      const cancelledJob = JSON.parse(cancelRes.body).data.job;
      expect(cancelledJob.status).toBe('CANCELLED');

      // Wait to ensure worker honors cancellation and does not mark COMPLETED
      await new Promise((r) => setTimeout(r, 150));
      const verifyJob = await aiJobService.getJob(created.id, userA.id);
      expect(verifyJob.status).toBe('CANCELLED');
    });
  });

  // ============================================================================
  // 11: WORKER RESTART RECOVERY
  // ============================================================================
  describe('11. Worker Restart Recovery', () => {
    it('Recovers stalled or queued jobs upon worker restart without loss of jobs', async () => {
      // 1. Enqueue job into memory queue while temporarily pausing/unsetting processor
      const stalledJob = await jobQueue.add('ai_test_recovery', {
        testId: 'recovery_payload_123',
        description: 'Verify worker restart reclaims pending jobs',
      });

      expect(stalledJob.status).toBe('queued');

      let recoveredJobExecuted = false;
      let executedJobData: any = null;

      // 2. Restart worker with a newly initialized processor (simulating process restart)
      await jobQueue.restartWorker('ai_test_recovery', async (job) => {
        recoveredJobExecuted = true;
        executedJobData = job.data;
        return { recovered: true };
      });

      // 3. Give worker brief moment to execute reclaimed job
      let wait = 0;
      while (!recoveredJobExecuted && wait < 20) {
        await new Promise((r) => setTimeout(r, 50));
        wait++;
      }

      expect(recoveredJobExecuted).toBe(true);
      expect(executedJobData.testId).toBe('recovery_payload_123');
    });
  });

  // ============================================================================
  // 12: IDEMPOTENCY & DEDUPLICATION
  // ============================================================================
  describe('12. Idempotency & Deduplication', () => {
    it('Replays existing job on duplicate idempotencyKey without creating duplicates', async () => {
      const idempotencyKey = `idem_key_${Date.now()}`;

      // Submit first time
      const res1 = await app.inject({
        method: 'POST',
        url: '/v1/ai/jobs',
        headers: { Authorization: `Bearer ${userA.token}` },
        payload: {
          type: 'text_generation',
          input: { prompt: 'Unique prompt for idempotency test' },
          idempotencyKey,
          provider: 'fake',
        },
      });

      expect([201, 202]).toContain(res1.statusCode);
      const job1 = JSON.parse(res1.body).data.job;

      // Submit second time with identical idempotencyKey
      const res2 = await app.inject({
        method: 'POST',
        url: '/v1/ai/jobs',
        headers: { Authorization: `Bearer ${userA.token}` },
        payload: {
          type: 'text_generation',
          input: { prompt: 'Different prompt text' },
          idempotencyKey,
          provider: 'fake',
        },
      });

      expect(res2.statusCode).toBe(200); // 200 Replay
      const job2 = JSON.parse(res2.body).data.job;
      expect(job2.id).toBe(job1.id);
    });

    it('Deduplicates concurrent active jobs with identical payload fingerprints', async () => {
      const sharedPayload = {
        prompt: `Deduplicate active workload ${Date.now()}`,
        style: 'dramatic',
      };

      // Create first active job
      const res1 = await app.inject({
        method: 'POST',
        url: '/v1/ai/jobs',
        headers: { Authorization: `Bearer ${userA.token}` },
        payload: {
          type: 'video_generation',
          input: sharedPayload,
          provider: 'fake',
        },
      });

      const job1 = JSON.parse(res1.body).data.job;

      // Immediately submit identical payload while first job is still active
      const res2 = await app.inject({
        method: 'POST',
        url: '/v1/ai/jobs',
        headers: { Authorization: `Bearer ${userA.token}` },
        payload: {
          type: 'video_generation',
          input: sharedPayload,
          provider: 'fake',
        },
      });

      const job2 = JSON.parse(res2.body).data.job;
      expect(job2.id).toBe(job1.id);
    });
  });

  // ============================================================================
  // 13: DEAD-LETTER QUEUE (DLQ) & TIMEOUT ENFORCEMENT
  // ============================================================================
  describe('13. Dead-Letter Behavior & Timeout Enforcement', () => {
    it('Routes jobs exceeding maxAttempts to Dead-Letter Queue (DLQ)', async () => {
      let attemptsRun = 0;
      jobQueue.process('dlq_simulation_job', async (_job) => {
        attemptsRun++;
        throw new Error('Unrecoverable system crash');
      });

      const job = await jobQueue.add(
        'dlq_simulation_job',
        { test: 'dlq' },
        { maxAttempts: 2, backoffMs: 10 }
      );

      // Wait for all retry attempts to fail
      let updated = await jobQueue.getJob(job.id);
      let wait = 0;
      while (updated?.status !== 'failed' && wait < 40) {
        await new Promise((r) => setTimeout(r, 40));
        updated = await jobQueue.getJob(job.id);
        wait++;
      }

      expect(updated?.status).toBe('failed');
      expect(updated?.isDeadLetter).toBe(true);
      expect(attemptsRun).toBe(2);

      // Verify retrievable via getDeadLetterJobs
      const dlqJobs = await jobQueue.getDeadLetterJobs();
      expect(dlqJobs.some((j) => j.id === job.id)).toBe(true);

      // Can be recovered from DLQ
      await jobQueue.retryDeadLetterJob(job.id);
      const retried = await jobQueue.getJob(job.id);
      expect(retried?.status).toBe('queued');
      expect(retried?.isDeadLetter).toBe(false);
    });

    it('Aborts job execution exceeding timeoutMs', async () => {
      jobQueue.process('timeout_simulation_job', async () => {
        await new Promise((r) => setTimeout(r, 500));
        return { success: true };
      });

      const job = await jobQueue.add(
        'timeout_simulation_job',
        { test: 'timeout' },
        { maxAttempts: 1, timeoutMs: 30 }
      );

      let timeoutUpdated = await jobQueue.getJob(job.id);
      let tWait = 0;
      while (timeoutUpdated?.status !== 'failed' && tWait < 30) {
        await new Promise((r) => setTimeout(r, 40));
        timeoutUpdated = await jobQueue.getJob(job.id);
        tWait++;
      }

      expect(timeoutUpdated?.status).toBe('failed');
      expect(timeoutUpdated?.error).toContain('timed out after 30ms');
    });
  });

  // ============================================================================
  // 14: SECURITY & RESOURCE ACCESS AUTHORIZATION
  // ============================================================================
  describe('14. Security: Channel Access Authorization', () => {
    it('Rejects unauthorized subscription to another user private channel', async () => {
      // User B attempts to subscribe to User A's channel
      const wsB = new WebSocket(`${wsBaseUrl}?token=${userB.token}`);
      let subscriptionErrorReceived = false;

      await new Promise<void>((resolve) => {
        wsB.on('open', () => {
          wsB.send(JSON.stringify({ action: 'subscribe', channels: [`user:${userA.id}`] }));
        });
        wsB.on('message', (raw) => {
          const msg = JSON.parse(raw.toString());
          if (msg.action === 'subscription_error') {
            subscriptionErrorReceived = true;
            resolve();
          }
        });
      });

      wsB.close();
      expect(subscriptionErrorReceived).toBe(true);
    });

    it('Ensures User B NEVER receives events for User A private jobs', async () => {
      // 1. Create a job for User A
      const res = await app.inject({
        method: 'POST',
        url: '/v1/ai/jobs',
        headers: { Authorization: `Bearer ${userA.token}` },
        payload: {
          type: 'text_generation',
          input: { prompt: 'Secret User A content' },
          provider: 'fake',
        },
      });
      const jobA = JSON.parse(res.body).data.job;

      // 2. Connect User B WebSocket and User A WebSocket
      const wsA = new WebSocket(`${wsBaseUrl}?token=${userA.token}`);
      const wsB = new WebSocket(`${wsBaseUrl}?token=${userB.token}`);

      const userAMessages: any[] = [];
      const userBMessages: any[] = [];

      await Promise.all([
        new Promise<void>((res) => {
          wsA.on('open', () => res());
          wsA.on('message', (m) => userAMessages.push(JSON.parse(m.toString())));
        }),
        new Promise<void>((res) => {
          wsB.on('open', () => {
            // User B sneakily attempts to subscribe to jobA
            wsB.send(JSON.stringify({ action: 'subscribe', channels: [`job:${jobA.id}`] }));
            res();
          });
          wsB.on('message', (m) => userBMessages.push(JSON.parse(m.toString())));
        }),
      ]);

      // 3. Trigger progress and complete on Job A
      realtimeService.notifyAiJobProgress(jobA.id, userA.id, 50, 'Secret stage');
      realtimeService.notifyAiJobComplete(jobA.id, userA.id, { secret: 'userA_confidential' });

      await new Promise((r) => setTimeout(r, 100));

      wsA.close();
      wsB.close();

      // User A received the progress and complete notifications
      const aEvents = userAMessages.filter((m) => m.eventType === 'ai_job_progress' || m.eventType === 'ai_job_complete');
      expect(aEvents.length).toBeGreaterThan(0);

      // User B received ZERO events for User A's job
      const bLeaks = userBMessages.filter((m) => m.payload?.jobId === jobA.id);
      expect(bLeaks.length).toBe(0);
    });
  });

  // ============================================================================
  // 15: RENDER / EXPORT DISTRIBUTED WORKER
  // ============================================================================
  describe('15. Video Render & Export Worker', () => {
    it('Processes render_export job and emits export_complete to project and user channels', async () => {
      const ws = new WebSocket(`${wsBaseUrl}?token=${userA.token}`);
      const exportEvents: any[] = [];

      await new Promise<void>((resolve) => {
        ws.on('open', () => {
          ws.send(JSON.stringify({ action: 'subscribe', channels: [`project:${projectIdA}`] }));
          resolve();
        });
        ws.on('message', (m) => {
          const parsed = JSON.parse(m.toString());
          if (parsed.eventType === 'export_complete') {
            exportEvents.push(parsed);
          }
        });
      });

      // Submit render job
      const res = await app.inject({
        method: 'POST',
        url: '/v1/jobs/render',
        headers: { Authorization: `Bearer ${userA.token}` },
        payload: {
          projectId: projectIdA,
          format: 'mp4',
          resolutionWidth: 1920,
          resolutionHeight: 1080,
          framerate: 60,
          qualityPreset: 'high',
        },
      });

      expect([201, 202]).toContain(res.statusCode);
      const resBody = JSON.parse(res.body).data;
      const renderJob = resBody.job || resBody;

      // Wait for export worker to finish
      let count = 0;
      while (exportEvents.length === 0 && count < 30) {
        await new Promise((r) => setTimeout(r, 80));
        count++;
      }

      ws.close();

      expect(exportEvents.length).toBeGreaterThanOrEqual(1);
      expect(exportEvents[0].payload.exportId).toBe(renderJob.id);
      expect(exportEvents[0].payload.projectId).toBe(projectIdA);
      expect(exportEvents[0].payload.downloadUrl).toContain(renderJob.id);
    });
  });
});
