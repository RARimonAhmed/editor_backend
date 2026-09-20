import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { realtimeService } from './realtime.service.js';
import { authService } from '../auth/auth.service.js';
import { logger } from '../../core/logger.js';

export async function realtimeRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/events/stream',
    {
      schema: {
        description: 'Server-Sent Events (SSE) stream for realtime notifications and job progress',
        tags: ['Realtime'],
        querystring: {
          type: 'object',
          properties: {
            token: { type: 'string' },
            channels: { type: 'string', description: 'Comma-separated channels to subscribe to' },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = request.query as { token?: string; channels?: string };
      let userId = 'anonymous';

      if (query.token) {
        try {
          const payload = authService.verifyAccessToken(query.token);
          userId = payload.userId;
        } catch {
          logger.warn('SSE auth token invalid, proceeding unauthenticated');
        }
      }

      const connectionId = uuidv4();
      const initialChannels = query.channels
        ? query.channels.split(',').map((c) => c.trim()).filter(Boolean)
        : [];

      // Set headers for Server-Sent Events
      reply.raw.setHeader('Content-Type', 'text/event-stream');
      reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
      reply.raw.setHeader('Connection', 'keep-alive');
      reply.raw.setHeader('X-Accel-Buffering', 'no');
      reply.raw.flushHeaders();

      const session = realtimeService.registerSse(connectionId, userId, reply, initialChannels);

      // Send initial handshake
      reply.raw.write(
        `event: connected\ndata: ${JSON.stringify({
          action: 'connected',
          connectionId,
          userId,
          subscribedChannels: Array.from(session.subscribedChannels),
          timestamp: new Date().toISOString(),
        })}\n\n`
      );

      // Periodic heartbeat comment every 15s to keep connections alive through proxies
      const heartbeatInterval = setInterval(() => {
        try {
          reply.raw.write(': heartbeat\n\n');
        } catch {
          clearInterval(heartbeatInterval);
        }
      }, 15000);

      request.raw.on('close', () => {
        clearInterval(heartbeatInterval);
        realtimeService.removeSession(connectionId);
      });
    }
  );
}
