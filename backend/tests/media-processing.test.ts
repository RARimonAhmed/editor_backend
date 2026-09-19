import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { WebSocket } from 'ws';
import { buildApp } from '../src/app.js';
import { jobQueue } from '../src/services/queue/index.js';

describe('Asynchronous Media Processing Pipeline & Worker Subsystem', () => {
  let app: FastifyInstance;
  let authToken: string;
  let testVideoMediaId: string;
  let testVideoJobId: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    // Register a test user
    const regRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: `pipeline_lead_${Date.now()}@techxayan.com`,
        password: 'Password123!',
        displayName: 'TechXayan Lead Pipeline Engineer',
      },
    });

    const body = JSON.parse(regRes.body);
    authToken = body.data.tokens.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  // --------------------------------------------------------------------------
  // 1. NON-BLOCKING UPLOAD COMPLETION & QUEUE DISPATCH
  // --------------------------------------------------------------------------
  it('POST /v1/media/complete enqueues media_processing job and returns immediately without blocking', async () => {
    // Step A: Presign video upload
    const presignRes = await app.inject({
      method: 'POST',
      url: '/v1/media/presign',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: {
        fileName: '4k_cinematic_broll.mp4',
        mimeType: 'video/mp4',
        fileSizeBytes: 104857600, // 100 MB
        category: 'video',
      },
    });

    expect(presignRes.statusCode).toBe(200);
    const presignData = JSON.parse(presignRes.body).data;
    testVideoMediaId = presignData.mediaId;

    // Step B: Complete upload with initial overrides
    const completeRes = await app.inject({
      method: 'POST',
      url: '/v1/media/complete',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: {
        mediaId: testVideoMediaId,
        width: 3840,
        height: 2160,
        durationSeconds: 125.4,
      },
    });

    expect(completeRes.statusCode).toBe(200);
    const completeData = JSON.parse(completeRes.body).data;

    // Non-blocking verification: status should immediately be PROCESSING
    expect(completeData.id).toBe(testVideoMediaId);
    expect(completeData.status).toBe('PROCESSING');
    expect(completeData.processingJobId).toBeDefined();

    testVideoJobId = completeData.processingJobId;

    // Verify background queue has accepted the job
    const job = await jobQueue.getJob(testVideoJobId);
    expect(job).not.toBeNull();
    expect(job?.type).toBe('media_processing');
  });

  // --------------------------------------------------------------------------
  // 2. END-TO-END PIPELINE EXECUTION & ARTIFACT GENERATION
  // --------------------------------------------------------------------------
  it('Background worker runs all 7 pipeline stages and transitions asset to READY', async () => {
    // Wait for the background worker to execute the stages
    let attempts = 0;
    let isReady = false;

    while (attempts < 20 && !isReady) {
      await new Promise((r) => setTimeout(r, 40));
      attempts++;

      const checkRes = await app.inject({
        method: 'GET',
        url: `/v1/media/${testVideoMediaId}`,
        headers: { Authorization: `Bearer ${authToken}` },
      });

      const asset = JSON.parse(checkRes.body).data;
      if (asset.status === 'READY') {
        isReady = true;
        // Verify extracted telemetry
        expect(asset.width).toBe(3840);
        expect(asset.height).toBe(2160);
        expect(asset.durationSeconds).toBe(125.4);
        expect(asset.framerate).toBeDefined();
        expect(asset.audioChannels).toBe(2);
        expect(asset.audioSampleRate).toBe(48000);

        // Verify generated thumbnails & filmstrip
        expect(asset.thumbnailUrl).toBeDefined();
        expect(asset.thumbnailStrip).toBeInstanceOf(Array);
        expect(asset.thumbnailStrip.length).toBeGreaterThanOrEqual(5);
        expect(asset.thumbnailStrip[0].timeOffsetSeconds).toBe(0);

        // Verify generated waveform peaks
        expect(asset.waveform).toBeDefined();
        expect(asset.waveform.peaks).toBeInstanceOf(Array);
        expect(asset.waveform.peaks.length).toBe(128);
        expect(asset.waveform.peaks[0]).toBeGreaterThanOrEqual(0.0);
        expect(asset.waveform.peaks[0]).toBeLessThanOrEqual(1.0);

        // Verify 720p edit proxy
        expect(asset.proxy).toBeDefined();
        expect(asset.proxy.resolution).toBe('720p');
        expect(asset.proxy.codec).toBe('h264');
        expect(asset.proxy.proxyUrl).toBeDefined();

        // Verify search index metadata
        expect(asset.searchMetadata).toBeDefined();
        expect(asset.searchMetadata.resolutionTag).toBe('4K');
        expect(asset.searchMetadata.keywords).toContain('4k');
        expect(asset.searchMetadata.keywords).toContain('video');
      }
    }

    expect(isReady).toBe(true);
  });

  // --------------------------------------------------------------------------
  // 3. QUERY PROCESSING JOB STATUS & TELEMETRY API
  // --------------------------------------------------------------------------
  it('GET /v1/media/:id/processing-job returns real-time progress and telemetry', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/media/${testVideoMediaId}/processing-job`,
      headers: { Authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.mediaId).toBe(testVideoMediaId);
    expect(body.data.status).toBe('READY');
    expect(body.data.job).toBeDefined();
    expect(body.data.job.status).toBe('completed');
    expect(body.data.job.progress).toBe(100);
    expect(body.data.telemetry).toBeDefined();
    expect(body.data.telemetry.codec).toBe('h264');
    expect(body.data.telemetry.colorInformation.colorSpace).toBe('bt709');
    expect(body.data.coverThumbnailUrl).toBeDefined();
    expect(body.data.waveform).toBeDefined();
    expect(body.data.proxy).toBeDefined();
  });

  // --------------------------------------------------------------------------
  // 4. JOB CANCELLATION
  // --------------------------------------------------------------------------
  it('POST /v1/media/:id/cancel-processing cancels job and transitions asset to FAILED', async () => {
    // Presign new asset
    const presignRes = await app.inject({
      method: 'POST',
      url: '/v1/media/presign',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: {
        fileName: 'abandoned_take.mp4',
        mimeType: 'video/mp4',
        fileSizeBytes: 50000000,
        category: 'video',
      },
    });
    const mediaId = JSON.parse(presignRes.body).data.mediaId;

    // Complete upload to enqueue
    await app.inject({
      method: 'POST',
      url: '/v1/media/complete',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: { mediaId },
    });

    // Cancel processing
    const cancelRes = await app.inject({
      method: 'POST',
      url: `/v1/media/${mediaId}/cancel-processing`,
      headers: { Authorization: `Bearer ${authToken}` },
    });

    expect(cancelRes.statusCode).toBe(200);
    const body = JSON.parse(cancelRes.body);
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('FAILED');

    // Verify asset status
    const assetRes = await app.inject({
      method: 'GET',
      url: `/v1/media/${mediaId}`,
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(JSON.parse(assetRes.body).data.status).toBe('FAILED');
  });

  // --------------------------------------------------------------------------
  // 5. RETRIES AND DEAD-LETTER QUEUE (DLQ) BEHAVIOR
  // --------------------------------------------------------------------------
  it('Retries failed jobs with exponential backoff and routes to Dead-Letter Queue (DLQ)', async () => {
    let executionAttempts = 0;

    // Register a failing job processor to test DLQ
    jobQueue.process('dlq_test_job', async (job) => {
      executionAttempts++;
      throw new Error(`Intentional simulation failure on attempt ${job.attempts}`);
    });

    // Enqueue job with maxAttempts = 3, backoffMs = 10
    const job = await jobQueue.add(
      'dlq_test_job',
      { test: 'dlq_payload' },
      { maxAttempts: 3, backoffMs: 10 }
    );

    // Wait for retries to exhaust
    let dlqJobFound = false;
    for (let i = 0; i < 25; i++) {
      await new Promise((r) => setTimeout(r, 25));
      const deadLetterJobs = await jobQueue.getDeadLetterJobs();
      if (deadLetterJobs.some((j) => j.id === job.id)) {
        dlqJobFound = true;
        break;
      }
    }

    expect(dlqJobFound).toBe(true);
    expect(executionAttempts).toBe(3);

    const failedJob = await jobQueue.getJob(job.id);
    expect(failedJob?.status).toBe('failed');
    expect(failedJob?.isDeadLetter).toBe(true);
    expect(failedJob?.attempts).toBe(3);
    expect(failedJob?.error).toContain('Intentional simulation failure on attempt 3');

    // Test API endpoint GET /v1/jobs/dead-letter
    const dlqRes = await app.inject({
      method: 'GET',
      url: '/v1/jobs/dead-letter',
      headers: { Authorization: `Bearer ${authToken}` },
    });

    expect(dlqRes.statusCode).toBe(200);
    const dlqData = JSON.parse(dlqRes.body).data;
    expect(dlqData.some((j: any) => j.id === job.id)).toBe(true);

    // Test Retry of dead letter job
    const retryRes = await jobQueue.retryJob(job.id);
    expect(retryRes?.status).toBe('queued');
    expect(retryRes?.attempts).toBe(0);
    expect(retryRes?.isDeadLetter).toBe(false);
  });

  // --------------------------------------------------------------------------
  // 6. WEBSOCKET PROGRESS SUBSCRIPTION
  // --------------------------------------------------------------------------
  it('WebSocket endpoint accepts progress subscription for job ID', async () => {
    const address = await app.listen({ port: 0, host: '127.0.0.1' });
    const url = new URL(address);
    const wsUrl = `ws://${url.host}/ws/v1/jobs/${testVideoJobId}/progress?token=${authToken}`;

    const ws = new WebSocket(wsUrl);

    const receivedMessages: any[] = [];
    const connected = await new Promise<boolean>((resolve) => {
      ws.on('open', () => resolve(true));
      ws.on('message', (msg) => {
        receivedMessages.push(JSON.parse(msg.toString()));
      });
      ws.on('error', () => resolve(false));
    });

    expect(connected).toBe(true);

    // Wait short delay to receive SUBSCRIBED event
    await new Promise((r) => setTimeout(r, 50));
    ws.close();

    expect(receivedMessages.length).toBeGreaterThanOrEqual(1);
    expect(receivedMessages[0].event).toBe('SUBSCRIBED');
    expect(receivedMessages[0].jobId).toBe(testVideoJobId);
  });
});
