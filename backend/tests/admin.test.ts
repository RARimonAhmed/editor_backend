import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { adminService } from '../src/modules/admin/admin.service.js';

describe('Admin APIs & Production Observability Subsystem', () => {
  let app: FastifyInstance;
  const adminKey = process.env.ADMIN_API_KEY || 'adm_super_secret_production_key_32bytes';

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  // 1. Strong Admin Protection: Rejects unauthorized requests
  it('rejects unauthenticated and non-admin requests with HTTP 403 Forbidden', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/users',
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.error.message).toContain('Administrative access required');
  });

  // 2. Admin Authentication via x-admin-key
  it('GET /v1/admin/users returns platform user inventory with balances and subscription tiers', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/users?limit=10',
      headers: { 'x-admin-key': adminKey },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.users)).toBe(true);
    expect(typeof body.data.total).toBe('number');
  });

  // 3. Platform Projects Inventory
  it('GET /v1/admin/projects returns cross-tenant projects inventory', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/projects?limit=10',
      headers: { 'x-admin-key': adminKey },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.projects)).toBe(true);
  });

  // 4. Jobs & Failed Jobs Management
  it('GET /v1/admin/jobs and /v1/admin/failed-jobs lists background worker queue items', async () => {
    const resJobs = await app.inject({
      method: 'GET',
      url: '/v1/admin/jobs',
      headers: { 'x-admin-key': adminKey },
    });
    expect(resJobs.statusCode).toBe(200);

    const resFailed = await app.inject({
      method: 'GET',
      url: '/v1/admin/failed-jobs',
      headers: { 'x-admin-key': adminKey },
    });
    expect(resFailed.statusCode).toBe(200);
    const failedBody = JSON.parse(resFailed.body);
    expect(Array.isArray(failedBody.data.failedJobs)).toBe(true);
  });

  // 5. Usage & Telemetry Reports
  it('GET /v1/admin/usage returns AI operations breakdown and consumed credits', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/usage',
      headers: { 'x-admin-key': adminKey },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.totalAiJobs).toBeDefined();
    expect(Array.isArray(body.data.topOperations)).toBe(true);
  });

  // 6. Subscriptions & Credits Telemetry
  it('GET /v1/admin/subscriptions and /v1/admin/credits returns financial and circulation metrics', async () => {
    const resSubs = await app.inject({
      method: 'GET',
      url: '/v1/admin/subscriptions',
      headers: { 'x-admin-key': adminKey },
    });
    expect(resSubs.statusCode).toBe(200);
    const subBody = JSON.parse(resSubs.body);
    expect(subBody.data.tierBreakdown).toBeDefined();

    const resCredits = await app.inject({
      method: 'GET',
      url: '/v1/admin/credits',
      headers: { 'x-admin-key': adminKey },
    });
    expect(resCredits.statusCode).toBe(200);
    const credBody = JSON.parse(resCredits.body);
    expect(credBody.data.totalCirculatingCredits).toBeDefined();
  });

  // 7. Security Audit Logs
  it('records and lists security audit log entries', async () => {
    adminService.recordAuditLog('TEST_SECURITY_EVENT', 'admin_1', { detail: 'audit test' });

    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/audit-logs?limit=5',
      headers: { 'x-admin-key': adminKey },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.logs)).toBe(true);
    expect(body.data.logs.some((l: any) => l.action === 'TEST_SECURITY_EVENT')).toBe(true);
  });

  // 8. Public System Observability Metrics
  it('GET /metrics returns system health, memory, and queue telemetry', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/metrics',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.memory).toBeDefined();
    expect(body.data.dependencies).toBeDefined();
    expect(body.data.queues).toBeDefined();
    expect(body.data.http).toBeDefined();
  });
});
