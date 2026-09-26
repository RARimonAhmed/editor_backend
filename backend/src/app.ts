import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

import { env } from './config/env.js';
import { logger } from './core/logger.js';
import { AppError } from './core/errors.js';
import { createErrorResponse, createSuccessResponse } from './core/response.js';

import { db } from './database/client.js';
import { redisService } from './services/redis/index.js';
import { storageService } from './services/storage/index.js';
import { jobQueue } from './services/queue/index.js';


// Route modules
import { authRoutes } from './modules/auth/auth.routes.js';
import { authController } from './modules/auth/auth.controller.js';
import { authenticate } from './modules/auth/auth.middleware.js';
import { projectsRoutes } from './modules/projects/projects.routes.js';
import { mediaRoutes } from './modules/media/media.routes.js';
import { creditsRoutes } from './modules/credits/credits.routes.js';
import { billingRoutes } from './modules/credits/billing.routes.js';
import { subscriptionsRoutes } from './modules/subscriptions/subscriptions.routes.js';

import { aiRoutes } from './modules/ai/ai.routes.js';
import { jobsRoutes } from './modules/jobs/jobs.routes.js';
import { webhooksRoutes } from './modules/webhooks/webhooks.routes.js';
import { collaborationRoutes } from './modules/collaboration/collaboration.routes.js';
import { collaborationWsRoutes } from './modules/collaboration/collaboration.ws.js';
import { mediaProgressWsRoutes } from './modules/media/media-progress.ws.js';
import { aiJobWsRoutes } from './modules/ai/jobs/ai-job.ws.js';
import { realtimeWsRoutes } from './modules/realtime/realtime.ws.js';
import { realtimeRoutes } from './modules/realtime/realtime.routes.js';
import { adminRoutes } from './modules/admin/admin.routes.js';
import { metricsService } from './core/metrics.service.js';
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

    // Fastify built-in validation error or Zod schema error
    if (error.validation || error.name === 'ZodError' || (error as any).issues) {
      logger.warn({ reqId, validation: error.validation || (error as any).issues }, 'Request validation failed');
      return reply
        .status(400)
        .send(createErrorResponse('VALIDATION_ERROR', 'Request validation failed', error.validation || (error as any).issues, reqId));
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
          (error as any).details,
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
    max: env.NODE_ENV === 'test' ? 100000 : env.RATE_LIMIT_MAX,
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

  // Root redirect to Swagger Documentation
  app.get('/', async (_req, reply) => {
    return reply.redirect('/docs');
  });

  // Health & Readiness Endpoints (Truthful multi-component diagnostic)
  app.get(
    '/health',
    {
      schema: {
        description: 'Truthful liveness and health diagnostics covering application, database, redis, storage, and queue',
        tags: ['System'],
      },
    },
    async (_req, reply) => {
      const [dbHealth, redisHealth, storageHealth, queueHealth] = await Promise.all([
        db.getHealthDetails().catch((err) => ({ healthy: false, driver: 'error' as const, error: err.message, latencyMs: -1 })),
        redisService.getHealthDetails().catch((err) => ({ healthy: false, driver: 'error' as const, error: err.message, latencyMs: -1 })),
        storageService.getHealthDetails().catch((err) => ({ healthy: false, driver: 'error' as const, bucket: env.STORAGE_BUCKET, error: err.message, latencyMs: -1 })),
        jobQueue.getHealthDetails().catch((err) => ({ healthy: false, driver: 'error' as const, error: err.message, activeWorkers: 0, totalQueues: 0 })),
      ]);

      const memUsage = process.memoryUsage();
      const isAllHealthy = dbHealth.healthy && redisHealth.healthy && storageHealth.healthy && queueHealth.healthy;
      const statusCode = isAllHealthy ? 200 : 503;

      return reply.status(statusCode).send(
        createSuccessResponse({
          status: isAllHealthy ? 'healthy' : 'degraded',
          timestamp: new Date().toISOString(),
          uptimeSeconds: Math.floor(process.uptime()),
          environment: env.NODE_ENV,
          allowDevFallbacks: env.ALLOW_DEV_FALLBACKS,
          components: {
            application: {
              healthy: true,
              version: '1.0.0',
              pid: process.pid,
              uptimeSeconds: Math.floor(process.uptime()),
              memoryUsageMb: {
                rss: Math.round(memUsage.rss / 1024 / 1024),
                heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
                heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
              },
            },
            database: dbHealth,
            redis: redisHealth,
            storage: storageHealth,
            queue: queueHealth,
          },
        })
      );
    }
  );

  app.get(
    '/ready',
    {
      schema: {
        description: 'Truthful readiness check verifying database, redis, storage, and queue dependencies',
        tags: ['System'],
      },
    },
    async (_req, reply) => {
      const [dbHealth, redisHealth, storageHealth, queueHealth] = await Promise.all([
        db.getHealthDetails().catch((err) => ({ healthy: false, driver: 'error' as const, error: err.message, latencyMs: -1 })),
        redisService.getHealthDetails().catch((err) => ({ healthy: false, driver: 'error' as const, error: err.message, latencyMs: -1 })),
        storageService.getHealthDetails().catch((err) => ({ healthy: false, driver: 'error' as const, bucket: env.STORAGE_BUCKET, error: err.message, latencyMs: -1 })),
        jobQueue.getHealthDetails().catch((err) => ({ healthy: false, driver: 'error' as const, error: err.message, activeWorkers: 0, totalQueues: 0 })),
      ]);

      const allReady = dbHealth.healthy && redisHealth.healthy && storageHealth.healthy && queueHealth.healthy;
      const statusCode = allReady ? 200 : 503;

      return reply.status(statusCode).send(
        createSuccessResponse({
          ready: allReady,
          timestamp: new Date().toISOString(),
          services: {
            database: dbHealth.healthy ? 'connected' : 'degraded',
            redis: redisHealth.healthy ? 'connected' : 'degraded',
            storage: storageHealth.healthy ? 'connected' : 'degraded',
            queue: queueHealth.healthy ? 'ready' : 'degraded',
          },
          components: {
            application: 'ready',
            database: dbHealth.healthy ? 'connected' : 'degraded',
            redis: redisHealth.healthy ? 'connected' : 'degraded',
            storage: storageHealth.healthy ? 'connected' : 'degraded',
            queue: queueHealth.healthy ? 'ready' : 'degraded',
          },
          details: {
            database: dbHealth,
            redis: redisHealth,
            storage: storageHealth,
            queue: queueHealth,
          },
        })
      );
    }
  );

  app.get(
    '/metrics',
    {
      schema: {
        description: 'System telemetry, health, queue depths, and performance metrics',
        tags: ['System'],
      },
    },
    async (_req, reply) => {
      const metrics = await metricsService.getMetrics();
      return reply.status(200).send(createSuccessResponse(metrics));
    }
  );

  // Register WebSocket Collaboration, Media Progress, AI Job & Unified Realtime Routes
  await app.register(collaborationWsRoutes);
  await app.register(mediaProgressWsRoutes);
  await app.register(aiJobWsRoutes);
  await app.register(realtimeWsRoutes);

  // Register API v1 Routes
  const registerV1Modules = async (v1: FastifyInstance) => {
    await v1.register(authRoutes, { prefix: '/auth' });
    await v1.register(projectsRoutes, { prefix: '/projects' });
    await v1.register(mediaRoutes, { prefix: '/media' });
    await v1.register(creditsRoutes, { prefix: '/credits' });
    await v1.register(billingRoutes, { prefix: '/billing' });
    await v1.register(subscriptionsRoutes, { prefix: '/subscriptions' });
    await v1.register(collaborationRoutes);
    await v1.register(aiRoutes, { prefix: '/ai' });
    await v1.register(jobsRoutes, { prefix: '/jobs' });
    await v1.register(webhooksRoutes, { prefix: '/webhooks' });
    await v1.register(adminRoutes, { prefix: '/admin' });
    await v1.register(realtimeRoutes);

    // Direct /me endpoints
    v1.get('/me', { preHandler: [authenticate] }, authController.getMe.bind(authController));
    v1.patch('/me', { preHandler: [authenticate] }, authController.updateMe.bind(authController));
    v1.delete('/me', { preHandler: [authenticate] }, authController.deleteMe.bind(authController));
  };

  // Register on both /api/v1 and /v1 for complete client compatibility
  await app.register(registerV1Modules, { prefix: '/api/v1' });
  await app.register(registerV1Modules, { prefix: '/v1' });

  // Direct root aliases for Flutter clients configured without /v1 base URL prefix
  await app.register(aiRoutes, { prefix: '/ai' });
  await app.register(projectsRoutes, { prefix: '/projects' });
  await app.register(authRoutes, { prefix: '/auth' });

  // Serve Admin Dashboard Web Application if built
  const possibleAdminPaths = [
    path.resolve(process.cwd(), '../admin/dist'),
    path.resolve(process.cwd(), 'admin/dist'),
    path.resolve(process.cwd(), '../../admin/dist'),
  ];
  const adminDistPath = possibleAdminPaths.find((p) => fs.existsSync(p));

  if (adminDistPath) {
    logger.info({ adminDistPath }, 'Registering Admin Web Dashboard static provider');
    await app.register(fastifyStatic, {
      root: adminDistPath,
      prefix: '/admin/',
      decorateReply: false,
    });

    app.get('/admin', async (_req, reply) => {
      return reply.redirect('/admin/');
    });

    app.setNotFoundHandler(async (request, reply) => {
      if (
        request.method === 'GET' &&
        request.raw.url &&
        request.raw.url.startsWith('/admin') &&
        !request.raw.url.startsWith('/admin/api')
      ) {
        return reply.sendFile('index.html', adminDistPath);
      }
      return reply
        .status(404)
        .send(createErrorResponse('NOT_FOUND', 'Route not found', undefined, request.id));
    });
  }

  return app;
}
