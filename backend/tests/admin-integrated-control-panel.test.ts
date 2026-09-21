import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { authService } from '../src/modules/auth/auth.service.js';
import { adminService, mockAuditLogs } from '../src/modules/admin/admin.service.js';

describe('Enterprise Admin Integrated Control Panel Test Suite', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let superAdminToken: string;
  let regularUserToken: string;

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

    // 2. Superadmin token via signing
    superAdminToken = authService.signAccessToken({
      userId: 'usr_superadmin',
      sessionId: 'sess_superadmin_01',
      email: 'superadmin@techxayan.com',
      role: 'SUPERADMIN',
    });

    // 3. Regular user token for RBAC boundary testing
    regularUserToken = authService.signAccessToken({
      userId: 'usr_regular_person',
      sessionId: 'sess_regular_01',
      email: 'regular@techxayan.com',
      role: 'USER',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('1. Enterprise System Health Probes', () => {
    it('should return health report covering all 8 core infrastructure components', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/admin/system/health',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      const health = body.data;

      expect(health.overallStatus).toBeDefined();
      expect(health.probes).toBeDefined();

      const requiredComponents = [
        'api',
        'postgresql',
        'redis',
        'bullmq',
        'storage',
        'workers',
        'ffmpeg',
        'ai_providers',
      ];

      for (const comp of requiredComponents) {
        expect(health.probes[comp], `Component ${comp} probe missing`).toBeDefined();
        const probe = health.probes[comp];
        expect(probe.service).toBeDefined();
        expect(['HEALTHY', 'DEGRADED', 'DOWN']).toContain(probe.status);
        expect(typeof probe.latencyMs).toBe('number');
        expect(probe.lastChecked).toBeDefined();
        expect(probe.errorSummary !== undefined).toBe(true);
      }

      // Check FFmpeg specific capabilities
      const ffmpegProbe = health.probes['ffmpeg'];
      expect(ffmpegProbe.details).toBeDefined();
      expect(Array.isArray(ffmpegProbe.details.supportedCodecs)).toBe(true);
      expect(ffmpegProbe.details.supportedCodecs).toContain('h264');
    });
  });

  describe('2. Security Audit Log & Zero Secret Exposure Guarantee', () => {
    it('should return security audit logs with actor, action, resource, targetId, and IP', async () => {
      // Record a sensitive audit entry with confidential keys
      adminService.recordAuditLog(
        'TEST_SENSITIVE_CREDENTIAL_CHANGE',
        'usr_test_admin',
        {
          databasePassword: 'super_secret_db_password_123',
          apiKey: 'AIzaSy_fake_google_key_9999999',
          stripeSecretKey: 'sk_live_fake_stripe_key_12345678',
          jwtToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy',
          safeOperationMode: 'high_concurrency',
        },
        'system_auth_module',
        'SYSTEM_SETTING',
        '10.0.0.42',
        'SUCCESS'
      );

      const res = await app.inject({
        method: 'GET',
        url: '/v1/admin/audit-logs',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      const logs = body.data.logs;
      expect(Array.isArray(logs)).toBe(true);
      expect(logs.length).toBeGreaterThan(0);

      // Verify that NO secret appears unredacted in any audit log details
      const serialized = JSON.stringify(logs);
      expect(serialized).not.toContain('super_secret_db_password_123');
      expect(serialized).not.toContain('AIzaSy_fake_google_key_9999999');
      expect(serialized).not.toContain('sk_live_fake_stripe_key_12345678');
      expect(serialized).toContain('[REDACTED_SECRET]');

      // Verify required fields on entries
      const latest = logs[0];
      expect(latest.actorId).toBeDefined();
      expect(latest.action).toBeDefined();
      expect(latest.resource).toBeDefined();
      expect(latest.timestamp).toBeDefined();
      expect(latest.result).toBeDefined();
    });
  });

  describe('3. Credits & Usage Monetization Telemetry', () => {
    it('should return total issued, consumed, refunded, customer wallets, and suspicious failures', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/admin/credits',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      const credits = body.data;

      expect(typeof credits.totalIssued).toBe('number');
      expect(typeof credits.totalConsumed).toBe('number');
      expect(typeof credits.totalRefunded).toBe('number');
      expect(typeof credits.totalCirculatingCredits).toBe('number');
      expect(typeof credits.totalWallets).toBe('number');

      // Wallets breakdown
      expect(Array.isArray(credits.wallets)).toBe(true);
      expect(credits.wallets.length).toBeGreaterThan(0);
      const wallet = credits.wallets[0];
      expect(wallet.userId).toBeDefined();
      expect(wallet.email).toBeDefined();
      expect(typeof wallet.balance).toBe('number');
      expect(wallet.subscriptionTier).toBeDefined();

      // Suspicious failures
      expect(Array.isArray(credits.suspiciousFailures)).toBe(true);
      expect(credits.suspiciousFailures.length).toBeGreaterThan(0);
      const failure = credits.suspiciousFailures[0];
      expect(failure.id).toBeDefined();
      expect(failure.reason).toBeDefined();
      expect(failure.severity).toBeDefined();
    });
  });

  describe('4. Subscriptions & Plan Distribution Telemetry', () => {
    it('should return Free, Pro, Studio breakdown, active/cancelled/expired counts, and Stripe webhook connectivity', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/admin/subscriptions',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      const subs = body.data;

      // Tier breakdown
      expect(subs.tierBreakdown).toBeDefined();
      expect(typeof subs.tierBreakdown.free).toBe('number');
      expect(typeof subs.tierBreakdown.pro).toBe('number');
      expect(typeof subs.tierBreakdown.studio).toBe('number');

      // Status breakdown
      expect(subs.statusBreakdown).toBeDefined();
      expect(typeof subs.statusBreakdown.active).toBe('number');
      expect(typeof subs.statusBreakdown.cancelled).toBe('number');
      expect(typeof subs.statusBreakdown.expired).toBe('number');

      // Webhook connectivity
      expect(subs.webhookStatus).toBeDefined();
      expect(['HEALTHY', 'DEGRADED', 'DOWN']).toContain(subs.webhookStatus.status);
      expect(subs.webhookStatus.lastEventReceived).toBeDefined();
      expect(typeof subs.webhookStatus.failureCount).toBe('number');

      // Subscriptions list
      expect(Array.isArray(subs.subscriptions)).toBe(true);
    });
  });

  describe('5. Safe Operational Settings & RBAC Security', () => {
    it('should return sanitized settings with status indicators and zero leaked secrets', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/admin/settings',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      const settings = body.data;

      // Check status indicators exist
      expect(settings.database.status).toBe('CONFIGURED');
      expect(settings.storage.credentialsStatus).toBe('CONFIGURED');
      expect(settings.aiGateway.geminiStatus).toBeDefined();
      expect(settings.billing.stripeStatus).toBeDefined();
      expect(settings.security.jwtSecretStatus).toBeDefined();

      // Ensure NO password or secret keys are present anywhere in payload
      const rawText = JSON.stringify(settings);
      expect(rawText).not.toContain('password');
      expect(rawText).not.toContain('AIzaSy');
      expect(rawText).not.toContain('sk_live');
      expect(rawText).not.toContain('secret_key');
    });

    it('should reject settings update if user is not SUPERADMIN', async () => {
      const moderatorToken = authService.signAccessToken({
        userId: 'usr_moderator_staff',
        sessionId: 'sess_mod_01',
        email: 'moderator@techxayan.com',
        role: 'ADMIN',
      });

      const res = await app.inject({
        method: 'PATCH',
        url: '/v1/admin/settings',
        headers: { authorization: `Bearer ${moderatorToken}` }, // ADMIN role, not SUPERADMIN
        payload: {
          rateLimitMax: 2000,
        },
      });

      expect(res.statusCode).toBe(403);
    });

    it('should allow SUPERADMIN to update safe operational settings and record audit log', async () => {
      const initialLogsCount = mockAuditLogs.length;

      const res = await app.inject({
        method: 'PATCH',
        url: '/v1/admin/settings',
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: {
          rateLimitMax: 1500,
          logLevel: 'debug',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.data.server.rateLimitMax).toBe(1500);
      expect(body.data.server.logLevel).toBe('debug');

      // Verify audit log was created
      expect(mockAuditLogs.length).toBeGreaterThan(initialLogsCount);
      const latestAudit = mockAuditLogs[mockAuditLogs.length - 1];
      expect(latestAudit.action).toBe('SETTINGS_UPDATED');
      expect(latestAudit.actorId).toBe('usr_superadmin');
    });

    it('should reject unauthenticated or non-admin access to any admin endpoints', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/admin/settings',
        headers: { authorization: `Bearer ${regularUserToken}` },
      });

      expect(res.statusCode).toBe(403);
    });
  });
});
