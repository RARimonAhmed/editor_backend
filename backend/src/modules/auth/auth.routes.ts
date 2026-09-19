import { FastifyInstance } from 'fastify';
import { authController } from './auth.controller.js';
import { authenticate } from './auth.middleware.js';

export async function authRoutes(fastify: FastifyInstance) {
  // 1. Register
  fastify.post(
    '/register',
    {
      schema: {
        description: 'Register a new user account with optional device tracking',
        tags: ['Authentication'],
        body: {
          type: 'object',
          required: ['email', 'password', 'displayName'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 8 },
            displayName: { type: 'string', minLength: 2 },
            device: {
              type: 'object',
              properties: {
                deviceFingerprint: { type: 'string' },
                deviceType: { type: 'string', enum: ['windows', 'android', 'web', 'macos'] },
                deviceName: { type: 'string' },
                osVersion: { type: 'string' },
                appVersion: { type: 'string' },
              },
            },
          },
        },
      },
    },
    authController.register.bind(authController)
  );

  // 2. Login
  fastify.post(
    '/login',
    {
      schema: {
        description: 'Authenticate user with credentials (brute-force protected)',
        tags: ['Authentication'],
        body: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string' },
            device: { type: 'object' },
          },
        },
      },
    },
    authController.login.bind(authController)
  );

  // 3. OAuth Sign-In (Google / Apple / Extensible)
  fastify.post(
    '/oauth/:provider',
    {
      schema: {
        description: 'Sign in or register with OAuth provider (Google Sign-In, Apple Sign-In)',
        tags: ['Authentication'],
        params: {
          type: 'object',
          required: ['provider'],
          properties: {
            provider: { type: 'string', enum: ['google', 'apple'] },
          },
        },
        body: {
          type: 'object',
          required: ['idToken'],
          properties: {
            idToken: { type: 'string' },
            device: { type: 'object' },
          },
        },
      },
    },
    authController.loginOAuth.bind(authController)
  );

  // 4. Refresh Token (with Rotation & Reuse Detection)
  fastify.post(
    '/refresh',
    {
      schema: {
        description: 'Rotate refresh token and obtain new access token (reuse detection enabled)',
        tags: ['Authentication'],
        body: {
          type: 'object',
          required: ['refreshToken'],
          properties: {
            refreshToken: { type: 'string' },
          },
        },
      },
    },
    authController.refreshToken.bind(authController)
  );

  // 5. Logout
  fastify.post(
    '/logout',
    {
      schema: {
        description: 'Revoke active refresh token and current session',
        tags: ['Authentication'],
        body: {
          type: 'object',
          properties: {
            refreshToken: { type: 'string' },
          },
        },
      },
    },
    authController.logout.bind(authController)
  );

  // 6. Logout All Sessions
  fastify.post(
    '/logout-all',
    {
      preHandler: [authenticate],
      schema: {
        description: 'Revoke all active user sessions across all devices',
        tags: ['Authentication'],
        security: [{ bearerAuth: [] }],
      },
    },
    authController.logoutAll.bind(authController)
  );

  // 7. Forgot Password
  fastify.post(
    '/forgot-password',
    {
      schema: {
        description: 'Request a password reset link token',
        tags: ['Authentication'],
        body: {
          type: 'object',
          required: ['email'],
          properties: {
            email: { type: 'string', format: 'email' },
          },
        },
      },
    },
    authController.forgotPassword.bind(authController)
  );

  // 8. Reset Password
  fastify.post(
    '/reset-password',
    {
      schema: {
        description: 'Set a new password using reset token and terminate all sessions',
        tags: ['Authentication'],
        body: {
          type: 'object',
          required: ['token', 'newPassword'],
          properties: {
            token: { type: 'string' },
            newPassword: { type: 'string', minLength: 8 },
          },
        },
      },
    },
    authController.resetPassword.bind(authController)
  );

  // 9. Profile Management (/me endpoints)
  fastify.get(
    '/me',
    {
      preHandler: [authenticate],
      schema: {
        description: 'Get authenticated user profile and preferences',
        tags: ['Authentication'],
        security: [{ bearerAuth: [] }],
      },
    },
    authController.getMe.bind(authController)
  );

  fastify.patch(
    '/me',
    {
      preHandler: [authenticate],
      schema: {
        description: 'Update authenticated user profile or preferences',
        tags: ['Authentication'],
        security: [{ bearerAuth: [] }],
      },
    },
    authController.updateMe.bind(authController)
  );

  fastify.delete(
    '/me',
    {
      preHandler: [authenticate],
      schema: {
        description: 'Soft-delete user account and terminate all active sessions',
        tags: ['Authentication'],
        security: [{ bearerAuth: [] }],
      },
    },
    authController.deleteMe.bind(authController)
  );
}
