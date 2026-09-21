import { FastifyInstance } from 'fastify';
import { WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { authService } from '../../auth/auth.service.js';
import { collaborationManager } from '../../collaboration/collaboration.manager.js';
import { redisService } from '../../../services/redis/index.js';
import { logger } from '../../../core/logger.js';
import { AIJobEvent } from './ai-job.types.js';
import { realtimeService } from '../../realtime/realtime.service.js';

export interface AIJobSubscriber {
  id: string;
  socket: WebSocket;
  jobId?: string;
  userId?: string;
}

export class AIJobNotificationHub {
  private subscribers = new Map<string, AIJobSubscriber>();
  private sseCallbacks = new Map<string, Set<(event: AIJobEvent) => void>>();

  constructor() {
    // Listen for Redis pub/sub cross-node messages if available
    this.initPubSub();
  }

  private async initPubSub() {
    // Hook into Redis publish events channel if distributed Redis is used
  }

  subscribe(sub: AIJobSubscriber) {
    this.subscribers.set(sub.id, sub);
    logger.info({ subId: sub.id, jobId: sub.jobId, userId: sub.userId }, 'Client subscribed to AI job updates');
  }

  unsubscribe(id: string) {
    this.subscribers.delete(id);
  }

  subscribeSSE(jobId: string, callback: (event: AIJobEvent) => void): () => void {
    if (!this.sseCallbacks.has(jobId)) {
      this.sseCallbacks.set(jobId, new Set());
    }
    this.sseCallbacks.get(jobId)!.add(callback);

    return () => {
      const set = this.sseCallbacks.get(jobId);
      if (set) {
        set.delete(callback);
        if (set.size === 0) {
          this.sseCallbacks.delete(jobId);
        }
      }
    };
  }

  broadcastEvent(event: AIJobEvent) {
    const raw = JSON.stringify(event);

    // 1. Direct WebSocket Subscribers
    for (const sub of this.subscribers.values()) {
      const matchesJob = sub.jobId && sub.jobId === event.jobId;
      const matchesUser = sub.userId && sub.userId === event.userId;

      if (matchesJob || matchesUser) {
        if (sub.socket.readyState === WebSocket.OPEN) {
          sub.socket.send(raw);
        }
      }
    }

    // 2. Direct SSE Subscribers
    const sseListeners = this.sseCallbacks.get(event.jobId);
    if (sseListeners) {
      for (const listener of sseListeners) {
        try {
          listener(event);
        } catch {
          // ignore broken pipe
        }
      }
    }

    // 3. Central Realtime Multi-Channel Broadcast
    try {
      if (event.event === 'JOB_PROGRESS') {
        realtimeService.notifyAiJobProgress(event.jobId, event.userId, event.progress, (event as any).currentStep, event.projectId || undefined);
      } else if (event.event === 'JOB_COMPLETED') {
        realtimeService.notifyAiJobComplete(event.jobId, event.userId, (event as any).output, (event as any).cost, event.projectId || undefined);
      } else if (event.event === 'JOB_FAILED' || event.event === 'JOB_CANCELLED') {
        realtimeService.notifyAiJobFailed(event.jobId, event.userId, (event as any).error || 'Cancelled or failed', event.projectId || undefined);
      }
    } catch {
      // ignore
    }

    // Collaborative Project Room (if attached)
    if (event.projectId) {
      collaborationManager.broadcast(event.projectId, {
        action: 'AI_JOB_UPDATE' as any,
        projectId: event.projectId,
        senderId: 'system',
        senderName: 'AI Job Engine',
        data: event,
      });
    }

    // 4. Redis PubSub for multi-node distribution
    redisService.publish('ai:jobs:events', raw).catch(() => {
      // non-blocking
    });
  }
}

export const aiJobNotificationHub = new AIJobNotificationHub();

export async function aiJobWsRoutes(fastify: FastifyInstance) {
  // WebSocket subscription for a specific AI Job: /ws/v1/ai/jobs/:id/progress
  fastify.get(
    '/ws/v1/ai/jobs/:id/progress',
    { websocket: true },
    (connection, req) => {
      const { id } = req.params as { id: string };
      const query = req.query as { token?: string };

      let userId = 'anonymous';
      if (query.token) {
        try {
          const payload = authService.verifyAccessToken(query.token);
          userId = payload.userId;
        } catch {
          // guest / invalid token
        }
      }

      const subscriberId = uuidv4();
      const socket = connection.socket;

      aiJobNotificationHub.subscribe({
        id: subscriberId,
        socket,
        jobId: id,
        userId,
      });

      socket.send(
        JSON.stringify({
          event: 'SUBSCRIBED',
          jobId: id,
          timestamp: new Date().toISOString(),
        })
      );

      socket.on('close', () => {
        aiJobNotificationHub.unsubscribe(subscriberId);
      });

      socket.on('error', () => {
        aiJobNotificationHub.unsubscribe(subscriberId);
      });
    }
  );

  // WebSocket subscription for all AI jobs of a user: /ws/v1/ai/progress
  fastify.get(
    '/ws/v1/ai/progress',
    { websocket: true },
    (connection, req) => {
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

      aiJobNotificationHub.subscribe({
        id: subscriberId,
        socket,
        userId,
      });

      socket.send(
        JSON.stringify({
          event: 'SUBSCRIBED',
          userId,
          timestamp: new Date().toISOString(),
        })
      );

      socket.on('close', () => {
        aiJobNotificationHub.unsubscribe(subscriberId);
      });

      socket.on('error', () => {
        aiJobNotificationHub.unsubscribe(subscriberId);
      });
    }
  );
}
