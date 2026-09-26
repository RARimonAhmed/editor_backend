import { RenderExportPayload } from './jobs.types.js';

export type RenderJobStatus =
  | 'queued'
  | 'starting'
  | 'running'
  | 'cancelling'
  | 'cancelled'
  | 'validating'
  | 'uploading'
  | 'completed'
  | 'failed';

export type RenderFormat = 'mp4' | 'mov' | 'webm';
export type RenderVideoCodec = 'h264' | 'hevc' | 'vp9' | 'prores';
export type RenderAudioCodec = 'aac' | 'opus' | 'pcm';
export type RenderPreset =
  | 'ultrafast'
  | 'superfast'
  | 'veryfast'
  | 'faster'
  | 'fast'
  | 'medium'
  | 'slow'
  | 'slower'
  | 'veryslow';

export interface RenderJobSettings {
  format: RenderFormat;
  resolutionWidth: number;
  resolutionHeight: number;
  framerate: number;
  videoCodec: RenderVideoCodec;
  audioCodec: RenderAudioCodec;
  bitrateKbps?: number;
  audioBitrateKbps?: number;
  crf?: number;
  preset?: RenderPreset;
  durationSeconds?: number;
}

export interface RenderJobOutput {
  storageKey?: string;
  downloadUrl?: string;
  mimeType?: string;
  sizeBytes?: number;
  durationSeconds?: number;
  width?: number;
  height?: number;
  format?: string;
  checksumSha256?: string;
  metadata?: Record<string, unknown>;
}

export interface RenderJobWorkerMetadata {
  workerId?: string;
  hostName?: string;
  ffmpegVersion?: string;
  executionTimeMs?: number;
  renderedFrames?: number;
  totalFrames?: number;
  speed?: string;
  fps?: number;
  heartbeatAt?: string;
}

export interface RenderJob {
  id: string;
  userId: string;
  projectId: string;
  projectVersionId?: string | null;
  status: RenderJobStatus;
  settings: RenderJobSettings;
  progress: number;
  stage: string;
  errorCode?: string | null;
  errorMessage?: string | null;
  outputObject?: RenderJobOutput | null;
  workerMetadata: RenderJobWorkerMetadata;
  attempts: number;
  maxAttempts: number;
  creditReservationId?: string | null;
  creditCost: number;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  updatedAt: string;
}

export interface CreateRenderJobInput {
  projectId: string;
  projectVersionId?: string;
  settings: Partial<RenderJobSettings> & {
    format?: RenderFormat;
    resolutionWidth?: number;
    resolutionHeight?: number;
    framerate?: number;
  };
}

export interface ListRenderJobsQuery {
  page?: number;
  limit?: number;
  status?: RenderJobStatus;
  projectId?: string;
  sortBy?: 'created_at' | 'updated_at' | 'status' | 'progress';
  order?: 'asc' | 'desc';
  allUsers?: boolean;
}

export interface PaginatedRenderJobsDto {
  items: RenderJob[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface RenderQueuePayload {
  renderJobId: string;
  projectId: string;
  projectVersionId?: string | null;
}

/**
 * Strict state machine transition rules for render jobs
 */
export const ALLOWED_STATUS_TRANSITIONS: Record<RenderJobStatus, readonly RenderJobStatus[]> = {
  queued: ['starting', 'cancelled', 'failed'],
  starting: ['running', 'failed', 'cancelled', 'cancelling'],
  running: ['validating', 'cancelling', 'failed'],
  cancelling: ['cancelled', 'failed'],
  cancelled: [], // Terminal state
  validating: ['uploading', 'failed'],
  uploading: ['completed', 'failed'],
  completed: [], // Terminal state
  failed: ['queued'], // Recoverable via retry
} as const;

export function isValidStatusTransition(from: RenderJobStatus, to: RenderJobStatus): boolean {
  if (from === to) return true;
  return ALLOWED_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}
