export type RealtimeEventType =
  | 'upload_progress'
  | 'media_ready'
  | 'ai_job_progress'
  | 'ai_job_complete'
  | 'ai_job_failed'
  | 'export_complete'
  | 'export_failed'
  | 'project_shared'
  | 'comment_added'
  | 'subscription_changed'
  | 'credit_warning';

export interface RealtimeEnvelope<T = any> {
  eventId: string;
  eventType: RealtimeEventType;
  channel: string; // e.g. "user:123", "project:456", "job:789"
  timestamp: string;
  payload: T;
}

export interface ClientSubscriptionMessage {
  action: 'subscribe' | 'unsubscribe' | 'ping';
  channels?: string[];
  token?: string;
}

export interface RealtimeSession {
  connectionId: string;
  userId: string;
  subscribedChannels: Set<string>;
  socket?: any; // WebSocket
  sseReply?: any; // FastifyReply for SSE
  transport: 'websocket' | 'sse';
  connectedAt: string;
  lastPingAt: string;
}
