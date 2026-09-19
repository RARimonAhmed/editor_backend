export type AIJobStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export type AIJobType =
  | 'text_generation'
  | 'structured_json'
  | 'speech_to_text'
  | 'text_to_speech'
  | 'image_generation'
  | 'video_generation'
  | 'embedding'
  | 'vision'
  | 'audio_analysis'
  | 'transcription'
  | 'caption_generation'
  | 'smart_cut'
  | 'broll_generation'
  | string;

export interface AIJobUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  audioDurationSeconds?: number;
  imageCount?: number;
  videoDurationSeconds?: number;
  [key: string]: unknown;
}

export interface AIJobRecord {
  id: string;
  userId: string;
  projectId?: string | null;
  type: AIJobType;
  status: AIJobStatus;
  progress: number;
  input: Record<string, unknown>;
  output?: Record<string, unknown> | null;
  provider: string;
  model?: string | null;
  usage?: AIJobUsage | null;
  cost: number;
  error?: string | null;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  idempotencyKey?: string | null;
  timeoutMs?: number;
}

export interface CreateAIJobInput {
  type: AIJobType;
  input: Record<string, unknown>;
  projectId?: string;
  provider?: string;
  model?: string;
  idempotencyKey?: string;
  timeoutMs?: number;
}

export interface ListAIJobsFilter {
  status?: AIJobStatus;
  type?: AIJobType;
  projectId?: string;
  limit?: number;
  offset?: number;
}

export type AIJobEventType =
  | 'JOB_QUEUED'
  | 'JOB_STARTED'
  | 'JOB_PROGRESS'
  | 'JOB_COMPLETED'
  | 'JOB_FAILED'
  | 'JOB_CANCELLED';

export interface AIJobEvent {
  event: AIJobEventType;
  jobId: string;
  userId: string;
  projectId?: string | null;
  type: string;
  status: AIJobStatus;
  progress: number;
  currentStep?: string;
  output?: Record<string, unknown> | null;
  usage?: AIJobUsage | null;
  cost?: number;
  error?: string | null;
  timestamp: string;
}
