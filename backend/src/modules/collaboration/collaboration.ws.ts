import { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { collaborationManager } from './collaboration.manager.js';
import { authService } from '../auth/auth.service.js';
import { logger } from '../../core/logger.js';

export async function collaborationWsRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/ws/v1/collaboration/:projectId',
    { websocket: true },
    (connection, req) => {
      const { projectId } = req.params as { projectId: string };
      const query = req.query as { token?: string };

      let userId = 'anonymous';
      let userName = 'Guest Editor';

      if (query.token) {
        try {
          const payload = authService.verifyAccessToken(query.token);
          userId = payload.userId;
          userName = payload.email.split('@')[0];
        } catch (err) {
          logger.warn('WebSocket connection token invalid, proceeding as guest');
        }
      }

      const connectionId = uuidv4();
      const socket = connection.socket;

      // Join room
      collaborationManager.joinRoom({
        connectionId,
        userId,
        userName,
        projectId,
        socket,
      });

      socket.on('message', (rawData) => {
        try {
          const parsed = JSON.parse(rawData.toString());
          collaborationManager.handleMessage(connectionId, {
            ...parsed,
            projectId,
            senderId: userId,
            senderName: userName,
          });
        } catch (error) {
          logger.warn({ error }, 'Failed to parse incoming WebSocket message');
        }
      });

      socket.on('close', () => {
        collaborationManager.leaveRoom(connectionId, projectId);
      });

      socket.on('error', (err) => {
        logger.error({ err, connectionId, projectId }, 'WebSocket connection error');
        collaborationManager.leaveRoom(connectionId, projectId);
      });
    }
  );
}
