import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import websocket from '@fastify/websocket';
import { v4 as uuidv4 } from 'uuid';

import { env } from './config/env.js';
import { logger } from './core/logger.js';
import { AppError } from './core/errors.js';
import { createErrorResponse, createSuccessResponse } from './core/response.js';

import { db } from './database/client.js';
import { redisService } from './services/redis/index.js';
import { storageService } from './services/storage/index.js';

// Route modules
import { authRoutes } from './modules/auth/auth.routes.js';
import { authController } from './modules/auth/auth.controller.js';
import { authenticate } from './modules/auth/auth.middleware.js';
import { projectsRoutes } from './modules/projects/projects.routes.js';
import { mediaRoutes } from './modules/media/media.routes.js';
import { creditsRoutes } from './modules/credits/credits.routes.js';
import { subscriptionsRoutes } from './modules/subscriptions/subscriptions.routes.js';
import { aiRoutes } from './modules/ai/ai.routes.js';
import { jobsRoutes } from './modules/jobs/jobs.routes.js';
import { webhooksRoutes } from './modules/webhooks/webhooks.routes.js';
import { collaborationWsRoutes } from './modules/collaboration/collaboration.ws.js';
import { mediaProgressWsRoutes } from './modules/media/media-progress.ws.js';
import { aiJobWsRoutes } from './modules/ai/jobs/ai-job.ws.js';
import { registerQueueProcessors } from './services/queue/processors.js';

