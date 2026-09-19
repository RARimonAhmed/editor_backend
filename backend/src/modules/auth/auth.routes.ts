import { FastifyInstance } from 'fastify';
import { authController } from './auth.controller.js';
import { authenticate } from './auth.middleware.js';

export async function authRoutes(fastify: FastifyInstance) {
  // Register
  fastify.post(
    '/register',
    {
      schema: {
        description: 'Register a new user account',
        tags: ['Authentication'],
        body: {
          type: 'object',
          required: ['email', 'password', 'displayName'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 8 },
            displayName: { type: 'string', minLength: 2 },
          },
        },
      },
    },
    authController.register.bind(authController)
  );

  // Login
  fastify.post(
    '/login',
    {
      schema: {
        description: 'Authenticate user and return JWT tokens',
        tags: ['Authentication'],
        body: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string' },
          },
        },
      },
    },
    authController.login.bind(authController)
  );

  // Refresh Token
  fastify.post(
    '/refresh',
    {
      schema: {
        description: 'Generate fresh access token using refresh token',
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

  // Get current user profile (Authenticated)
  fastify.get(
    '/me',
    {
      preHandler: [authenticate],
      schema: {
        description: 'Retrieve current authenticated user profile',
        tags: ['Authentication'],
        security: [{ bearerAuth: [] }],
      },
    },
    authController.getMe.bind(authController)
  );
}
