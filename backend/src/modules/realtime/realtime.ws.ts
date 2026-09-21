import { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { realtimeService } from './realtime.service.js';
import { authService } from '../auth/auth.service.js';
import { logger } from '../../core/logger.js';

export async function realtimeWsRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/ws/v1/realtime',
    { websocket: true },
    async (connection, req) => {
      const query = req.query as { token?: string; channels?: string };
      let userId = 'anonymous';

      if (query.token) {
        try {
          const payload = authService.verifyAccessToken(query.token);
          userId = payload.userId;
        } catch {
          logger.warn('Realtime WS auth token invalid, proceeding unauthenticated');
        }
      }

      const connectionId = uuidv4();
      const socket = connection.socket;
      const session = realtimeService.registerWebSocket(connectionId, userId, socket);

      // Parse initial channels from query if provided e.g. "project:123,job:456"
      if (query.channels) {
        const initialChannels = query.channels.split(',').map((c) => c.trim()).filter(Boolean);
        await realtimeService.subscribe(connectionId, initialChannels);
      }

      // Send connection acknowledgement
      socket.send(
        JSON.stringify({
          action: 'connected',
          connectionId,
          userId,
          subscribedChannels: Array.from(session.subscribedChannels),
          timestamp: new Date().toISOString(),
        })
      );

      socket.on('message', async (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.action === 'subscribe' && Array.isArray(msg.channels)) {
            const { allowed, rejected } = await realtimeService.subscribe(connectionId, msg.channels);
            if (rejected.length > 0) {
              socket.send(
                JSON.stringify({
                  action: 'subscription_error',
                  error: 'Unauthorized access to requested channels',
                  rejectedChannels: rejected,
                  allowedChannels: allowed,
                })
              );
            }
            if (allowed.length > 0) {
              socket.send(
                JSON.stringify({
                  action: 'subscribed',
                  channels: allowed,
                  allChannels: Array.from(session.subscribedChannels),
                })
              );
            }
          } else if (msg.action === 'unsubscribe' && Array.isArray(msg.channels)) {
            realtimeService.unsubscribe(connectionId, msg.channels);
            socket.send(
              JSON.stringify({
                action: 'unsubscribed',
                channels: msg.channels,
                allChannels: Array.from(session.subscribedChannels),
              })
            );
          } else if (msg.action === 'ping') {
            session.lastPingAt = new Date().toISOString();
            socket.send(JSON.stringify({ action: 'pong', timestamp: Date.now() }));
          }
        } catch (err) {
          logger.warn({ err }, 'Failed to parse incoming realtime WS message');
        }
      });

      socket.on('close', () => {
        realtimeService.removeSession(connectionId);
      });

      socket.on('error', (err) => {
        logger.error({ err, connectionId }, 'Realtime WS error');
        realtimeService.removeSession(connectionId);
      });
    }
  );
}
