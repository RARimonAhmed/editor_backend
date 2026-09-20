import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'crypto';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { webhooksService, webhookDeadLetterQueue } from '../src/modules/webhooks/webhooks.service.js';

describe('External Provider Webhook Ingestion Engine', () => {
  let app: FastifyInstance;
  const webhookSecret = 'whsec_stripe_production_secret_32bytes!';

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  // 1. Unsigned Webhook Rejection (Never trust unsigned external webhook payloads)
  it('rejects unsigned webhook payload with HTTP 401 AuthenticationError', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/providers/stripe',
      payload: {
        id: `evt_unsigned_${Date.now()}`,
        type: 'checkout.session.completed',
        data: { test: true },
      },
      headers: {
        // No signature header!
        'content-type': 'application/json',
      },
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.error.message).toContain('Unsigned');
  });

  // 2. Cryptographic Signature Verification
  it('accepts and verifies valid HMAC-SHA256 signature', async () => {
    const eventId = `evt_signed_${Date.now()}`;
    const payload = JSON.stringify({
      id: eventId,
      type: 'checkout.session.completed',
      data: {
        client_reference_id: 'user_wh_valid',
        amountCredits: 250,
      },
    });

    const signature = crypto.createHmac('sha256', webhookSecret).update(payload).digest('hex');

    const res = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/providers/stripe',
      headers: {
        'x-webhook-signature': signature,
        'content-type': 'application/json',
      },
      payload,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.handled).toBe(true);
    expect(body.data.status).toBe('PROCESSED');
  });

  // 3. Idempotency & Anti-Replay Defense
  it('deduplicates duplicate deliveries idempotently without double-processing', async () => {
    const eventId = `evt_idempotent_${Date.now()}`;
    const payload = JSON.stringify({
      id: eventId,
      type: 'invoice.payment_succeeded',
      data: {
        client_reference_id: 'user_replay_test',
        amountCredits: 100,
      },
    });

    const signature = crypto.createHmac('sha256', webhookSecret).update(payload).digest('hex');

    // First delivery
    const res1 = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/providers/stripe',
      headers: { 'x-webhook-signature': signature, 'content-type': 'application/json' },
      payload,
    });
    expect(res1.statusCode).toBe(200);

    // Second delivery (duplicate replay)
    const res2 = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/providers/stripe',
      headers: { 'x-webhook-signature': signature, 'content-type': 'application/json' },
      payload,
    });

    expect(res2.statusCode).toBe(200);
    const body2 = JSON.parse(res2.body);
    expect(body2.success).toBe(true);
    expect(body2.data.isDuplicate).toBe(true);
    expect(body2.data.action).toBe('IDEMPOTENT_SKIPPED');
  });

  // 4. Dead-Letter Queue (DLQ) Management
  it('captures failing webhooks into DLQ and allows admin review and replay', async () => {
    const dlqId = 'dlq_test_entry_1';
    webhookDeadLetterQueue.set(dlqId, {
      id: dlqId,
      eventId: 'evt_failed_worker',
      provider: 'worker',
      eventType: 'worker.completed',
      payload: { jobId: 'job_non_existent', status: 'completed' },
      reason: 'Database timeout on callback dispatch',
      receivedAt: new Date().toISOString(),
      deadLetteredAt: new Date().toISOString(),
    });

    // Inspect DLQ
    const resList = await app.inject({
      method: 'GET',
      url: '/v1/webhooks/dead-letter',
    });
    expect(resList.statusCode).toBe(200);
    const listBody = JSON.parse(resList.body);
    expect(Array.isArray(listBody.data)).toBe(true);
    expect(listBody.data.find((e: any) => e.id === dlqId)).toBeDefined();

    // Replay DLQ entry
    const resRetry = await app.inject({
      method: 'POST',
      url: `/v1/webhooks/dead-letter/${dlqId}/retry`,
    });
    expect(resRetry.statusCode).toBe(200);
    const retryBody = JSON.parse(resRetry.body);
    expect(retryBody.data.handled).toBe(true);
    expect(retryBody.data.action).toBe('DLQ_REPLAYED');
  });
});
