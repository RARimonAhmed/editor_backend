import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { authService, mockUsers } from '../src/modules/auth/auth.service.js';
import { mockAuditLogs } from '../src/modules/admin/admin.service.js';

describe('Admin User Management & RBAC Security Suite', () => {
  let app: FastifyInstance;
  let superadminToken: string;
  let regularAdminToken: string;
  let testUserId: string;
  let testUserEmail: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    // 1. Authenticate as default superadmin (admin@techxayan.com)
    const superLogin = await app.inject({
      method: 'POST',
      url: '/v1/admin/login',
      payload: {
        email: 'admin@techxayan.com',
        password: 'Admin123!',
      },
    });
    expect(superLogin.statusCode).toBe(200);
    const superBody = JSON.parse(superLogin.body);
    superadminToken = superBody.data.tokens.accessToken;

    // 2. Register a standard user to act as test target
    testUserEmail = `target_user_${Date.now()}@example.com`;
    const regRes = await authService.register({
      email: testUserEmail,
      password: 'TargetPassword123!',
      displayName: 'Alice Montgomery',
    });
    testUserId = regRes.user.id;

    // 3. Create a second administrative user with role 'ADMIN' (non-superadmin) to test RBAC boundaries
    const subAdminEmail = `ops_admin_${Date.now()}@techxayan.com`;
    const subAdminReg = await authService.register({
      email: subAdminEmail,
      password: 'AdminPassword123!',
      displayName: 'Operational Admin',
    });
    const subAdminObj = mockUsers.get(subAdminReg.user.id)!;
    subAdminObj.role = 'ADMIN';

    // Sign a token for the standard admin
    regularAdminToken = authService.signAccessToken({
      userId: subAdminObj.id,
      sessionId: 'session_regular_admin',
      email: subAdminObj.email,
      role: 'ADMIN',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  // ============================================================================
  // 1. LIST USERS: SEARCH, FILTER, SORT, PAGINATION
  // ============================================================================

  it('GET /v1/admin/users returns server-side paginated list with total & totalPages', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/users?page=1&pageSize=5',
      headers: { authorization: `Bearer ${superadminToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.users).toBeDefined();
    expect(Array.isArray(body.data.users)).toBe(true);
    expect(body.data.total).toBeGreaterThanOrEqual(1);
    expect(body.data.page).toBe(1);
    expect(body.data.pageSize).toBe(5);
    expect(body.data.totalPages).toBeGreaterThanOrEqual(1);

    // Verify user object fields
    const first = body.data.users[0];
    expect(first.id).toBeDefined();
    expect(first.email).toBeDefined();
    expect(first.displayName).toBeDefined();
    expect(first.role).toBeDefined();
    expect(first.status).toBeDefined();
    expect(typeof first.creditBalance).toBe('number');
    expect(typeof first.projectsCount).toBe('number');
    expect(first.createdAt).toBeDefined();
    // Security check: passwords must NEVER leak
    expect((first as any).password).toBeUndefined();
    expect((first as any).password_hash).toBeUndefined();
  });

  it('GET /v1/admin/users searches by name, email, and user ID', async () => {
    // 1. Search by name
    const resName = await app.inject({
      method: 'GET',
      url: `/v1/admin/users?search=Alice`,
      headers: { authorization: `Bearer ${superadminToken}` },
    });
    expect(resName.statusCode).toBe(200);
    const bodyName = JSON.parse(resName.body);
    expect(bodyName.data.users.some((u: any) => u.id === testUserId)).toBe(true);

    // 2. Search by email
    const resEmail = await app.inject({
      method: 'GET',
      url: `/v1/admin/users?search=${encodeURIComponent(testUserEmail)}`,
      headers: { authorization: `Bearer ${superadminToken}` },
    });
    expect(resEmail.statusCode).toBe(200);
    const bodyEmail = JSON.parse(resEmail.body);
    expect(bodyEmail.data.users.some((u: any) => u.id === testUserId)).toBe(true);

    // 3. Search by user ID
    const resId = await app.inject({
      method: 'GET',
      url: `/v1/admin/users?search=${testUserId}`,
      headers: { authorization: `Bearer ${superadminToken}` },
    });
    expect(resId.statusCode).toBe(200);
    const bodyId = JSON.parse(resId.body);
    expect(bodyId.data.users.length).toBe(1);
    expect(bodyId.data.users[0].id).toBe(testUserId);
  });

  it('GET /v1/admin/users filters by role, status, and subscription', async () => {
    // Filter by role = SUPERADMIN
    const resRole = await app.inject({
      method: 'GET',
      url: `/v1/admin/users?role=SUPERADMIN`,
      headers: { authorization: `Bearer ${superadminToken}` },
    });
    expect(resRole.statusCode).toBe(200);
    const bodyRole = JSON.parse(resRole.body);
    for (const u of bodyRole.data.users) {
      expect(u.role).toBe('SUPERADMIN');
    }

    // Filter by status = active
    const resStatus = await app.inject({
      method: 'GET',
      url: `/v1/admin/users?status=active`,
      headers: { authorization: `Bearer ${superadminToken}` },
    });
    expect(resStatus.statusCode).toBe(200);
    const bodyStatus = JSON.parse(resStatus.body);
    for (const u of bodyStatus.data.users) {
      expect(u.status).toBe('active');
    }
  });

  it('GET /v1/admin/users sorts by created date and name', async () => {
    // Sort by name asc
    const resSortName = await app.inject({
      method: 'GET',
      url: `/v1/admin/users?sortBy=name&sortOrder=asc`,
      headers: { authorization: `Bearer ${superadminToken}` },
    });
    expect(resSortName.statusCode).toBe(200);
    const bodySortName = JSON.parse(resSortName.body);
    const names = bodySortName.data.users.map((u: any) => u.displayName.toLowerCase());
    for (let i = 0; i < names.length - 1; i++) {
      expect(names[i].localeCompare(names[i + 1])).toBeLessThanOrEqual(0);
    }
  });

  // ============================================================================
  // 2. USER DETAILS INSPECTION
  // ============================================================================

  it('GET /v1/admin/users/:id returns rich inspection view without secret leaks', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/admin/users/${testUserId}`,
      headers: { authorization: `Bearer ${superadminToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    const details = body.data;

    // Verify Profile
    expect(details.profile).toBeDefined();
    expect(details.profile.id).toBe(testUserId);
    expect(details.profile.email).toBe(testUserEmail);
    expect(details.profile.displayName).toBe('Alice Montgomery');
    expect(details.profile.status).toBe('active');
    expect((details.profile as any).password).toBeUndefined();
    expect((details.profile as any).password_hash).toBeUndefined();

    // Verify Sessions
    expect(Array.isArray(details.sessions)).toBe(true);
    for (const s of details.sessions) {
      expect(s.id).toBeDefined();
      expect(s.createdAt).toBeDefined();
      expect(s.expiresAt).toBeDefined();
      expect(s.isActive).toBeDefined();
      // Verify no raw token hashes leaked to admin UI
      expect((s as any).refreshTokenHash).toBeUndefined();
      expect((s as any).rotatedTokens).toBeUndefined();
    }

    // Verify Projects & Media
    expect(Array.isArray(details.projects)).toBe(true);
    expect(details.mediaUsage).toBeDefined();
    expect(typeof details.mediaUsage.totalFiles).toBe('number');
    expect(typeof details.mediaUsage.totalBytes).toBe('number');

    // Verify AI Usage
    expect(details.aiUsage).toBeDefined();
    expect(typeof details.aiUsage.totalJobs).toBe('number');
    expect(typeof details.aiUsage.totalTokens).toBe('number');

    // Verify Credit Ledger
    expect(details.creditTransactions).toBeDefined();
    expect(typeof details.creditTransactions.balance).toBe('number');
    expect(Array.isArray(details.creditTransactions.transactions)).toBe(true);

    // Verify Subscription
    expect(details.subscription).toBeDefined();
    expect(details.subscription.tier).toBeDefined();

    // Verify Audit Activity
    expect(Array.isArray(details.auditActivity)).toBeDefined();
  });

  it('GET /v1/admin/users/:id returns 404 for nonexistent user ID', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/admin/users/nonexistent_user_999`,
      headers: { authorization: `Bearer ${superadminToken}` },
    });

    expect(res.statusCode).toBe(404);
  });

  // ============================================================================
  // 3. ADMIN ACTIONS: DISABLE / ENABLE ACCOUNT
  // ============================================================================

  it('PATCH /v1/admin/users/:id/status disables account and writes audit record', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/admin/users/${testUserId}/status`,
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: {
        status: 'suspended',
        reason: 'Terms of service violation - excessive bandwidth',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.status).toBe('suspended');

    // Verify audit log
    const auditEvent = mockAuditLogs.find(
      (log) => log.action === 'USER_STATUS_UPDATED' && log.targetId === testUserId
    );
    expect(auditEvent).toBeDefined();
    expect(auditEvent?.details?.newStatus).toBe('suspended');
    expect(auditEvent?.details?.reason).toContain('excessive bandwidth');

    // Restore to active
    const restoreRes = await app.inject({
      method: 'PATCH',
      url: `/v1/admin/users/${testUserId}/status`,
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: {
        status: 'active',
        reason: 'Account reactivated after review',
      },
    });
    expect(restoreRes.statusCode).toBe(200);
    expect(JSON.parse(restoreRes.body).data.status).toBe('active');
  });

  // ============================================================================
  // 4. ADMIN ACTIONS: REVOKE SESSIONS
  // ============================================================================

  it('POST /v1/admin/users/:id/revoke-sessions revokes user sessions and records audit log', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/admin/users/${testUserId}/revoke-sessions`,
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(typeof body.data.revokedCount).toBe('number');

    // Verify audit record
    const auditEvent = mockAuditLogs.find(
      (log) => log.action === 'USER_SESSIONS_REVOKED' && log.targetId === testUserId
    );
    expect(auditEvent).toBeDefined();
  });

  // ============================================================================
  // 5. RBAC & SUPERADMIN-ONLY ROLE ESCALATION GUARDS
  // ============================================================================

  it('PATCH /v1/admin/users/:id/role updates role to PRO when executed by standard admin', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/admin/users/${testUserId}/role`,
      headers: { authorization: `Bearer ${regularAdminToken}` },
      payload: { role: 'pro' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.role).toBe('PRO');
  });

  it('PATCH /v1/admin/users/:id/role rejects role escalation to ADMIN when executed by non-superadmin', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/admin/users/${testUserId}/role`,
      headers: { authorization: `Bearer ${regularAdminToken}` },
      payload: { role: 'ADMIN' },
    });

    // Must be rejected with 403 Forbidden
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error?.message || body.message).toContain('SUPERADMIN');
  });

  it('PATCH /v1/admin/users/:id/role permits role escalation to ADMIN when executed by SUPERADMIN', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/admin/users/${testUserId}/role`,
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: { role: 'ADMIN' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.role).toBe('ADMIN');

    // Verify audit log
    const auditEvent = mockAuditLogs.find(
      (log) => log.action === 'USER_ROLE_UPDATED' && log.targetId === testUserId && log.details?.newRole === 'ADMIN'
    );
    expect(auditEvent).toBeDefined();
  });

  it('PATCH /v1/admin/users/:id/status rejects suspending a SUPERADMIN by a non-superadmin', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/admin/users/admin_super_master/status`,
      headers: { authorization: `Bearer ${regularAdminToken}` },
      payload: { status: 'suspended' },
    });

    expect(res.statusCode).toBe(403);
  });
});
