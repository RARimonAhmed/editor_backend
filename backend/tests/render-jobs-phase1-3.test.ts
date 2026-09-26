import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { db } from '../src/database/client.js';
import { creditsService } from '../src/modules/credits/credits.service.js';
import { renderJobService, mockRenderJobs } from '../src/modules/jobs/render-job.service.js';
import { isValidStatusTransition } from '../src/modules/jobs/render-job.types.js';
import { jobQueue } from '../src/services/queue/index.js';

describe('Render Job Pipeline (Phases 1 - 3): Database, Service & Controller Contracts', () => {
  let app: FastifyInstance;

  let userA: { id: string; token: string; email: string };
  let userB: { id: string; token: string; email: string };
  let adminUser: { id: string; token: string; email: string };

  let projectAId: string;
  let createdJobId: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    // 1. Register User A
    const regResA = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: `render_lead_a_${Date.now()}@techxayan.com`,
        password: 'Password123!',
        displayName: 'Render Lead User A',
      },
    });
    const bodyA = JSON.parse(regResA.body).data;
    userA = {
      id: bodyA.user.id,
      token: bodyA.tokens.accessToken,
      email: bodyA.user.email,
    };

    // 2. Register User B
    const regResB = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: `render_lead_b_${Date.now()}@techxayan.com`,
        password: 'Password123!',
        displayName: 'Render Lead User B',
      },
    });
    const bodyB = JSON.parse(regResB.body).data;
    userB = {
      id: bodyB.user.id,
      token: bodyB.tokens.accessToken,
      email: bodyB.user.email,
    };

    // 3. Register Admin User
    const regAdmin = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: `render_admin_${Date.now()}@techxayan.com`,
        password: 'Password123!',
        displayName: 'Render Admin User',
      },
    });
    const bodyAdmin = JSON.parse(regAdmin.body).data;
    adminUser = {
      id: bodyAdmin.user.id,
      token: bodyAdmin.tokens.accessToken,
      email: bodyAdmin.user.email,
    };

    // Set admin role in token or test context if needed
    // 4. Create Project for User A
    const projRes = await app.inject({
      method: 'POST',
      url: '/v1/projects',
      headers: { Authorization: `Bearer ${userA.token}` },
      payload: {
        title: 'Project Render Alpha 4K',
        aspectRatio: '16:9',
      },
    });
    const projBody = JSON.parse(projRes.body).data;
    projectAId = projBody.id || projBody.project?.id;
  });

  afterAll(async () => {
    await app.close();
  });

  // ============================================================================
  // 1. CREATE RENDER JOB
  // ============================================================================
  it('1. POST /api/v1/jobs/render successfully creates and persists a render job', async () => {
    const initialBalance = await creditsService.getBalance(userA.id);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/jobs/render',
      headers: { Authorization: `Bearer ${userA.token}` },
      payload: {
        projectId: projectAId,
        settings: {
          format: 'mp4',
          resolutionWidth: 1920,
          resolutionHeight: 1080,
          framerate: 30,
          videoCodec: 'h264',
          audioCodec: 'aac',
        },
      },
    });

    expect(res.statusCode).toBe(202);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.data.id).toBeDefined();
    expect(body.data.projectId).toBe(projectAId);
    expect(body.data.userId).toBe(userA.id);
    expect(body.data.status).toBe('queued');
    expect(body.data.progress).toBe(0);
    expect(body.data.stage).toBe('queued');
    expect(body.data.creditCost).toBeGreaterThan(0);
    expect(body.data.creditReservationId).toBeDefined();

    createdJobId = body.data.id;
  });

  // ============================================================================
  // 2. PROJECT OWNERSHIP REJECTION
  // ============================================================================
  it("2. Rejects render job creation when user does not own or have access to project", async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/jobs/render',
      headers: { Authorization: `Bearer ${userB.token}` },
      payload: {
        projectId: projectAId, // User B trying to render User A's project
        settings: {
          format: 'mp4',
          resolutionWidth: 1920,
          resolutionHeight: 1080,
          framerate: 30,
        },
      },
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
  });

  // ============================================================================
  // 3. INVALID SETTINGS REJECTION
  // ============================================================================
  it('3. Rejects invalid render settings (incompatible container/codec, invalid bounds)', async () => {
    // WebM with ProRes is invalid
    const invalidCodecRes = await app.inject({
      method: 'POST',
      url: '/api/v1/jobs/render',
      headers: { Authorization: `Bearer ${userA.token}` },
      payload: {
        projectId: projectAId,
        settings: {
          format: 'webm',
          videoCodec: 'prores', // Invalid combination
        },
      },
    });
    expect(invalidCodecRes.statusCode).toBe(400);

    // Negative resolution
    const invalidResRes = await app.inject({
      method: 'POST',
      url: '/api/v1/jobs/render',
      headers: { Authorization: `Bearer ${userA.token}` },
      payload: {
        projectId: projectAId,
        settings: {
          format: 'mp4',
          resolutionWidth: -1920,
        },
      },
    });
    expect(invalidResRes.statusCode).toBe(400);
  });

  // ============================================================================
  // 4. SUCCESSFUL CREDIT RESERVATION
  // ============================================================================
  it('4. Confirms credits are reserved correctly based on render settings', async () => {
    const balanceBefore = await creditsService.getBalance(userA.id);

    // 4K 60fps render job costs more credits
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/jobs/render',
      headers: { Authorization: `Bearer ${userA.token}` },
      payload: {
        projectId: projectAId,
        settings: {
          format: 'mp4',
          resolutionWidth: 3840,
          resolutionHeight: 2160,
          framerate: 60,
          videoCodec: 'h264',
          audioCodec: 'aac',
        },
      },
    });

    expect(res.statusCode).toBe(202);
    const job = JSON.parse(res.body).data;
    expect(job.creditCost).toBe(25); // 10 base + 10 (4k) + 5 (60fps)

    const balanceAfter = await creditsService.getBalance(userA.id);
    expect(balanceBefore - balanceAfter).toBe(25);
  });

  // ============================================================================
  // 5. DB PERSISTENCE
  // ============================================================================
  it('5. Confirms render job is persisted with all mandatory schema fields', async () => {
    const job = await renderJobService.getRenderJob(createdJobId, userA.id);
    expect(job).toBeDefined();
    expect(job.id).toBe(createdJobId);
    expect(job.projectId).toBe(projectAId);
    expect(job.userId).toBe(userA.id);
    expect(job.status).toBe('queued');
    expect(job.stage).toBe('queued');
    expect(job.progress).toBe(0);
    expect(job.attempts).toBe(0);
    expect(job.maxAttempts).toBe(3);
    expect(job.creditReservationId).toBeDefined();
    expect(job.createdAt).toBeDefined();
    expect(job.updatedAt).toBeDefined();
  });

  // ============================================================================
  // 6. QUEUE SUBMISSION
  // ============================================================================
  it('6. Confirms render job was dispatched to queue with immutable identifiers only', async () => {
    const queuedJob = await jobQueue.getJob(createdJobId);
    expect(queuedJob).toBeDefined();
    expect(queuedJob?.data.renderJobId).toBe(createdJobId);
    expect(queuedJob?.data.projectId).toBe(projectAId);
    // Should NOT contain heavy project timeline blobs in queue data
    expect((queuedJob?.data as any).timeline).toBeUndefined();
  });

  // ============================================================================
  // 7. QUEUE SUBMISSION FAILURE COMPENSATION
  // ============================================================================
  it('7. Compensates cleanly by marking failed and refunding credits if queue dispatch fails', async () => {
    const balanceBefore = await creditsService.getBalance(userA.id);

    // Mock jobQueue.add to fail once
    const originalAdd = jobQueue.add.bind(jobQueue);
    vi.spyOn(jobQueue, 'add').mockRejectedValueOnce(new Error('Simulated Redis network disconnection'));

    await expect(
      renderJobService.createRenderJob(userA.id, {
        projectId: projectAId,
        settings: {
          format: 'mp4',
          resolutionWidth: 1920,
          resolutionHeight: 1080,
          framerate: 30,
        },
      })
    ).rejects.toThrow();

    // Verify credits were refunded
    const balanceAfter = await creditsService.getBalance(userA.id);
    expect(balanceAfter).toBe(balanceBefore);

    // Restore queue add
    vi.restoreAllMocks();
  });

  // ============================================================================
  // 8. GET OWN JOB
  // ============================================================================
  it('8. GET /api/v1/jobs/render/:id retrieves own job details', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/jobs/render/${createdJobId}`,
      headers: { Authorization: `Bearer ${userA.token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(createdJobId);
  });

  // ============================================================================
  // 9. REJECT ANOTHER USER'S JOB
  // ============================================================================
  it("9. GET /api/v1/jobs/render/:id rejects another user from viewing the job", async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/jobs/render/${createdJobId}`,
      headers: { Authorization: `Bearer ${userB.token}` }, // User B attempting to view User A's job
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
  });

  // ============================================================================
  // 10. LIST JOBS WITH PAGINATION AND FILTERS
  // ============================================================================
  it('10. GET /api/v1/jobs/render lists user jobs with pagination and filters', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/jobs/render?page=1&limit=10&projectId=${projectAId}`,
      headers: { Authorization: `Bearer ${userA.token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    const metaPage = body.meta?.page ?? body.meta?.pagination?.page;
    const metaLimit = body.meta?.limit ?? body.meta?.pagination?.limit;
    expect(metaPage).toBe(1);
    expect(metaLimit).toBe(10);
  });

  // ============================================================================
  // 11. CANCEL QUEUED JOB & REFUND
  // ============================================================================
  it('11. POST /api/v1/jobs/render/:id/cancel cancels queued job and refunds credits', async () => {
    // Create fresh job to cancel
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/jobs/render',
      headers: { Authorization: `Bearer ${userA.token}` },
      payload: {
        projectId: projectAId,
        settings: {
          format: 'mp4',
          resolutionWidth: 1920,
          resolutionHeight: 1080,
          framerate: 30,
        },
      },
    });
    const jobToCancel = JSON.parse(createRes.body).data;
    const balanceBeforeCancel = await creditsService.getBalance(userA.id);

    const cancelRes = await app.inject({
      method: 'POST',
      url: `/api/v1/jobs/render/${jobToCancel.id}/cancel`,
      headers: { Authorization: `Bearer ${userA.token}` },
    });

    expect(cancelRes.statusCode).toBe(200);
    const cancelledJob = JSON.parse(cancelRes.body).data;
    expect(cancelledJob.status).toBe('cancelled');
    expect(cancelledJob.cancelledAt).toBeDefined();

    // Verify credit refund was received
    const balanceAfterCancel = await creditsService.getBalance(userA.id);
    expect(balanceAfterCancel - balanceBeforeCancel).toBe(jobToCancel.creditCost);
  });

  // ============================================================================
  // 12. CANCEL RUNNING JOB -> CANCELLING
  // ============================================================================
  it('12. Cancelling a running job transitions status to cancelling', async () => {
    // Simulate a running job
    const runningJobId = 'test-running-job-123';
    const mockJob = {
      id: runningJobId,
      userId: userA.id,
      projectId: projectAId,
      status: 'running' as const,
      settings: {
        format: 'mp4' as const,
        resolutionWidth: 1920,
        resolutionHeight: 1080,
        framerate: 30,
        videoCodec: 'h264' as const,
        audioCodec: 'aac' as const,
      },
      progress: 45.0,
      stage: 'rendering',
      attempts: 1,
      maxAttempts: 3,
      creditReservationId: 'res-running-123',
      creditCost: 10,
      workerMetadata: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    mockRenderJobs.set(runningJobId, mockJob);

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/jobs/render/${runningJobId}/cancel`,
      headers: { Authorization: `Bearer ${userA.token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body).data;
    expect(body.status).toBe('cancelling');
    expect(body.stage).toBe('cancelling');
  });

  // ============================================================================
  // 13. CANCEL COMPLETED JOB REJECTION
  // ============================================================================
  it('13. Rejects cancelling an already completed job', async () => {
    const completedJobId = 'test-completed-job-456';
    mockRenderJobs.set(completedJobId, {
      id: completedJobId,
      userId: userA.id,
      projectId: projectAId,
      status: 'completed',
      settings: {
        format: 'mp4',
        resolutionWidth: 1920,
        resolutionHeight: 1080,
        framerate: 30,
        videoCodec: 'h264',
        audioCodec: 'aac',
      },
      progress: 100,
      stage: 'completed',
      attempts: 1,
      maxAttempts: 3,
      creditCost: 10,
      workerMetadata: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/jobs/render/${completedJobId}/cancel`,
      headers: { Authorization: `Bearer ${userA.token}` },
    });

    expect(res.statusCode).toBe(400);
  });

  // ============================================================================
  // 14. RETRY FAILED JOB
  // ============================================================================
  it('14. POST /api/v1/jobs/render/:id/retry successfully retries a failed job', async () => {
    const failedJobId = 'test-failed-job-789';
    mockRenderJobs.set(failedJobId, {
      id: failedJobId,
      userId: userA.id,
      projectId: projectAId,
      status: 'failed',
      settings: {
        format: 'mp4',
        resolutionWidth: 1920,
        resolutionHeight: 1080,
        framerate: 30,
        videoCodec: 'h264',
        audioCodec: 'aac',
      },
      progress: 60,
      stage: 'encoding',
      errorCode: 'FFMPEG_TIMEOUT',
      errorMessage: 'Encoding timeout after 300s',
      attempts: 1,
      maxAttempts: 3,
      creditCost: 10,
      workerMetadata: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/jobs/render/${failedJobId}/retry`,
      headers: { Authorization: `Bearer ${userA.token}` },
    });

    expect(res.statusCode).toBe(200);
    const retriedJob = JSON.parse(res.body).data;
    expect(retriedJob.status).toBe('queued');
    expect(retriedJob.progress).toBe(0);
    expect(retriedJob.stage).toBe('queued');
    expect(retriedJob.errorCode).toBeNull();
    expect(retriedJob.errorMessage).toBeNull();
    expect(retriedJob.attempts).toBe(2);
  });

  // ============================================================================
  // 15. RETRY MAX-ATTEMPT REJECTION
  // ============================================================================
  it('15. Rejects retry when job has reached max attempts', async () => {
    const maxAttemptJobId = 'test-max-attempts-job';
    mockRenderJobs.set(maxAttemptJobId, {
      id: maxAttemptJobId,
      userId: userA.id,
      projectId: projectAId,
      status: 'failed',
      settings: {
        format: 'mp4',
        resolutionWidth: 1920,
        resolutionHeight: 1080,
        framerate: 30,
        videoCodec: 'h264',
        audioCodec: 'aac',
      },
      progress: 10,
      stage: 'starting',
      attempts: 3,
      maxAttempts: 3,
      creditCost: 10,
      workerMetadata: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/jobs/render/${maxAttemptJobId}/retry`,
      headers: { Authorization: `Bearer ${userA.token}` },
    });

    expect(res.statusCode).toBe(400);
  });

  // ============================================================================
  // 16. RETRY COMPLETED JOB REJECTION
  // ============================================================================
  it('16. Rejects retry on completed or active render jobs', async () => {
    const activeJobId = 'test-active-queued-job';
    mockRenderJobs.set(activeJobId, {
      id: activeJobId,
      userId: userA.id,
      projectId: projectAId,
      status: 'queued',
      settings: {
        format: 'mp4',
        resolutionWidth: 1920,
        resolutionHeight: 1080,
        framerate: 30,
        videoCodec: 'h264',
        audioCodec: 'aac',
      },
      progress: 0,
      stage: 'queued',
      attempts: 0,
      maxAttempts: 3,
      creditCost: 10,
      workerMetadata: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/jobs/render/${activeJobId}/retry`,
      headers: { Authorization: `Bearer ${userA.token}` },
    });

    expect(res.statusCode).toBe(400);
  });

  // ============================================================================
  // 17. DUPLICATE CANCEL PROTECTION
  // ============================================================================
  it('17. Handles duplicate cancel requests idempotently without double refunding', async () => {
    const job = await renderJobService.createRenderJob(userA.id, {
      projectId: projectAId,
      settings: { format: 'mp4', resolutionWidth: 1920, resolutionHeight: 1080, framerate: 30 },
    });

    // First cancel
    await renderJobService.cancelRenderJob(job.id, userA.id);
    const balanceAfterFirstCancel = await creditsService.getBalance(userA.id);

    // Second cancel
    const secondCancel = await renderJobService.cancelRenderJob(job.id, userA.id);
    expect(secondCancel.status).toBe('cancelled');

    // Balance must not change again
    const balanceAfterSecondCancel = await creditsService.getBalance(userA.id);
    expect(balanceAfterSecondCancel).toBe(balanceAfterFirstCancel);
  });

  // ============================================================================
  // 18. DUPLICATE RETRY PROTECTION
  // ============================================================================
  it('18. Rejects duplicate retry if job has already transitioned back to queued', async () => {
    const testJobId = 'test-dup-retry-job';
    mockRenderJobs.set(testJobId, {
      id: testJobId,
      userId: userA.id,
      projectId: projectAId,
      status: 'failed',
      settings: { format: 'mp4', resolutionWidth: 1920, resolutionHeight: 1080, framerate: 30, videoCodec: 'h264', audioCodec: 'aac' },
      progress: 0,
      stage: 'failed',
      attempts: 1,
      maxAttempts: 3,
      creditCost: 10,
      workerMetadata: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // First retry
    await renderJobService.retryRenderJob(testJobId, userA.id);

    // Second retry should fail because status is now queued
    await expect(renderJobService.retryRenderJob(testJobId, userA.id)).rejects.toThrow();
  });

  // ============================================================================
  // 19. INVALID STATUS TRANSITIONS
  // ============================================================================
  it('19. State machine validates allowed and disallowed transitions', () => {
    // Valid transitions
    expect(isValidStatusTransition('queued', 'starting')).toBe(true);
    expect(isValidStatusTransition('starting', 'running')).toBe(true);
    expect(isValidStatusTransition('running', 'validating')).toBe(true);
    expect(isValidStatusTransition('validating', 'uploading')).toBe(true);
    expect(isValidStatusTransition('uploading', 'completed')).toBe(true);
    expect(isValidStatusTransition('running', 'cancelling')).toBe(true);
    expect(isValidStatusTransition('cancelling', 'cancelled')).toBe(true);
    expect(isValidStatusTransition('failed', 'queued')).toBe(true);

    // Invalid transitions
    expect(isValidStatusTransition('completed', 'running')).toBe(false);
    expect(isValidStatusTransition('completed', 'cancelled')).toBe(false);
    expect(isValidStatusTransition('cancelled', 'completed')).toBe(false);
    expect(isValidStatusTransition('queued', 'completed')).toBe(false);
    expect(isValidStatusTransition('failed', 'completed')).toBe(false);
  });

  // ============================================================================
  // 20. DUPLICATE CREDIT SETTLEMENT / REFUND PROTECTION
  // ============================================================================
  it('20. Confirms credit ledger maintains exactly one refund transaction per cancelled reservation', async () => {
    const freshJob = await renderJobService.createRenderJob(userA.id, {
      projectId: projectAId,
      settings: { format: 'mp4', resolutionWidth: 1920, resolutionHeight: 1080, framerate: 30 },
    });

    await renderJobService.cancelRenderJob(freshJob.id, userA.id);

    const history = await creditsService.getHistory(userA.id);
    const refunds = history.filter(
      (tx) => tx.type === 'job_refund' && tx.description.includes(freshJob.id)
    );

    expect(refunds.length).toBe(1);
    expect(refunds[0].amount).toBe(freshJob.creditCost);
  });
});
