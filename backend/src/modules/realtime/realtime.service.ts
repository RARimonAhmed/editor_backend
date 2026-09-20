import { v4 as uuidv4 } from 'uuid';
import { WebSocket } from 'ws';
import { RealtimeEventType, RealtimeEnvelope, RealtimeSession } from './realtime.types.js';
import { logger } from '../../core/logger.js';

export class RealtimeService {
  // connectionId -> RealtimeSession
  private sessions = new Map<string, RealtimeSession>();
  // channelName -> Set of connectionIds
  private channelSubscribers = new Map<string, Set<string>>();

  /**
   * Register a new WebSocket connection
   */
  registerWebSocket(connectionId: string, userId: string, socket: WebSocket): RealtimeSession {
    const session: RealtimeSession = {
      connectionId,
      userId,
      subscribedChannels: new Set<string>(),
      socket,
      transport: 'websocket',
      connectedAt: new Date().toISOString(),
      lastPingAt: new Date().toISOString(),
    };

    // Automatically subscribe user to their private channel
    if (userId && userId !== 'anonymous') {
      session.subscribedChannels.add(`user:${userId}`);
      this.addChannelSubscriber(`user:${userId}`, connectionId);
    }

    this.sessions.set(connectionId, session);
    logger.info({ connectionId, userId, transport: 'websocket' }, 'Realtime client connected');
    return session;
  }

  /**
   * Register an SSE streaming connection
   */
  registerSse(connectionId: string, userId: string, sseReply: any, initialChannels: string[] = []): RealtimeSession {
    const session: RealtimeSession = {
      connectionId,
      userId,
      subscribedChannels: new Set<string>(initialChannels),
      sseReply,
      transport: 'sse',
      connectedAt: new Date().toISOString(),
      lastPingAt: new Date().toISOString(),
    };

    if (userId && userId !== 'anonymous') {
      session.subscribedChannels.add(`user:${userId}`);
      this.addChannelSubscriber(`user:${userId}`, connectionId);
    }

    for (const channel of initialChannels) {
      this.addChannelSubscriber(channel, connectionId);
    }

    this.sessions.set(connectionId, session);
    logger.info({ connectionId, userId, transport: 'sse', channels: initialChannels }, 'Realtime SSE client connected');
    return session;
  }

  /**
   * Remove a connection on disconnect
   */
  removeSession(connectionId: string) {
    const session = this.sessions.get(connectionId);
    if (!session) return;

    for (const channel of session.subscribedChannels) {
      const subscribers = this.channelSubscribers.get(channel);
      if (subscribers) {
        subscribers.delete(connectionId);
        if (subscribers.size === 0) {
          this.channelSubscribers.delete(channel);
        }
      }
    }

    this.sessions.delete(connectionId);
    logger.info({ connectionId, userId: session.userId }, 'Realtime client disconnected');
  }

  /**
   * Subscribe connection to channels
   */
  subscribe(connectionId: string, channels: string[]) {
    const session = this.sessions.get(connectionId);
    if (!session) return;

    for (const channel of channels) {
      session.subscribedChannels.add(channel);
      this.addChannelSubscriber(channel, connectionId);
    }
  }

  /**
   * Unsubscribe connection from channels
   */
  unsubscribe(connectionId: string, channels: string[]) {
    const session = this.sessions.get(connectionId);
    if (!session) return;

    for (const channel of channels) {
      session.subscribedChannels.delete(channel);
      const subscribers = this.channelSubscribers.get(channel);
      if (subscribers) {
        subscribers.delete(connectionId);
        if (subscribers.size === 0) {
          this.channelSubscribers.delete(channel);
        }
      }
    }
  }

  private addChannelSubscriber(channel: string, connectionId: string) {
    let subscribers = this.channelSubscribers.get(channel);
    if (!subscribers) {
      subscribers = new Set<string>();
      this.channelSubscribers.set(channel, subscribers);
    }
    subscribers.add(connectionId);
  }

