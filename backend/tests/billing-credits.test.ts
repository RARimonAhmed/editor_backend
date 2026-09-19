import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { buildApp } from '../src/app.js';
import { billingService } from '../src/modules/credits/billing.service.js';
import { creditsService } from '../src/modules/credits/credits.service.js';

describe('Production Billing & Atomic Credit Reservation Subsystem', () => {
  let app: FastifyInstance;
  let authToken: string;
  let userId: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    // Register a test user
    const regRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: `billing_tester_${Date.now()}@techxayan.com`,
        password: 'Password123!',
        displayName: 'Billing QA Pro',
      },
    });

    const body = JSON.parse(regRes.body);
    authToken = body.data.tokens.accessToken;
    userId = body.data.user.id;
  });

  afterAll(async () => {
    await app.close();
  });

  // 1. GET /v1/billing/plans
  it('GET /v1/billing/plans returns active subscription and credit plans', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/billing/plans',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);

    const proPlan = body.data.find((p: any) => p.tier === 'pro');
    expect(proPlan).toBeDefined();
    expect(proPlan.monthlyCredits).toBeGreaterThanOrEqual(500);
    expect(Array.isArray(proPlan.features)).toBe(true);
    expect(proPlan.features.length).toBeGreaterThan(0);
  });

  // 2. GET /v1/billing/credits
  it('GET /v1/billing/credits returns wallet telemetry with available credits', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/billing/credits',
      headers: { Authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.balance).toBeGreaterThanOrEqual(100); // 100 welcome credits
    expect(body.data.reservedCredits).toBe(0);
    expect(body.data.availableCredits).toBe(body.data.balance);
  });

  // 3. POST /v1/billing/checkout
  it('POST /v1/billing/checkout initiates payment session with provider', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/billing/checkout',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: {
        planTier: 'creator',
        interval: 'monthly',
        successUrl: 'https://editor.techxayan.com/billing/success',
        cancelUrl: 'https://editor.techxayan.com/billing/cancel',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.checkoutUrl).toContain('checkout');
  });

  // 4. POST /v1/billing/webhook with signature verification and idempotency
  it('POST /v1/billing/webhook verifies HMAC signature and processes credit purchase idempotently', async () => {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test_mock_secret_key_32_bytes_long!!';
    const payload = JSON.stringify({
      id: `evt_test_checkout_${Date.now()}`,
      type: 'checkout.session.completed',
      data: {
        userId,
        amountCredits: 250,
        amountPaidUsd: 19.99,
        planTier: 'credits_pack_250',
      },
    });

    const signature = crypto.createHmac('sha256', webhookSecret).update(payload).digest('hex');

    // First delivery
    const res1 = await app.inject({
      method: 'POST',
      url: '/v1/billing/webhook',
      headers: {
        'stripe-signature': signature,
        'content-type': 'application/json',
      },
      payload,
    });

    expect(res1.statusCode).toBe(200);
    const body1 = JSON.parse(res1.body);
    expect(body1.success).toBe(true);
    expect(body1.processed).toBe(true);

    // Idempotent duplicate delivery
    const res2 = await app.inject({
      method: 'POST',
      url: '/v1/billing/webhook',
      headers: {
        'stripe-signature': signature,
        'content-type': 'application/json',
      },
      payload,
    });

    expect(res2.statusCode).toBe(200);
    const body2 = JSON.parse(res2.body);
    expect(body2.success).toBe(true);
    expect(body2.duplicate).toBe(true);
  });

  // 5. ATOMIC CREDIT RESERVATION LIFECYCLE: Reserve -> Settle -> Refund Excess
  it('Atomic Credit Reservation: reserves credits, settles actual usage, and refunds unused remainder', async () => {
    const initialStatus = await billingService.getCreditsStatus(userId);
    const initialAvailable = initialStatus.availableCredits;

    // Step 1: Reserve 20 credits for high-end AI rendering job
    const reservation = await billingService.reserveCredits(
      userId,
      20,
      'High-resolution AI Upscaling Job'
    );

    expect(reservation.status).toBe('RESERVED');
    expect(reservation.amount).toBe(20);

    const reservedStatus = await billingService.getCreditsStatus(userId);
    expect(reservedStatus.reservedCredits).toBe(20);
    expect(reservedStatus.availableCredits).toBe(initialAvailable - 20);

    // Step 2: Settle actual usage of only 14 credits (6 credits excess must be refunded)
    const settleResult = await billingService.settleCredits(
      userId,
      reservation.id,
      14,
      'AI Upscaling Completed Early'
    );

    expect(settleResult.settled).toBe(true);
    expect(settleResult.settledAmount).toBe(14);
    expect(settleResult.refundedAmount).toBe(6);

    const finalStatus = await billingService.getCreditsStatus(userId);
    expect(finalStatus.reservedCredits).toBe(0);
    expect(finalStatus.balance).toBe(initialStatus.balance - 14);
    expect(finalStatus.availableCredits).toBe(initialAvailable - 14);
  });

  // 6. ATOMIC CANCELLATION REFUND
  it('Refunds entire reservation if AI job is cancelled or fails', async () => {
    const beforeStatus = await billingService.getCreditsStatus(userId);
    const reservation = await billingService.reserveCredits(userId, 30, 'Cancelled Render');

    const refundRes = await billingService.refundReservation(userId, reservation.id, 'User cancelled job');
    expect(refundRes.refunded).toBe(true);

    const afterStatus = await billingService.getCreditsStatus(userId);
    expect(afterStatus.balance).toBe(beforeStatus.balance);
    expect(afterStatus.reservedCredits).toBe(0);
  });

  // 7. GET /v1/billing/usage
  it('GET /v1/billing/usage returns recorded usage ledger entries', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/billing/usage?limit=10',
      headers: { Authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.records)).toBe(true);
    expect(body.data.records.length).toBeGreaterThan(0);
  });

  // 8. CONCURRENCY MUTEX QUEUE: Prevent Double Spending Under High-Concurrency Bursts
  it('User mutex lock strictly prevents credit balance overdraft during concurrent bursts', async () => {
    // Current available credits
    const status = await billingService.getCreditsStatus(userId);
    const available = status.availableCredits;

    // Launch concurrent reservations that together would exceed balance
    const chunk = Math.floor(available / 2) + 5;
    const [res1, res2] = await Promise.allSettled([
      billingService.reserveCredits(userId, chunk, 'Concurrent Burst A'),
      billingService.reserveCredits(userId, chunk, 'Concurrent Burst B'),
    ]);

    // Exactly one should succeed, and the other must be rejected due to insufficient credits
    const fulfilled = [res1, res2].filter((r) => r.status === 'fulfilled');
    const rejected = [res1, res2].filter((r) => r.status === 'rejected');

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    // Clean up successful reservation
    const successful = (fulfilled[0] as PromiseFulfilledResult<any>).value;
    await billingService.refundReservation(userId, successful.id, 'Test cleanup');
  });
});
