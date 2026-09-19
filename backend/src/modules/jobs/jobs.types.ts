export type JobType =
  | 'transcode'
  | 'render_export'
  | 'ai_transcribe'
  | 'ai_caption'
  | 'ai_broll'
  | 'smart_cut';

export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface RenderExportPayload {
  projectId: string;
  format: 'mp4' | 'mov' | 'webm';
  resolutionWidth: number;
  resolutionHeight: number;
  framerate: number;
  bitrateKbps?: number;
  audioCodec?: string;
  videoCodec?: string;
}

export interface MediaJob {
  id: string;
  userId: string;
  projectId?: string;
  jobType: JobType;
  status: JobStatus;
  progress: number; // 0 to 100
  creditCost: number;
  payload: Record<string, unknown>;
  result?: Record<string, unknown>;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}
