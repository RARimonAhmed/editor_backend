import { FastifyInstance } from 'fastify';
import { WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { authService } from '../auth/auth.service.js';
import { collaborationManager } from '../collaboration/collaboration.manager.js';
import { logger } from '../../core/logger.js';

export interface ProgressSubscriber {
  id: string;
  socket: WebSocket;
  jobId?: string;
  mediaId?: string;
  userId?: string;
}

export class MediaProgressHub {
  private subscribers = new Map<string, ProgressSubscriber>();

  subscribe(sub: ProgressSubscriber) {
    this.subscribers.set(sub.id, sub);
    logger.info({ subId: sub.id, jobId: sub.jobId, mediaId: sub.mediaId }, 'Client subscribed to media progress updates');
  }

  unsubscribe(id: string) {
    this.subscribers.delete(id);
  }

  broadcastProgress(payload: {
    jobId: string;
    mediaId: string;
    status: string;
    step?: string;
    progress: number;
    details?: Record<string, any>;
    projectId?: string;
  }) {
    const msg = JSON.stringify({
      event: 'JOB_PROGRESS',
      ...payload,
      timestamp: new Date().toISOString(),
    });

    // Send to direct subscribers
    for (const sub of this.subscribers.values()) {
      if (
        (sub.jobId && sub.jobId === payload.jobId) ||
        (sub.mediaId && sub.mediaId === payload.mediaId)
      ) {
        if (sub.socket.readyState === WebSocket.OPEN) {
          sub.socket.send(msg);
        }
      }
    }

    // Also broadcast to collaborative project room if attached
    if (payload.projectId) {
      collaborationManager.broadcast(payload.projectId, {
        action: 'MEDIA_PROCESSING_PROGRESS' as any,
        projectId: payload.projectId,
        senderId: 'system',
        senderName: 'Media Processing Engine',
        data: payload,
      });
    }
  }

  broadcastCompleted(payload: {
    jobId: string;
    mediaId: string;
    result: Record<string, any>;
    projectId?: string;
  }) {
    const msg = JSON.stringify({
      event: 'JOB_COMPLETED',
      status: 'completed',
      progress: 100,
      ...payload,
      timestamp: new Date().toISOString(),
    });

    for (const sub of this.subscribers.values()) {
      if (
        (sub.jobId && sub.jobId === payload.jobId) ||
        (sub.mediaId && sub.mediaId === payload.mediaId)
      ) {
        if (sub.socket.readyState === WebSocket.OPEN) {
          sub.socket.send(msg);
        }
      }
    }

    if (payload.projectId) {
      collaborationManager.broadcast(payload.projectId, {
        action: 'MEDIA_PROCESSING_COMPLETED' as any,
        projectId: payload.projectId,
        senderId: 'system',
        senderName: 'Media Processing Engine',
        data: payload,
      });
    }
  }

  broadcastFailed(payload: {
    jobId: string;
    mediaId: string;
    error: string;
    isDeadLetter?: boolean;
    projectId?: string;
  }) {
    const msg = JSON.stringify({
      event: 'JOB_FAILED',
      status: 'failed',
      ...payload,
      timestamp: new Date().toISOString(),
    });

    for (const sub of this.subscribers.values()) {
      if (
        (sub.jobId && sub.jobId === payload.jobId) ||
        (sub.mediaId && sub.mediaId === payload.mediaId)
      ) {
        if (sub.socket.readyState === WebSocket.OPEN) {
          sub.socket.send(msg);
        }
      }
    }

    if (payload.projectId) {
      collaborationManager.broadcast(payload.projectId, {
        action: 'MEDIA_PROCESSING_FAILED' as any,
        projectId: payload.projectId,
        senderId: 'system',
        senderName: 'Media Processing Engine',
        data: payload,
      });
    }
  }
}

export const mediaProgressHub = new MediaProgressHub();

export async function mediaProgressWsRoutes(fastify: FastifyInstance) {
  // WebSocket subscription for a specific Job ID: /ws/v1/jobs/:jobId/progress
  fastify.get(
    '/ws/v1/jobs/:jobId/progress',
    { websocket: true },
    (connection, req) => {
      const { jobId } = req.params as { jobId: string };
      const query = req.query as { token?: string };

      let userId = 'anonymous';
      if (query.token) {
        try {
          const payload = authService.verifyAccessToken(query.token);
          userId = payload.userId;
        } catch {
          // guest
        }
      }

      const subscriberId = uuidv4();
      const socket = connection.socket;

      mediaProgressHub.subscribe({
        id: subscriberId,
        socket,
        jobId,
        userId,
      });

      socket.send(
        JSON.stringify({
          event: 'SUBSCRIBED',
          jobId,
          timestamp: new Date().toISOString(),
        })
      );

      socket.on('close', () => {
        mediaProgressHub.unsubscribe(subscriberId);
      });

      socket.on('error', () => {
        mediaProgressHub.unsubscribe(subscriberId);
      });
    }
  );

  // WebSocket subscription for a specific Media ID: /ws/v1/media/:mediaId/progress
  fastify.get(
    '/ws/v1/media/:mediaId/progress',
    { websocket: true },
    (connection, req) => {
      const { mediaId } = req.params as { mediaId: string };
      const query = req.query as { token?: string };

      let userId = 'anonymous';
      if (query.token) {
        try {
          const payload = authService.verifyAccessToken(query.token);
          userId = payload.userId;
        } catch {
          // guest
        }
      }

      const subscriberId = uuidv4();
      const socket = connection.socket;

      mediaProgressHub.subscribe({
        id: subscriberId,
        socket,
        mediaId,
        userId,
      });

      socket.send(
        JSON.stringify({
          event: 'SUBSCRIBED',
          mediaId,
          timestamp: new Date().toISOString(),
        })
      );

      socket.on('close', () => {
        mediaProgressHub.unsubscribe(subscriberId);
      });

      socket.on('error', () => {
        mediaProgressHub.unsubscribe(subscriberId);
      });
    }
  );
}
