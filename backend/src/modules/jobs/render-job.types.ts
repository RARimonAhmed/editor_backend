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

/**
 * Immutable Source Media Asset Snapshot Entry
 */
export interface RenderSourceMediaEntry {
  assetId: string;
  name: string;
  fileKey: string;
  mimeType: string;
  fileSizeBytes: number;
  durationSeconds?: number;
  sha256?: string;
  status: string;
}

/**
 * Complete, Immutable Snapshot of the Render-Relevant Project State
 * Captures timeline, tracks, clips, trims, transforms, keyframes, effects,
 * transitions, masks, chroma, audio, text, captions, and export settings.
 */
export interface RenderProjectSnapshot {
  snapshotVersion: number;
  snapshotHash: string;
  projectId: string;
  projectVersion: number;
  projectVersionId?: string | null;
  projectTitle: string;
  createdAt: string;
  canvas: {
    resolutionWidth: number;
    resolutionHeight: number;
    framerate: number;
    aspectRatio: string;
    colorSpace: string;
    backgroundColor: string;
  };
  timeline: {
    duration: number;
    framerate: number;
    tracks: Array<{
      id: string;
      type: 'video' | 'audio' | 'text' | 'effect' | 'image' | 'overlay' | 'caption';
      name: string;
      muted: boolean;
      locked: boolean;
      clips: Array<{
        id: string;
        name: string;
        mediaAssetId?: string;
        assetId?: string;
        start: number;
        duration: number;
        sourceStart: number;
        speed: number;
        volume: number;
        trims?: {
          inPointSeconds: number;
          outPointSeconds: number;
          sourceDurationSeconds?: number;
        };
        transform?: {
          scaleX?: number;
          scaleY?: number;
          positionX?: number;
          positionY?: number;
          rotationDegrees?: number;
          opacity?: number;
          anchorX?: number;
          anchorY?: number;
        };
        keyframes?: Array<{
          id?: string;
          property: string;
          timeMs: number;
          value: unknown;
          easing: string;
        }>;
        effects?: Array<{
          id?: string;
          type: string;
          name?: string;
          enabled: boolean;
          parameters: Record<string, unknown>;
        }>;
        transitions?: {
          in?: { type: string; durationSeconds: number; easing?: string };
          out?: { type: string; durationSeconds: number; easing?: string };
        };
        masks?: Array<{
          type: string;
          pathOrShape?: string;
          inverted?: boolean;
          feather?: number;
        }>;
        chroma?: {
          enabled: boolean;
          keyColor?: string;
          similarity?: number;
          smoothness?: number;
          spill?: number;
        };
        audio?: {
          volume: number;
          gainDb: number;
          pan: number;
          fadeInMs: number;
          fadeOutMs: number;
          pitchShift: number;
          equalizer?: Record<string, unknown>;
        };
        text?: {
          content: string;
          fontFamily: string;
          fontSize: number;
          fontWeight: string;
          fontStyle: string;
          color: string;
          backgroundColor?: string;
          outlineColor?: string;
          outlineWidth?: number;
          shadowColor?: string;
          alignment: string;
          letterSpacing?: number;
          lineHeight?: number;
          position?: { x: number; y: number };
        };
        captions?: Array<{
          id?: string;
          text: string;
          startMs: number;
          endMs: number;
          speaker?: string;
          words?: Array<{ word: string; startMs: number; endMs: number; confidence?: number }>;
        }>;
      }>;
    }>;
    markers?: Array<{
      id?: string;
      time: number;
      label: string;
      color?: string;
    }>;
  };
  sourceMedia: Record<string, RenderSourceMediaEntry>;
  exportSettings: RenderJobSettings;
}

export interface RenderJob {
  id: string;
  userId: string;
  projectId: string;
  projectVersionId?: string | null;
  projectVersion?: number;
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
  snapshot?: RenderProjectSnapshot;
  snapshotHash?: string;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  updatedAt: string;
}

export interface CreateRenderJobInput {
  projectId: string;
  projectVersionId?: string;
  versionNumber?: number;
  version?: number;
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
  projectVersion?: number;
  snapshotHash?: string;
  snapshot?: RenderProjectSnapshot;
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