export async function buildApp(): Promise<FastifyInstance> {
  // Ensure background queue processors are registered
  registerQueueProcessors();
  const app = Fastify({
    logger: false, // We use custom Pino integration with request IDs
    genReqId: (req) => {
      const headerId = req.headers['x-request-id'];
      if (typeof headerId === 'string' && headerId.length > 0) {
        return headerId;
      }
      return uuidv4();
    },
    disableRequestLogging: true,
  });

  // Request ID logging hook
  app.addHook('onRequest', async (req) => {
    req.headers['x-request-id'] = req.id;
    logger.info(
      {
        reqId: req.id,
        method: req.method,
        url: req.url,
        ip: req.ip,
      },
      'Incoming HTTP Request'
    );
  });

  app.addHook('onResponse', async (req, reply) => {
    logger.info(
      {
        reqId: req.id,
        method: req.method,
        url: req.url,
        statusCode: reply.statusCode,
        responseTimeMs: reply.elapsedTime,
      },
      'HTTP Request Completed'
    );
  });

  // Security & Utility Plugins
  await app.register(sensible);
  await app.register(helmet, {
    contentSecurityPolicy: false, // Allow Swagger UI inline scripts
  });

  // Global Centralized Error Handler (RFC 7807 Problem Details)
  app.setErrorHandler((error, request, reply) => {
    const reqId = request.id;

    if (error instanceof AppError) {
      logger.warn({ reqId, err: error }, `Application Error [${error.code}]: ${error.message}`);
      return reply
        .status(error.statusCode)
        .send(createErrorResponse(error.code, error.message, error.details, reqId));
    }

    // Fastify built-in validation error
    if (error.validation) {
      logger.warn({ reqId, validation: error.validation }, 'Request validation failed');
      return reply
        .status(400)
        .send(createErrorResponse('VALIDATION_ERROR', 'Request validation failed', error.validation, reqId));
    }

    // Check if error has custom statusCode & code attached
    const statusCode = (error as any).statusCode || 500;
    const code = (error as any).code || 'INTERNAL_SERVER_ERROR';

    logger.error({ reqId, err: error }, 'Internal Server Error');
    return reply
      .status(statusCode)
      .send(
        createErrorResponse(
          code,
          env.NODE_ENV === 'production' && statusCode === 500
            ? 'An unexpected internal error occurred'
            : error.message,
          undefined,
          reqId
        )
      );
  });

  await app.register(cors, {
    origin: env.CORS_ORIGINS === '*' ? true : env.CORS_ORIGINS.split(','),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id'],
  });

  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW_MS,
  });

  // WebSocket Plugin
  await app.register(websocket);

  // OpenAPI (Swagger) Documentation
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'my_editor Backend API',
        description: 'Production Backend API for TechXayan Creative my_editor Video Editor (Windows + Android)',
        version: '1.0.0',
      },
      servers: [
        {
          url: `http://localhost:${env.PORT}`,
          description: 'Local Development Server',
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
      tags: [
        { name: 'System', description: 'System health & diagnostics' },
        { name: 'Authentication', description: 'User registration, login, and token management' },
        { name: 'Projects', description: 'Video editor projects, timelines, tracks, and metadata' },
        { name: 'Media Assets', description: 'Presigned S3 asset uploads and media catalog' },
        { name: 'AI Video Services', description: 'Whisper transcription, smart-cut silences, captions, and B-roll' },
        { name: 'Render & Processing Jobs', description: 'Asynchronous video timeline rendering export queue' },
        { name: 'Credits & Billing', description: 'User AI/rendering credit wallet and transaction history' },
        { name: 'Subscriptions', description: 'Subscription tiers (Free, Pro, Studio) and billing' },
        { name: 'Webhooks', description: 'Stripe payments and external media worker callbacks' },
      ],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
  });

  // Health Checks
  app.get(
    '/health',
    {
      schema: {
        description: 'Liveness check endpoint',
        tags: ['System'],
      },
    },
    async (_req, reply) => {
      return reply.status(200).send(
        createSuccessResponse({
          status: 'healthy',
          timestamp: new Date().toISOString(),
          uptimeSeconds: Math.floor(process.uptime()),
        })
      );
    }
  );

  app.get(
    '/ready',
    {
      schema: {
        description: 'Readiness check verifying database, redis, and storage dependencies',
        tags: ['System'],
      },
    },
    async (_req, reply) => {
      const dbReady = await db.isHealthy();
      const redisReady = await redisService.isHealthy();
      const storageReady = await storageService.isHealthy();

      const allReady = dbReady && redisReady && storageReady;
      const status = allReady ? 200 : 503;

      return reply.status(status).send(
        createSuccessResponse({
          ready: allReady,
          services: {
            database: dbReady ? 'connected' : 'degraded',
            redis: redisReady ? 'connected' : 'degraded',
            storage: storageReady ? 'connected' : 'degraded',
          },
        })
      );
    }
  );

  // Register WebSocket Collaboration, Media Progress & AI Job Routes
  await app.register(collaborationWsRoutes);
  await app.register(mediaProgressWsRoutes);
  await app.register(aiJobWsRoutes);

  // Register API v1 Routes
  const registerV1Modules = async (v1: FastifyInstance) => {
    await v1.register(authRoutes, { prefix: '/auth' });
    await v1.register(projectsRoutes, { prefix: '/projects' });
    await v1.register(mediaRoutes, { prefix: '/media' });
    await v1.register(creditsRoutes, { prefix: '/credits' });
    await v1.register(subscriptionsRoutes, { prefix: '/subscriptions' });
    await v1.register(aiRoutes, { prefix: '/ai' });
    await v1.register(jobsRoutes, { prefix: '/jobs' });
    await v1.register(webhooksRoutes, { prefix: '/webhooks' });

    // Direct /me endpoints
    v1.get('/me', { preHandler: [authenticate] }, authController.getMe.bind(authController));
    v1.patch('/me', { preHandler: [authenticate] }, authController.updateMe.bind(authController));
    v1.delete('/me', { preHandler: [authenticate] }, authController.deleteMe.bind(authController));
  };

  // Register on both /api/v1 and /v1 for complete client compatibility
  await app.register(registerV1Modules, { prefix: '/api/v1' });
  await app.register(registerV1Modules, { prefix: '/v1' });

  return app;
}
