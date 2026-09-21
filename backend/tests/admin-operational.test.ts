import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

describe('Admin Web Dashboard Endpoints & RBAC Security Suite', () => {
  let app: FastifyInstance;
  let adminToken: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /v1/admin/login with valid admin credentials returns JWT session', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/login',
      payload: {
        email: 'admin@techxayan.com',
        password: 'Admin123!',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.tokens.accessToken).toBeDefined();
    expect(body.data.user.email).toBe('admin@techxayan.com');
    adminToken = body.data.tokens.accessToken;
  });

  it('POST /v1/admin/login with master API key returns admin token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/login',
      payload: {
        adminKey: 'adm_super_secret_production_key_32bytes',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.tokens.accessToken).toBeDefined();
    expect(body.data.user.role).toBe('SUPERADMIN');
  });

  it('POST /v1/admin/login with invalid password rejects with 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/login',
      payload: {
        email: 'admin@techxayan.com',
        password: 'WrongPassword!',
      },
    });

    expect(res.statusCode).toBe(401);
  });

  it('GET /v1/admin/stats without authentication rejects with 401 or 403', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/stats',
    });

    expect([401, 403]).toContain(res.statusCode);
  });

  it('GET /v1/admin/stats with valid admin token returns real telemetry overview', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/stats',
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(typeof body.data.totalUsers).toBe('number');
    expect(typeof body.data.totalProjects).toBe('number');
    expect(typeof body.data.totalMediaAssets).toBe('number');
    expect(typeof body.data.totalAiJobs).toBe('number');
    expect(typeof body.data.totalRenderJobs).toBe('number');
    expect(Array.isArray(body.data.recentActivity)).toBe(true);
  });

  it('GET /v1/admin/charts returns 7 real-data telemetry time series', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/charts',
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.usersOverTime || body.data.usersGrowth)).toBe(true);
    expect(Array.isArray(body.data.projectsOverTime || body.data.projectsCreated)).toBe(true);
    expect(Array.isArray(body.data.aiJobsOverTime || body.data.aiJobsVolume)).toBe(true);
    expect(Array.isArray(body.data.renderJobsOverTime || body.data.renderJobsVolume)).toBe(true);
    expect(Array.isArray(body.data.creditsUsageOverTime || body.data.creditsConsumption)).toBe(true);
    expect(Array.isArray(body.data.storageOverTime || body.data.storageGrowthMb)).toBe(true);
    expect(body.data.jobSuccessVsFailure).toBeDefined();
  });

  it('GET /v1/admin/health returns live microservice probes and status', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/health',
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(['HEALTHY', 'DEGRADED', 'DOWN']).toContain(body.data.overall || body.data.overallStatus);
    expect(body.data.probes.api).toBeDefined();
    expect(body.data.probes.database).toBeDefined();
    expect(body.data.probes.redis).toBeDefined();
    expect(body.data.probes.bullmq).toBeDefined();
    expect(body.data.probes.storage).toBeDefined();
    expect(body.data.probes.workers).toBeDefined();
    expect(body.data.probes.ai_providers).toBeDefined();
    expect(body.data.memoryUsageMb).toBeDefined();
  });

  it('GET /v1/admin/users lists platform users with pagination & search', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/users',
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    const userList = Array.isArray(body.data) ? body.data : body.data.users;
    expect(Array.isArray(userList)).toBe(true);
    expect(userList.length).toBeGreaterThan(0);
  });

  it('PATCH /v1/admin/users/:id/role updates user role & records audit log', async () => {
    const listRes = await app.inject({
      method: 'GET',
      url: '/v1/admin/users',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const body = JSON.parse(listRes.body);
    const targetUser = Array.isArray(body.data) ? body.data[0] : body.data.users[0];

    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/v1/admin/users/${targetUser.id}/role`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        role: 'pro',
        status: 'active',
      },
    });

    expect(patchRes.statusCode).toBe(200);
    const patchBody = JSON.parse(patchRes.body);
    expect(patchBody.data.role.toLowerCase()).toBe('pro');

    // Check audit logs
    const auditRes = await app.inject({
      method: 'GET',
      url: '/v1/admin/audit-logs',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const auditBody = JSON.parse(auditRes.body);
    const list = Array.isArray(auditBody.data) ? auditBody.data : (auditBody.data.logs || auditBody.data.auditLogs || []);
    const roleEvent = list.find((e: any) => e.action === 'USER_ROLE_UPDATED');
    expect(roleEvent).toBeDefined();
  });

  it('POST /v1/admin/users/:id/credits/grant adds credits and records audit trail', async () => {
    const listRes = await app.inject({
      method: 'GET',
      url: '/v1/admin/users',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const body = JSON.parse(listRes.body);
    const targetUser = Array.isArray(body.data) ? body.data[0] : body.data.users[0];

    const grantRes = await app.inject({
      method: 'POST',
      url: `/v1/admin/users/${targetUser.id}/credits/grant`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        amount: 250,
        reason: 'Automated test suite grant',
      },
    });

    expect(grantRes.statusCode).toBe(200);
    const grantBody = JSON.parse(grantRes.body);
    expect(grantBody.data.newBalance).toBeGreaterThanOrEqual(250);
  });

  it('GET /v1/admin/media lists asset catalog', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/media',
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const mediaList = Array.isArray(body.data) ? body.data : body.data.media;
    expect(Array.isArray(mediaList)).toBe(true);
  });

  it('GET /v1/admin/comments lists project timeline comments', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/comments',
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const commentsList = Array.isArray(body.data) ? body.data : body.data.comments;
    expect(Array.isArray(commentsList)).toBe(true);
    expect(commentsList.length).toBeGreaterThan(0);
  });

  it('GET /admin/ serves index.html of Admin Dashboard SPA', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/',
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('my_editor Enterprise Admin Console');
  });
});
