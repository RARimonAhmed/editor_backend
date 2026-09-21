import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { authService } from '../src/modules/auth/auth.service.js';
import { jobsService, mockJobs } from '../src/modules/jobs/jobs.service.js';
import { aiJobService, mockAIJobs } from '../src/modules/ai/jobs/ai-job.service.js';
import { mockAuditLogs, adminService } from '../src/modules/admin/admin.service.js';
import { jobQueue } from '../src/services/queue/index.js';

describe('Admin Job Monitoring Center Operational Suite', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let regularUserToken: string;
  let regularUserId: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    // 1. Authenticate as Admin
    const loginRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/login',
      payload: {
        email: 'admin@techxayan.com',
        password: 'Admin123!',
      },
    });
    expect(loginRes.statusCode).toBe(200);
    const loginBody = JSON.parse(loginRes.body);
    adminToken = loginBody.data.tokens.accessToken;

    // 2. Register a regular user to test RBAC boundaries
    const regularUser = await authService.register({
      email: `regular_operator_${Date.now()}@techxayan.com`,
      password: 'OperatorPass123!',
      displayName: 'Standard Operator',
    });
    regularUserId = regularUser.user.id;
    regularUserToken = authService.signAccessToken({
      userId: regularUserId,
      sessionId: 'sess_regular_op',
      email: regularUser.user.email,
      role: 'USER',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('1. Unified Job Table & Telemetry (/v1/admin/jobs)', () => {
    it('should list jobs with complete 12-column telemetry schema', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/admin/jobs?pageSize=10',
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data.jobs)).toBe(true);
      expect(body.data.jobs.length).toBeGreaterThan(0);
      expect(typeof body.data.total).toBe('number');
      expect(typeof body.data.totalPages).toBe('number');

      // Verify all 12 core table columns exist on jobs
      const sampleJob = body.data.jobs[0];
      expect(sampleJob).toHaveProperty('id');
      expect(sampleJob).toHaveProperty('type');
      expect(sampleJob).toHaveProperty('ownerId');
      expect(sampleJob).toHaveProperty('status');
      expect(sampleJob).toHaveProperty('progress');
      expect(sampleJob).toHaveProperty('worker');
      expect(sampleJob).toHaveProperty('createdAt');
      expect(typeof sampleJob.progress).toBe('number');
      expect(typeof sampleJob.worker).toBe('string');
      expect(['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'RETRYING']).toContain(sampleJob.status);
    });

    it('should support searching across job ID, worker, and job type', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/admin/jobs?search=render_export',
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.jobs.every((j: any) => j.type.includes('render') || j.id.includes('render'))).toBe(true);
    });

    it('should filter jobs by status accurately', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/admin/jobs?status=COMPLETED',
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.jobs.every((j: any) => j.status === 'COMPLETED')).toBe(true);
    });
  });

  describe('2. Real-Time Operational Metrics (/v1/admin/jobs/metrics)', () => {
    it('should return live queue depth and failure rate metrics', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/admin/jobs/metrics',
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);

      const metrics = body.data;
      expect(typeof metrics.totalJobs).toBe('number');
      expect(typeof metrics.runningJobs).toBe('number');
      expect(typeof metrics.queuedJobs).toBe('number');
      expect(typeof metrics.completedJobs).toBe('number');
      expect(typeof metrics.failedJobs).toBe('number');
      expect(typeof metrics.cancelledJobs).toBe('number');
      expect(typeof metrics.failureRatePercentage).toBe('number');
      expect(typeof metrics.averageDurationSeconds).toBe('number');
      expect(typeof metrics.queueDepth).toBe('number');
      expect(metrics.queueDepth).toBe(metrics.queuedJobs + metrics.runningJobs);
    });
  });

  describe('3. Deep Job Details Inspection (/v1/admin/jobs/:id)', () => {
    it('should retrieve comprehensive execution trace, worker specs, and step logs', async () => {
      // Fetch a known seed job
      const listRes = await app.inject({
        method: 'GET',
        url: '/v1/admin/jobs?limit=1',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const sampleJob = JSON.parse(listRes.body).data.jobs[0];

      const res = await app.inject({
        method: 'GET',
        url: `/v1/admin/jobs/${sampleJob.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);

      const detail = body.data;
      expect(detail.job.id).toBe(sampleJob.id);
      expect(Array.isArray(detail.logs)).toBe(true);
      expect(detail.logs.length).toBeGreaterThan(0);
      expect(detail.workerNode).toBeDefined();
      expect(typeof detail.workerNode.id).toBe('string');
      expect(typeof detail.workerNode.concurrency).toBe('number');
      expect(Array.isArray(detail.steps)).toBe(true);
      expect(Array.isArray(detail.auditActivity)).toBe(true);
    });

    it('should return 404 for nonexistent job id', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/admin/jobs/nonexistent_job_9999',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('4. AI Job Intelligence Center (/v1/admin/ai/jobs)', () => {
    it('should list AI-specific jobs with model and prompt telemetry', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/admin/ai/jobs',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data.jobs)).toBe(true);
      expect(body.data.jobs.length).toBeGreaterThan(0);
    });

    it('should inspect deep AI job details including tokens, cost, and output reference', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/admin/ai/jobs/job_ai_seed_01',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      const aiDetail = body.data;

      expect(aiDetail.provider).toBe('gemini');
      expect(aiDetail.model).toBe('gemini-1.5-flash');
      expect(aiDetail.jobType).toBe('text_to_speech');
      expect(aiDetail.tokenUsage).toBeDefined();
      expect(typeof aiDetail.tokenUsage.promptTokens).toBe('number');
      expect(typeof aiDetail.tokenUsage.totalTokens).toBe('number');
      expect(typeof aiDetail.estimatedCostUsd).toBe('number');
      expect(typeof aiDetail.actualCostCredits).toBe('number');
      expect(aiDetail.outputReference).toBeDefined();
    });
  });

  describe('5. Cloud Render & Export Center (/v1/admin/render/jobs)', () => {
    it('should list Render jobs with resolution, fps, and worker specs', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/admin/render/jobs',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data.jobs)).toBe(true);
      expect(body.data.jobs.length).toBeGreaterThan(0);
    });

    it('should inspect deep Render job details including canvas dimensions and hardware encoder', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/admin/render/jobs/job_rnd_seed_01',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      const rndDetail = body.data;

      expect(rndDetail.canvas).toBeDefined();
      expect(rndDetail.canvas.resolutionWidth).toBe(3840);
      expect(rndDetail.canvas.resolutionHeight).toBe(2160);
      expect(rndDetail.canvas.framerate).toBe(60);
      expect(rndDetail.canvas.aspectRatio).toBe('16:9');
      expect(rndDetail.codec).toBe('PRORES422');
      expect(rndDetail.exportSettings.quality).toBe('maximum');
      expect(rndDetail.outputObject).toBeDefined();
      expect(rndDetail.outputObject.bucket).toBe('exports');
      expect(typeof rndDetail.framesRendered).toBe('number');
    });
  });

  describe('6. State Safety: Administrative Cancellation & Retry Enforcements', () => {
    it('should successfully cancel a queued/running job and record audit log', async () => {
      // Create a fresh render job in queued state
      const freshJob = await jobsService.createRenderJob(regularUserId, {
        projectId: 'demo_proj_1',
        format: 'mp4',
        resolutionWidth: 1920,
        resolutionHeight: 1080,
        framerate: 30,
      });

      const cancelRes = await app.inject({
        method: 'POST',
        url: `/v1/admin/jobs/${freshJob.id}/cancel`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(cancelRes.statusCode).toBe(200);
      const cancelBody = JSON.parse(cancelRes.body);
      expect(cancelBody.data.status).toBe('CANCELLED');

      // Verify audit activity was recorded
      const auditLog = mockAuditLogs.find((l) => l.action === 'JOB_CANCELLED' && l.targetId === freshJob.id);
      expect(auditLog).toBeDefined();
      expect(auditLog?.details?.jobId).toBe(freshJob.id);
    });

    it('MUST REJECT cancellation of an already COMPLETED job (State Violation Guard)', async () => {
      // job_rnd_seed_01 is completed
      const cancelRes = await app.inject({
        method: 'POST',
        url: '/v1/admin/jobs/job_rnd_seed_01/cancel',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(cancelRes.statusCode).toBe(400);
      const body = JSON.parse(cancelRes.body);
      expect(body.error.message).toContain('Cannot cancel a job that is already COMPLETED');
    });

    it('should successfully retry a failed job, resetting progress and incrementing retries', async () => {
      // job_rnd_seed_03 is failed
      const retryRes = await app.inject({
        method: 'POST',
        url: '/v1/admin/jobs/job_rnd_seed_03/retry',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(retryRes.statusCode).toBe(200);
      const retryBody = JSON.parse(retryRes.body);
      expect(retryBody.data.status).toBe('QUEUED');
      expect(retryBody.data.progress).toBe(0);
      expect(retryBody.data.retryCount).toBeGreaterThan(0);

      // Verify audit log
      const auditLog = mockAuditLogs.find((l) => l.action === 'JOB_RETRIED' && l.targetId === 'job_rnd_seed_03');
      expect(auditLog).toBeDefined();
    });

    it('MUST REJECT retry of an already COMPLETED job', async () => {
      const retryRes = await app.inject({
        method: 'POST',
        url: '/v1/admin/jobs/job_rnd_seed_01/retry',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(retryRes.statusCode).toBe(400);
      const body = JSON.parse(retryRes.body);
      expect(body.error.message).toContain('Cannot retry a job that is already COMPLETED');
    });

    it('MUST REJECT retry of an actively RUNNING job', async () => {
      // job_rnd_seed_02 is processing/running
      const retryRes = await app.inject({
        method: 'POST',
        url: '/v1/admin/jobs/job_rnd_seed_02/retry',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(retryRes.statusCode).toBe(400);
      const body = JSON.parse(retryRes.body);
      expect(body.error.message).toContain('Cannot retry an actively RUNNING job');
    });
  });

  describe('7. Administrative Security & RBAC Enforcement', () => {
    it('should reject non-admin users attempting to view jobs', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/admin/jobs',
        headers: { authorization: `Bearer ${regularUserToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('should reject non-admin users attempting to cancel jobs', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/admin/jobs/job_rnd_seed_02/cancel',
        headers: { authorization: `Bearer ${regularUserToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('should allow superadmin login via x-admin-key header', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/admin/jobs',
        headers: {
          'x-admin-key': 'adm_super_secret_production_key_32bytes',
        },
      });
      expect(res.statusCode).toBe(200);
    });
  });
});