  /**
   * Broadcast an envelope to a specific channel
   */
  publish<T>(eventType: RealtimeEventType, channel: string, payload: T): RealtimeEnvelope<T> {
    const envelope: RealtimeEnvelope<T> = {
      eventId: uuidv4(),
      eventType,
      channel,
      timestamp: new Date().toISOString(),
      payload,
    };

    const subscribers = this.channelSubscribers.get(channel);
    if (!subscribers || subscribers.size === 0) {
      return envelope;
    }

    const rawJson = JSON.stringify(envelope);

    for (const connId of subscribers) {
      const session = this.sessions.get(connId);
      if (!session) continue;

      if (session.transport === 'websocket' && session.socket) {
        if (session.socket.readyState === WebSocket.OPEN) {
          session.socket.send(rawJson);
        }
      } else if (session.transport === 'sse' && session.sseReply) {
        try {
          session.sseReply.raw.write(`event: ${eventType}\ndata: ${rawJson}\n\n`);
        } catch (err) {
          logger.warn({ err, connId }, 'Failed to write to SSE stream');
        }
      }
    }

    return envelope;
  }

  // --------------------------------------------------------------------------
  // HIGH-LEVEL DOMAIN EVENT HELPERS
  // --------------------------------------------------------------------------

  notifyUploadProgress(jobId: string, userId: string, progress: number, status: string) {
    const payload = { jobId, progress, status };
    this.publish('upload_progress', `job:${jobId}`, payload);
    if (userId) this.publish('upload_progress', `user:${userId}`, payload);
  }

  notifyMediaReady(mediaId: string, userId: string, asset: any) {
    const payload = { mediaId, asset, status: 'READY' };
    this.publish('media_ready', `job:${mediaId}`, payload);
    if (userId) this.publish('media_ready', `user:${userId}`, payload);
  }

  notifyAiJobProgress(jobId: string, userId: string, progress: number, step?: string) {
    const payload = { jobId, progress, step, status: 'RUNNING' };
    this.publish('ai_job_progress', `job:${jobId}`, payload);
    if (userId) this.publish('ai_job_progress', `user:${userId}`, payload);
  }

  notifyAiJobComplete(jobId: string, userId: string, output: any, cost?: number) {
    const payload = { jobId, output, cost, status: 'COMPLETED' };
    this.publish('ai_job_complete', `job:${jobId}`, payload);
    if (userId) this.publish('ai_job_complete', `user:${userId}`, payload);
  }

  notifyAiJobFailed(jobId: string, userId: string, error: string) {
    const payload = { jobId, error, status: 'FAILED' };
    this.publish('ai_job_failed', `job:${jobId}`, payload);
    if (userId) this.publish('ai_job_failed', `user:${userId}`, payload);
  }

  notifyExportComplete(exportId: string, userId: string, projectId: string, downloadUrl: string) {
    const payload = { exportId, projectId, downloadUrl, status: 'COMPLETED' };
    this.publish('export_complete', `job:${exportId}`, payload);
    this.publish('export_complete', `project:${projectId}`, payload);
    if (userId) this.publish('export_complete', `user:${userId}`, payload);
  }

  notifyExportFailed(exportId: string, userId: string, projectId: string, error: string) {
    const payload = { exportId, projectId, error, status: 'FAILED' };
    this.publish('export_failed', `job:${exportId}`, payload);
    this.publish('export_failed', `project:${projectId}`, payload);
    if (userId) this.publish('export_failed', `user:${userId}`, payload);
  }

  notifyProjectShared(projectId: string, invitedUserId: string, role: string, inviterName: string) {
    const payload = { projectId, role, inviterName };
    this.publish('project_shared', `project:${projectId}`, payload);
    if (invitedUserId) this.publish('project_shared', `user:${invitedUserId}`, payload);
  }

  notifyCommentAdded(projectId: string, comment: any) {
    const payload = { projectId, comment };
    this.publish('comment_added', `project:${projectId}`, payload);
  }

  notifySubscriptionChanged(userId: string, tier: string, status: string) {
    const payload = { userId, tier, status };
    this.publish('subscription_changed', `user:${userId}`, payload);
  }

  notifyCreditWarning(userId: string, remainingBalance: number, threshold: number) {
    const payload = { userId, remainingBalance, threshold, warning: 'Credits low' };
    this.publish('credit_warning', `user:${userId}`, payload);
  }

  getActiveSessionsCount(): number {
    return this.sessions.size;
  }

  getChannelSubscribersCount(channel: string): number {
    return this.channelSubscribers.get(channel)?.size || 0;
  }
}

export const realtimeService = new RealtimeService();
