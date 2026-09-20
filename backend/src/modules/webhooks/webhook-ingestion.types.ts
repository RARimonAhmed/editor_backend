export type WebhookProviderType = 'stripe' | 'mux' | 'replicate' | 'elevenlabs' | 'generic';

export interface WebhookIngestPayload {
  id: string;
  provider: WebhookProviderType | string;
  eventType: string;
  data: Record<string, any>;
  rawBody?: string;
  signature?: string;
  timestamp?: string;
}

export interface WebhookDeliveryRecord {
  id: string;
  eventId: string;
  provider: string;
  eventType: string;
  status: 'DELIVERED' | 'FAILED' | 'DEAD_LETTER';
  attemptCount: number;
  maxAttempts: number;
  lastAttemptAt: string;
  error?: string;
  payload: Record<string, any>;
}

export interface WebhookDeadLetterEntry {
  id: string;
  eventId: string;
  provider: string;
  eventType: string;
  payload: Record<string, any>;
  reason: string;
  stack?: string;
  receivedAt: string;
  deadLetteredAt: string;
}

export interface WebhookIngestResult {
  handled: boolean;
  isDuplicate?: boolean;
  status: 'PROCESSED' | 'QUEUED' | 'DEAD_LETTER';
  provider: string;
  eventId: string;
  action?: string;
}
