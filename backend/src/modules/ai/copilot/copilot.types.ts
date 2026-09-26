/**
 * AI Copilot Domain Types
 * Defines the core command vocabulary, plan structure, and execution interfaces
 * for natural-language timeline editing.
 */

export type CopilotCommandAction =
  | 'ADD_CLIP'
  | 'DELETE_CLIP'
  | 'SPLIT_CLIP'
  | 'TRIM_CLIP'
  | 'MOVE_CLIP'
  | 'RIPPLE_DELETE'
  | 'DUPLICATE_CLIP'
  | 'SET_TRANSFORM'
  | 'SET_CROP'
  | 'SET_CANVAS'
  | 'ADD_TEXT'
  | 'UPDATE_TEXT'
  | 'ADD_EFFECT'
  | 'REMOVE_EFFECT'
  | 'UPDATE_EFFECT'
  | 'ADD_KEYFRAME'
  | 'UPDATE_KEYFRAME'
  | 'SET_AUDIO'
  | 'ADD_CAPTION'
  | 'UPDATE_CAPTION'
  | 'SET_SPEED';

export interface CopilotTimeRange {
  start: number;
  end: number;
}

export interface CopilotCommand {
  id: string;
  action: CopilotCommandAction;
  targetTrackId?: string;
  targetClipId?: string;
  timeRange?: CopilotTimeRange;
  parameters: Record<string, unknown>;
  explanation: string;
  confidence?: number;
}

export interface EstimatedImpact {
  affectedTracks: string[];
  affectedClips: string[];
  durationDelta: number;
  newEstimatedDuration?: number;
}

export interface PlanMetadata {
  provider: string;
  model: string;
  tokens: number;
  cost: number;
  jobId?: string;
  creditReservationId?: string;
}

export interface EditorCommandPlan {
  planId: string;
  projectId: string;
  projectVersion: number;
  explanation: string;
  commands: CopilotCommand[];
  warnings: string[];
  estimatedImpact: EstimatedImpact;
  createdAt: string;
  appliedAt?: string | null;
  status: 'generated' | 'validated' | 'applied' | 'rejected';
  metadata?: PlanMetadata;
}

export interface TimelineClipContext {
  id: string;
  name?: string;
  trackId?: string;
  startTime: number;
  endTime: number;
  duration: number;
  assetId?: string;
  type?: 'video' | 'audio' | 'text' | 'overlay';
}

export interface TimelineTrackContext {
  id: string;
  name?: string;
  type: 'video' | 'audio' | 'text' | 'overlay';
  clips: TimelineClipContext[];
}

export interface CopilotTimelineContext {
  duration?: number;
  currentPlayhead?: number;
  selectedClipId?: string;
  selectedTrackId?: string;
  aspectRatio?: string;
  resolutionWidth?: number;
  resolutionHeight?: number;
  tracks?: TimelineTrackContext[];
}

export interface CopilotRequestInput {
  projectId: string;
  projectVersion?: number;
  prompt: string;
  selectedClipId?: string;
  selectedTrackId?: string;
  playheadPosition?: number;
  timelineContext?: CopilotTimelineContext;
  provider?: 'gemini' | 'openai' | 'mock' | 'fake';
  model?: string;
}

export interface CopilotValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  sanitizedPlan?: EditorCommandPlan;
}
