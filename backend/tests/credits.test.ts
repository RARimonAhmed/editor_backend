import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { creditsService } from '../src/modules/credits/credits.service.js';

describe('Credits & Billing Module', () => {
  let app: FastifyInstance;
  let authToken: string;
  let userId: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    // Register a test user
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `credits_${Date.now()}@techxayan.com`,
        password: 'Password123!',
        displayName: 'Credits Tester',
      },
    });

    const body = JSON.parse(regRes.body);
    authToken = body.data.tokens.accessToken;
    userId = body.data.user.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/credits/balance returns current balance', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/credits/balance',
      headers: { Authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.balance).toBeGreaterThan(0);
  });

  it('Deducting credits updates balance and logs transaction', async () => {
    const initial = await creditsService.getBalance(userId);
    const newBalance = await creditsService.deductCredits(userId, 10, 'Test AI Usage');
    expect(newBalance).toBe(initial - 10);

    const history = await creditsService.getHistory(userId);
    expect(history.length).toBeGreaterThan(0);
    expect(history[0].amount).toBe(-10);
  });

  it('Prevents overdraft when deducting more credits than balance', async () => {
    const hugeAmount = 999999;
    await expect(creditsService.deductCredits(userId, hugeAmount, 'Huge test')).rejects.toThrow(
      /Insufficient credit balance/
    );
  });
});
