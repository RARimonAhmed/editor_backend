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
  | 'credit_warning'
  | 'job_created'
  | 'job_started'
  | 'job_progress'
  | 'job_completed'
  | 'job_failed'
  | 'job_cancelled'
  | 'job_retry'
  | 'render_job_created'
  | 'render_job_started'
  | 'render_job_progress'
  | 'render_job_completed'
  | 'render_job_failed'
  | 'render_job_cancelled'
  | 'RENDER_JOB_CREATED'
  | 'RENDER_JOB_STARTED'
  | 'RENDER_JOB_PROGRESS'
  | 'RENDER_JOB_COMPLETED'
  | 'RENDER_JOB_FAILED'
  | 'RENDER_JOB_CANCELLED'
  | 'AI_JOB_CREATED'
  | 'AI_JOB_PROGRESS'
  | 'AI_JOB_COMPLETED'
  | 'AI_JOB_FAILED'
  | 'metrics_updated';

export const REALTIME_EVENTS = {
  RENDER_JOB_CREATED: 'render_job_created',
  RENDER_JOB_STARTED: 'render_job_started',
  RENDER_JOB_PROGRESS: 'render_job_progress',
  RENDER_JOB_COMPLETED: 'render_job_completed',
  RENDER_JOB_FAILED: 'render_job_failed',
  RENDER_JOB_CANCELLED: 'render_job_cancelled',
  AI_JOB_CREATED: 'AI_JOB_CREATED',
  AI_JOB_PROGRESS: 'AI_JOB_PROGRESS',
  AI_JOB_COMPLETED: 'AI_JOB_COMPLETED',
  AI_JOB_FAILED: 'AI_JOB_FAILED',
} as const;

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
