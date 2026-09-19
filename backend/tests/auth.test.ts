import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { buildApp } from '../src/app.js';
import { env } from '../src/config/env.js';

describe('Production Authentication & Identity Module', () => {
  let app: FastifyInstance;
  const testUser = {
    email: `creator_${Date.now()}@techxayan.com`,
    password: 'SecurePassword123!',
    displayName: 'TechXayan Creator',
  };

  let activeAccessToken: string;
  let activeRefreshToken: string;
  let activeUserId: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  // 1. REGISTRATION
  it('POST /v1/auth/register registers user and returns sanitized profile and tokens', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: testUser,
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.user.email).toBe(testUser.email.toLowerCase());
    expect(body.data.user.displayName).toBe(testUser.displayName);
    expect(body.data.tokens.accessToken).toBeDefined();
    expect(body.data.tokens.refreshToken).toBeDefined();

    // NEVER return secrets
    expect(body.data.user.password_hash).toBeUndefined();
    expect(body.data.user.password).toBeUndefined();
    expect(body.data.user.refresh_token_hash).toBeUndefined();

    activeAccessToken = body.data.tokens.accessToken;
    activeRefreshToken = body.data.tokens.refreshToken;
    activeUserId = body.data.user.id;
  });

  it('POST /v1/auth/register rejects duplicate email registration', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: testUser,
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('CONFLICT');
  });

  // 2. LOGIN & INVALID PASSWORD
  it('POST /v1/auth/login succeeds with correct password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: {
        email: testUser.email,
        password: testUser.password,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.tokens.accessToken).toBeDefined();
    expect(body.data.tokens.refreshToken).toBeDefined();

    // Update tokens
    activeAccessToken = body.data.tokens.accessToken;
    activeRefreshToken = body.data.tokens.refreshToken;
  });

  it('POST /v1/auth/login rejects invalid password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: {
        email: testUser.email,
        password: 'IncorrectPassword999!',
      },
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('AUTHENTICATION_ERROR');
  });

  // 3. EXPIRED TOKEN
  it('Rejects access when token has expired', async () => {
    // Generate an already-expired JWT token
    const expiredToken = jwt.sign(
      { userId: activeUserId, sessionId: 'fake-session', email: testUser.email, role: 'user' },
      env.JWT_SECRET,
      { expiresIn: '-10s' }
    );

    const res = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { Authorization: `Bearer ${expiredToken}` },
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('AUTHENTICATION_ERROR');
  });

  // 4. REFRESH TOKEN ROTATION & REUSE DETECTION
  it('POST /v1/auth/refresh rotates refresh token and invalidates previous token', async () => {
    const oldRefreshToken = activeRefreshToken;

    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken: oldRefreshToken },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.accessToken).toBeDefined();
    expect(body.data.refreshToken).toBeDefined();
    expect(body.data.refreshToken).not.toBe(oldRefreshToken);

    const newRefreshToken = body.data.refreshToken;
    activeAccessToken = body.data.accessToken;
    activeRefreshToken = newRefreshToken;

    // PRESENTING OLD TOKEN AGAIN MUST BE REJECTED (Reuse Detection)
    const reuseRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken: oldRefreshToken },
    });

    expect(reuseRes.statusCode).toBe(401);
    const reuseBody = JSON.parse(reuseRes.body);
    expect(reuseBody.success).toBe(false);
    expect(reuseBody.error.message).toMatch(/reuse detected/i);
  });

  // 5. SESSION REVOCATION (LOGOUT)
  it('POST /v1/auth/logout revokes session and prevents further authenticated requests', async () => {
    // 1. Perform login to create distinct session
    const loginRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: testUser.email, password: testUser.password },
    });
    const { accessToken, refreshToken } = JSON.parse(loginRes.body).data.tokens;

    // 2. Verify token works
    const check1 = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(check1.statusCode).toBe(200);

    // 3. Logout
    const logoutRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      headers: { Authorization: `Bearer ${accessToken}` },
      payload: { refreshToken },
    });
    expect(logoutRes.statusCode).toBe(200);

    // 4. Request with revoked session must be rejected
    const check2 = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(check2.statusCode).toBe(401);
  });

  // 6. PASSWORD RESET FLOW
  it('Executes forgot-password and reset-password flow successfully', async () => {
    // 1. Forgot password
    const forgotRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/forgot-password',
      payload: { email: testUser.email },
    });
    expect(forgotRes.statusCode).toBe(200);
    const resetToken = JSON.parse(forgotRes.body).data.resetToken;
    expect(resetToken).toBeDefined();

    // 2. Reset password with new password
    const newPassword = 'BrandNewPassword2026!';
    const resetRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/reset-password',
      payload: { token: resetToken, newPassword },
    });
    expect(resetRes.statusCode).toBe(200);

    // 3. Old password must now fail
    const oldLogin = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: testUser.email, password: testUser.password },
    });
    expect(oldLogin.statusCode).toBe(401);

    // 4. New password must now succeed
    const newLogin = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: testUser.email, password: newPassword },
    });
    expect(newLogin.statusCode).toBe(200);
    activeAccessToken = JSON.parse(newLogin.body).data.tokens.accessToken;
  });

  // 7. PROFILE UPDATE & ME
  it('GET /v1/me and PATCH /v1/me retrieves and updates user profile', async () => {
    const patchRes = await app.inject({
      method: 'PATCH',
      url: '/v1/me',
      headers: { Authorization: `Bearer ${activeAccessToken}` },
      payload: {
        displayName: 'Updated Creative Director',
        bio: 'Award-winning video editor and colorist.',
      },
    });

    expect(patchRes.statusCode).toBe(200);
    const patchBody = JSON.parse(patchRes.body);
    expect(patchBody.data.displayName).toBe('Updated Creative Director');

    const getRes = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { Authorization: `Bearer ${activeAccessToken}` },
    });
    expect(getRes.statusCode).toBe(200);
    const getBody = JSON.parse(getRes.body);
    expect(getBody.data.displayName).toBe('Updated Creative Director');
    expect(getBody.data.bio).toBe('Award-winning video editor and colorist.');
  });

  // 8. OAUTH PROVIDERS (GOOGLE & APPLE)
  it('POST /v1/auth/oauth/google authenticates Google Sign-In users', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/oauth/google',
      payload: {
        idToken: 'mock-google-token:google.editor@techxayan.com',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.user.email).toBe('google.editor@techxayan.com');
    expect(body.data.tokens.accessToken).toBeDefined();
  });

  it('POST /v1/auth/oauth/apple authenticates Apple Sign-In users', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/oauth/apple',
      payload: {
        idToken: 'mock-apple-token:apple.editor@techxayan.com',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.user.email).toBe('apple.editor@techxayan.com');
    expect(body.data.tokens.accessToken).toBeDefined();
  });

  // 9. BRUTE-FORCE PROTECTION & RATE LIMITING
  it('Enforces brute-force lockout after consecutive failed login attempts', async () => {
    const targetEmail = `bruteforce_${Date.now()}@techxayan.com`;

    // Register user first
    await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: targetEmail, password: 'ValidPassword123!', displayName: 'Brute Target' },
    });

    // 5 consecutive failed attempts
    for (let i = 0; i < 5; i++) {
      await app.inject({
        method: 'POST',
        url: '/v1/auth/login',
        payload: { email: targetEmail, password: 'WrongPassword!' },
      });
    }

    // 6th attempt must return 429 RATE_LIMIT_EXCEEDED
    const lockedRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: targetEmail, password: 'WrongPassword!' },
    });

    expect(lockedRes.statusCode).toBe(429);
    const lockedBody = JSON.parse(lockedRes.body);
    expect(lockedBody.success).toBe(false);
    expect(lockedBody.error.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(lockedBody.error.message).toMatch(/temporarily locked/i);
  });

  // 10. ACCOUNT DELETION
  it('DELETE /v1/me soft-deletes account and blocks subsequent logins', async () => {
    const deleteEmail = `delete_me_${Date.now()}@techxayan.com`;
    const deletePass = 'Password123!';

    // Register user
    const regRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: deleteEmail, password: deletePass, displayName: 'Delete Me User' },
    });
    const token = JSON.parse(regRes.body).data.tokens.accessToken;

    // Delete account
    const delRes = await app.inject({
      method: 'DELETE',
      url: '/v1/me',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(delRes.statusCode).toBe(200);
    expect(JSON.parse(delRes.body).data.deleted).toBe(true);

    // Subsequent login must be rejected
    const loginRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: deleteEmail, password: deletePass },
    });
    expect(loginRes.statusCode).toBe(401);
  });

  // 11. LOGOUT-ALL SESSIONS
  it('POST /v1/auth/logout-all terminates all sessions across all devices', async () => {
    const multiSessionEmail = `multisession_${Date.now()}@techxayan.com`;
    const password = 'MultiSessionPassword123!';

    // Register user
    await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: multiSessionEmail, password, displayName: 'Multi Device User' },
    });

    // Login from Device 1 (Windows)
    const dev1Res = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: {
        email: multiSessionEmail,
        password,
        device: { deviceFingerprint: 'win-pc-01', deviceType: 'windows', deviceName: 'Windows Workstation' },
      },
    });
    const dev1Token = JSON.parse(dev1Res.body).data.tokens.accessToken;

    // Login from Device 2 (Android)
    const dev2Res = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: {
        email: multiSessionEmail,
        password,
        device: { deviceFingerprint: 'android-tab-01', deviceType: 'android', deviceName: 'Android Studio Tablet' },
      },
    });
    const dev2Token = JSON.parse(dev2Res.body).data.tokens.accessToken;

    // Both tokens work
    expect((await app.inject({ method: 'GET', url: '/v1/me', headers: { Authorization: `Bearer ${dev1Token}` } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/v1/me', headers: { Authorization: `Bearer ${dev2Token}` } })).statusCode).toBe(200);

    // Call logout-all from Device 1
    const logoutAllRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/logout-all',
      headers: { Authorization: `Bearer ${dev1Token}` },
    });
    expect(logoutAllRes.statusCode).toBe(200);
    expect(JSON.parse(logoutAllRes.body).data.loggedOutAll).toBe(true);

    // BOTH tokens must now be rejected
    expect((await app.inject({ method: 'GET', url: '/v1/me', headers: { Authorization: `Bearer ${dev1Token}` } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/v1/me', headers: { Authorization: `Bearer ${dev2Token}` } })).statusCode).toBe(401);
  });

  // 12. EMAIL VERIFICATION FLOW
  it('Executes email verification architecture with single-use verification token', async () => {
    const unverifiedEmail = `verify_me_${Date.now()}@techxayan.com`;

    // 1. Register unverified user
    const regRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: unverifiedEmail,
        password: 'SecurePassword123!',
        displayName: 'Unverified Creator',
      },
    });
    expect(regRes.statusCode).toBe(201);
    const regBody = JSON.parse(regRes.body);
    expect(regBody.data.user.emailVerified).toBe(false);
    const accessToken = regBody.data.tokens.accessToken;

    // 2. Request verification email token
    const resendRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/resend-verification',
      payload: { email: unverifiedEmail },
    });
    expect(resendRes.statusCode).toBe(200);
    const resendBody = JSON.parse(resendRes.body);
    expect(resendBody.data.verificationToken).toBeDefined();
    const token = resendBody.data.verificationToken;

    // 3. Confirm email with token
    const verifyRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/verify-email',
      payload: { token },
    });
    expect(verifyRes.statusCode).toBe(200);
    const verifyBody = JSON.parse(verifyRes.body);
    expect(verifyBody.success).toBe(true);

    // 4. Token cannot be reused (single-use guarantee)
    const reuseVerifyRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/verify-email',
      payload: { token },
    });
    expect(reuseVerifyRes.statusCode).toBe(401);

    // 5. Fetch profile and verify emailVerified status is true
    const meRes = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(meRes.statusCode).toBe(200);
    const meBody = JSON.parse(meRes.body);
    expect(meBody.data.emailVerified).toBe(true);
  });
});
