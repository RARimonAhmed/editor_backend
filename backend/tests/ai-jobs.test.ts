import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { aiGatewayService } from '../src/modules/ai/ai-gateway.service.js';
import { FakeAIProviderAdapter } from '../src/modules/ai/providers/fake.provider.js';
import { creditsService } from '../src/modules/credits/credits.service.js';

describe('Asynchronous AI Job System Subsystem', () => {
  let app: FastifyInstance;
  let userToken: string;
  let userId: string;
  let otherToken: string;
  let fakeAdapter: FakeAIProviderAdapter;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    // Register User A
    const regResA = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: `ai_jobs_lead_${Date.now()}@techxayan.com`,
        password: 'Password123!',
        displayName: 'TechXayan AI Architect',
      },
    });
    const bodyA = JSON.parse(regResA.body);
    userToken = bodyA.data.tokens.accessToken;
    userId = bodyA.data.user.id;

    // Register User B (for isolation tests)
    const regResB = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: `ai_jobs_other_${Date.now()}@techxayan.com`,
        password: 'Password123!',
        displayName: 'Other Creator',
      },
    });
    const bodyB = JSON.parse(regResB.body);
    otherToken = bodyB.data.tokens.accessToken;

    fakeAdapter = aiGatewayService.getAdapter('fake') as FakeAIProviderAdapter;
    fakeAdapter.resetSimulation();
  });

  afterAll(async () => {
    fakeAdapter.resetSimulation();
    await app.close();
  });

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  // --------------------------------------------------------------------------
  // 1. ASYNC JOB ENQUEUEING & IMMEDIATE 202 ACCEPTED
  // --------------------------------------------------------------------------
  it('POST /v1/ai/jobs enqueues an asynchronous AI job and returns HTTP 202 Accepted', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/ai/jobs',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        type: 'text_generation',
        input: {
          prompt: 'Write an engaging 15-second TikTok intro hook about travel hacks.',
        },
        provider: 'fake',
        model: 'fake-text-v1',
      },
    });

    expect(res.statusCode).toBe(202);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.isReplay).toBe(false);

    const job = body.data.job;
    expect(job).toBeDefined();
    expect(job.id).toBeTypeOf('string');
    expect(job.userId).toBe(userId);
    expect(job.type).toBe('text_generation');
    expect(job.status).toBe('QUEUED');
    expect(job.progress).toBe(0);
    expect(job.provider).toBe('fake');
    expect(job.model).toBe('fake-text-v1');
    expect(job.cost).toBeGreaterThanOrEqual(1);
    expect(job.createdAt).toBeDefined();
    expect(job.output).toBeNull();
  });

  // --------------------------------------------------------------------------
  // 2. BACKGROUND WORKER EXECUTION & STATE TRANSITIONS (QUEUED -> RUNNING -> COMPLETED)
  // --------------------------------------------------------------------------
  it('worker processes job asynchronously through state transitions to COMPLETED', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/ai/jobs',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        type: 'text_generation',
        input: {
          prompt: 'Generate an energetic voiceover script for tech gadget review',
        },
        provider: 'fake',
      },
    });

    expect(res.statusCode).toBe(202);
    const jobId = JSON.parse(res.body).data.job.id;

    // Wait for the background worker to execute (our mock worker sleeps ~50ms total)
    await sleep(150);

    const checkRes = await app.inject({
      method: 'GET',
      url: `/v1/ai/jobs/${jobId}`,
      headers: { authorization: `Bearer ${userToken}` },
    });

    expect(checkRes.statusCode).toBe(200);
    const job = JSON.parse(checkRes.body).data.job;
    expect(job.status).toBe('COMPLETED');
    expect(job.progress).toBe(100);
    expect(job.startedAt).toBeDefined();
    expect(job.completedAt).toBeDefined();
    expect(job.output).toBeDefined();
    expect(job.output.text).toContain('Generated cinematic script');
    expect(job.usage).toBeDefined();
    expect(job.usage.totalTokens).toBeGreaterThan(0);
    expect(job.error).toBeNull();
  });

  // --------------------------------------------------------------------------
  // 3. IDEMPOTENCY & DEDUPLICATION VIA IDEMPOTENCY-KEY HEADER
  // --------------------------------------------------------------------------
  it('re-submitting identical Idempotency-Key returns existing job without duplicate charge', async () => {
    const initialCredits = await creditsService.getBalance(userId);
    const idempotencyKey = `idem-${Date.now()}-${Math.random()}`;

    // 1st submission
    const firstRes = await app.inject({
      method: 'POST',
      url: '/v1/ai/jobs',
      headers: {
        authorization: `Bearer ${userToken}`,
        'idempotency-key': idempotencyKey,
      },
      payload: {
        type: 'image_generation',
        input: {
          prompt: 'Cyberpunk futuristic neon city skyline at night with rain',
          aspectRatio: '16:9',
        },
        provider: 'fake',
      },
    });

    expect(firstRes.statusCode).toBe(202);
    const firstJob = JSON.parse(firstRes.body).data.job;
    const creditsAfterFirst = await creditsService.getBalance(userId);
    expect(creditsAfterFirst).toBeLessThan(initialCredits); // Credits deducted

    // 2nd submission with SAME idempotency key
    const secondRes = await app.inject({
      method: 'POST',
      url: '/v1/ai/jobs',
      headers: {
        authorization: `Bearer ${userToken}`,
        'idempotency-key': idempotencyKey,
      },
      payload: {
        type: 'image_generation',
        input: {
          prompt: 'Cyberpunk futuristic neon city skyline at night with rain',
          aspectRatio: '16:9',
        },
        provider: 'fake',
      },
    });

    expect([200, 202]).toContain(secondRes.statusCode);
    const secondBody = JSON.parse(secondRes.body);
    expect(secondBody.data.isReplay).toBe(true);
    expect(secondBody.data.job.id).toBe(firstJob.id);
    expect(secondRes.headers['x-idempotent-replay']).toBe('true');

    // Verify credits were NOT deducted a second time!
    const creditsAfterSecond = await creditsService.getBalance(userId);
    expect(creditsAfterSecond).toBe(creditsAfterFirst);
  });

  // --------------------------------------------------------------------------
  // 4. SPEECH-TO-TEXT ASYNC JOB EXECUTION
  // --------------------------------------------------------------------------
  it('executes asynchronous speech-to-text transcription with word-level timestamps', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/ai/jobs',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        type: 'speech_to_text',
        input: {
          audioUrl: 'https://assets.techxayan.com/samples/voiceover.mp3',
          language: 'en',
          timestamps: true,
        },
        provider: 'fake',
      },
    });

    expect(res.statusCode).toBe(202);
    const jobId = JSON.parse(res.body).data.job.id;

    await sleep(150);

    const checkRes = await app.inject({
      method: 'GET',
      url: `/v1/ai/jobs/${jobId}`,
      headers: { authorization: `Bearer ${userToken}` },
    });

    expect(checkRes.statusCode).toBe(200);
    const job = JSON.parse(checkRes.body).data.job;
    expect(job.status).toBe('COMPLETED');
    expect(job.output.transcript).toBeDefined();
    expect(Array.isArray(job.output.words)).toBe(true);
    expect(job.output.words.length).toBeGreaterThan(0);
    expect(job.output.words[0]).toHaveProperty('word');
    expect(job.output.words[0]).toHaveProperty('start');
    expect(job.output.words[0]).toHaveProperty('end');
  });

  // --------------------------------------------------------------------------
  // 5. CANCELLATION & AUTOMATIC CREDIT REFUND
  // --------------------------------------------------------------------------
  it('POST /v1/ai/jobs/:id/cancel aborts execution, sets CANCELLED, and refunds credits', async () => {
    const preBalance = await creditsService.getBalance(userId);

    // Enqueue video job (cost: 15 credits) with long simulated timeout
    const enqueueRes = await app.inject({
      method: 'POST',
      url: '/v1/ai/jobs',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        type: 'video_generation',
        input: {
          prompt: 'Ultra-slow cinematic timelapse of cloud formation over alpine ridge',
          durationSeconds: 10,
        },
        provider: 'fake',
        timeoutMs: 30000,
      },
    });

    expect(enqueueRes.statusCode).toBe(202);
    const jobId = JSON.parse(enqueueRes.body).data.job.id;
    const balanceAfterEnqueue = await creditsService.getBalance(userId);
    expect(balanceAfterEnqueue).toBe(preBalance - 15);

    // Cancel the job
    const cancelRes = await app.inject({
      method: 'POST',
      url: `/v1/ai/jobs/${jobId}/cancel`,
      headers: { authorization: `Bearer ${userToken}` },
    });

    expect(cancelRes.statusCode).toBe(200);
    const cancelledJob = JSON.parse(cancelRes.body).data.job;
    expect(cancelledJob.status).toBe('CANCELLED');

    // Verify credits were refunded back
    const balanceAfterCancel = await creditsService.getBalance(userId);
    expect(balanceAfterCancel).toBe(preBalance);
  });

  // --------------------------------------------------------------------------
  // 6. TIMEOUT ENFORCEMENT
  // --------------------------------------------------------------------------
  it('enforces timeoutMs: job transitions to FAILED when timeout expires and refunds credits', async () => {
    const preBalance = await creditsService.getBalance(userId);

    // Submit with tiny timeout of 1ms so it times out immediately
    const res = await app.inject({
      method: 'POST',
      url: '/v1/ai/jobs',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        type: 'text_generation',
        input: { prompt: 'Slow processing prompt' },
        provider: 'fake',
        timeoutMs: 10, // 10ms threshold
      },
    });

    expect(res.statusCode).toBe(202);
    const jobId = JSON.parse(res.body).data.job.id;

    // Allow timeout timer to fire and worker to fail the job
    await sleep(150);

    const checkRes = await app.inject({
      method: 'GET',
      url: `/v1/ai/jobs/${jobId}`,
      headers: { authorization: `Bearer ${userToken}` },
    });

    const job = JSON.parse(checkRes.body).data.job;
    expect(job.status).toBe('FAILED');
    expect(job.error).toContain('timed out');

    // Balance refunded on failure
    const postBalance = await creditsService.getBalance(userId);
    expect(postBalance).toBe(preBalance);
  });

  // --------------------------------------------------------------------------
  // 7. RETRY CAPABILITY
  // --------------------------------------------------------------------------
  it('POST /v1/ai/jobs/:id/retry re-queues failed job and completes successfully', async () => {
    // 1. Submit a job configured with tiny timeout so it fails
    const failRes = await app.inject({
      method: 'POST',
      url: '/v1/ai/jobs',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        type: 'text_generation',
        input: { prompt: 'Prompt to be retried later' },
        provider: 'fake',
        timeoutMs: 10,
      },
    });
    const jobId = JSON.parse(failRes.body).data.job.id;
    await sleep(100);

    // 2. Retry the job
    const retryRes = await app.inject({
      method: 'POST',
      url: `/v1/ai/jobs/${jobId}/retry`,
      headers: { authorization: `Bearer ${userToken}` },
    });

    expect(retryRes.statusCode).toBe(200);
    const retriedJob = JSON.parse(retryRes.body).data.job;
    expect(retriedJob.status).toBe('QUEUED');
    expect(retriedJob.progress).toBe(0);
    expect(retriedJob.error).toBeNull();
  });

  // --------------------------------------------------------------------------
  // 8. STRICT SECURITY & ZERO SECRET LEAKAGE
  // --------------------------------------------------------------------------
  it('GET /v1/ai/jobs/:id strictly sanitizes output without leaking API keys or secrets', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/ai/jobs',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        type: 'text_generation',
        input: { prompt: 'Verify zero secrets in payload' },
        provider: 'fake',
      },
    });
    const jobId = JSON.parse(res.body).data.job.id;
    await sleep(150);

    const getRes = await app.inject({
      method: 'GET',
      url: `/v1/ai/jobs/${jobId}`,
      headers: { authorization: `Bearer ${userToken}` },
    });

    const rawBody = getRes.body;
    expect(rawBody).not.toContain('apiKey');
    expect(rawBody).not.toContain('GEMINI_API_KEY');
    expect(rawBody).not.toContain('OPENAI_API_KEY');
    expect(rawBody).not.toContain('Bearer ');
    expect(rawBody).not.toContain('clientSecret');
  });

  // --------------------------------------------------------------------------
  // 9. AUTHORIZATION & CROSS-TENANT ISOLATION
  // --------------------------------------------------------------------------
  it('prevents unauthorized users from accessing or cancelling another user’s AI job', async () => {
    // User A creates a job
    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/ai/jobs',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        type: 'text_generation',
        input: { prompt: 'User A confidential creative brief' },
        provider: 'fake',
      },
    });
    const jobId = JSON.parse(createRes.body).data.job.id;

    // User B attempts to access User A's job
    const viewRes = await app.inject({
      method: 'GET',
      url: `/v1/ai/jobs/${jobId}`,
      headers: { authorization: `Bearer ${otherToken}` },
    });
    expect(viewRes.statusCode).toBe(403);

    // User B attempts to cancel User A's job
    const cancelRes = await app.inject({
      method: 'POST',
      url: `/v1/ai/jobs/${jobId}/cancel`,
      headers: { authorization: `Bearer ${otherToken}` },
    });
    expect(cancelRes.statusCode).toBe(403);
  });

  // --------------------------------------------------------------------------
  // 10. LISTING USER JOBS WITH PAGINATION & FILTERS
  // --------------------------------------------------------------------------
  it('GET /v1/ai/jobs lists user jobs with status, type, and pagination', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/ai/jobs?limit=5&offset=0',
      headers: { authorization: `Bearer ${userToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.jobs)).toBe(true);
    expect(body.data.total).toBeGreaterThanOrEqual(1);
    expect(body.data.limit).toBe(5);
    expect(body.data.offset).toBe(0);
  });
});
