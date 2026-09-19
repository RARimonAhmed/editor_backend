/**
 * Domain types for AI Short-Video Orchestration
 * Converts long-form video/projects into viral vertical/square short clips (30s, 45s, 60s, 9:16, 1:1, 4:5).
 * Strictly adheres to non-destructive design: AI returns an Editor Command Plan for preview;
 * the frontend applies commands explicitly via ProjectBloc with optimistic concurrency.
 */

export type ShortTargetDuration = 30 | 45 | 60 | number;

export type ShortAspectRatio = '9:16' | '1:1' | '4:5' | '16:9';

export type CaptionPreset = 'bold_yellow' | 'clean_white' | 'karaoke_glow' | 'minimal';

export type ColorPreset =
  | 'cinematic_warm'
  | 'vibrant_boost'
  | 'punchy_contrast'
  | 'clean_documentary'
  | 'cool_modern'
  | 'none';

export type MusicPreset =
  | 'upbeat_ambient'
  | 'cinematic_chill'
  | 'lofi_beat'
  | 'high_energy'
  | 'none';

export type AutoReframeMode = 'face' | 'object' | 'center' | 'auto';

// ----------------------------------------------------------------------------
// COMMAND TYPES
// ----------------------------------------------------------------------------

export type OrchestrationCommandType =
  | 'SET_CANVAS'
  | 'CREATE_SEQUENCE'
  | 'DELETE_RANGE'
  | 'SET_REFRAME'
  | 'ADD_CAPTIONS'
  | 'ADD_AUDIO'
  | 'SET_AUDIO_DUCKING'
  | 'ADD_EFFECT';

export interface BaseOrchestrationCommand {
  id: string;
  type: OrchestrationCommandType;
  confidence: number;
  reason?: string;
  accepted: boolean;
  metadata?: Record<string, unknown>;
}

export interface SetCanvasCommand extends BaseOrchestrationCommand {
  type: 'SET_CANVAS';
  width: number;
  height: number;
  aspectRatio: ShortAspectRatio;
  framerate?: number;
  backgroundColor?: string;
}

export interface SequenceClipItem {
  id: string;
  mediaAssetId?: string;
  sourceStart: number;
  duration: number;
  targetStart: number;
  speed?: number;
  volume?: number;
  name?: string;
}

export interface CreateSequenceCommand extends BaseOrchestrationCommand {
  type: 'CREATE_SEQUENCE';
  targetDuration: number;
  clips: SequenceClipItem[];
  trackCount: number;
}

export interface DeleteRangeCommand extends BaseOrchestrationCommand {
  type: 'DELETE_RANGE';
  start: number;
  end: number;
  durationSaved: number;
  source: 'silence' | 'filler' | 'pause';
  trackIds?: string[];
}

export interface ReframeKeyframe {
  time: number;
  focalX: number; // 0.0 - 1.0
  focalY: number; // 0.0 - 1.0
  scale: number;
  cropBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface SetReframeCommand extends BaseOrchestrationCommand {
  type: 'SET_REFRAME';
  clipId: string;
  aspectRatio: ShortAspectRatio;
  trackingMode: AutoReframeMode;
  keyframes: ReframeKeyframe[];
  averageFocalPoint: { x: number; y: number };
}

export interface CaptionStyleConfig {
  fontFamily: string;
  fontSize: number;
  textColor: string;
  backgroundColor?: string;
  highlightColor: string;
  position: 'center' | 'lower_third' | 'bottom';
  preset: CaptionPreset;
  safeZoneMargin: number;
}

export interface CaptionSegment {
  id: string;
  start: number;
  end: number;
  text: string;
  words: Array<{
    word: string;
    start: number;
    end: number;
    confidence: number;
  }>;
}

export interface AddCaptionsCommand extends BaseOrchestrationCommand {
  type: 'ADD_CAPTIONS';
  trackId: string;
  preset: CaptionPreset;
  style: CaptionStyleConfig;
  captions: CaptionSegment[];
}

export interface AddAudioCommand extends BaseOrchestrationCommand {
  type: 'ADD_AUDIO';
  trackId: string;
  assetId?: string;
  preset?: MusicPreset;
  start: number;
  duration: number;
  volume: number; // e.g. 0.8
  loop: boolean;
  fadeInSeconds?: number;
  fadeOutSeconds?: number;
}

export interface DuckingRange {
  start: number;
  end: number;
  targetVolume: number; // e.g. 0.15
}

export interface SetAudioDuckingCommand extends BaseOrchestrationCommand {
  type: 'SET_AUDIO_DUCKING';
  musicTrackId: string;
  speechTrackId: string;
  duckVolume: number; // 0.0 - 1.0 (default: 0.2)
  attackTime: number; // seconds to drop volume
  releaseTime: number; // seconds to restore volume
  duckingRanges: DuckingRange[];
}

export interface ColorFilterConfig {
  preset: ColorPreset;
  lutName?: string;
  contrast: number; // 1.0 default
  saturation: number; // 1.0 default
  temperature: number; // 0 default (-100 to 100)
  exposure: number; // 0 default
  vignette?: number;
}

export interface AddEffectCommand extends BaseOrchestrationCommand {
  type: 'ADD_EFFECT';
  clipId?: string;
  trackId?: string;
  effectType: 'color_preset' | 'lut';
  config: ColorFilterConfig;
}

export type OrchestrationCommand =
  | SetCanvasCommand
  | CreateSequenceCommand
  | DeleteRangeCommand
  | SetReframeCommand
  | AddCaptionsCommand
  | AddAudioCommand
  | SetAudioDuckingCommand
  | AddEffectCommand;

// ----------------------------------------------------------------------------
// PLAN TELEMETRY & RESULTS
// ----------------------------------------------------------------------------

export interface SelectedSegment {
  id: string;
  sceneIndex: number;
  sourceStart: number;
  sourceEnd: number;
  duration: number;
  score: number;
  isHook: boolean;
  summary: string;
  speechSummary?: string;
  detectedObjects: string[];
  hasFaces: boolean;
}

export interface ReframeTelemetry {
  clipId: string;
  focalCenter: { x: number; y: number };
  trackingMode: AutoReframeMode;
  detectedFaceCount: number;
}

export interface TimelinePreviewSummary {
  originalDuration: number;
  targetDuration: number;
  projectedDuration: number;
  aspectRatio: ShortAspectRatio;
  resolution: { width: number; height: number };
  totalClips: number;
  totalSilencesCut: number;
  durationSaved: number;
  tracksCount: number;
}

export interface EditorCommandPlan {
  id: string;
  userId: string;
  projectId?: string;
  mediaAssetId?: string;
  title: string;
  hookSummary: string;
  sourceDuration: number;
  targetDuration: ShortTargetDuration;
  aspectRatio: ShortAspectRatio;
  viralScore: number; // 0.0 - 1.0
  commands: OrchestrationCommand[];
  segmentsUsed: SelectedSegment[];
  reframeTelemetry: ReframeTelemetry[];
  projectedTimeline: TimelinePreviewSummary;
  createdAt: string;
}

// ----------------------------------------------------------------------------
// SERVICE INPUTS & OUTPUTS
// ----------------------------------------------------------------------------

export interface CreateOrchestrationPlanInput {
  projectId?: string;
  mediaAssetId?: string;
  mediaUrl?: string;
  audioBase64?: string;
  duration?: number;
  targetDuration?: ShortTargetDuration; // 30, 45, 60
  aspectRatio?: ShortAspectRatio; // '9:16', '1:1', '4:5'
  captionPreset?: CaptionPreset;
  colorPreset?: ColorPreset;
  musicPreset?: MusicPreset;
  duckingAmount?: number; // 0.15 - 0.3
  autoReframeTracking?: AutoReframeMode;
  silenceThreshold?: number;
  title?: string;
}

export interface ValidateOrchestrationPlanInput {
  projectId?: string;
  commands: OrchestrationCommand[];
  targetDuration?: number;
  aspectRatio?: ShortAspectRatio;
}

export interface PlanValidationResult {
  isValid: boolean;
  errors: string[];
  normalizedCommands: OrchestrationCommand[];
  previewTimeline: TimelinePreviewSummary;
}

export interface ApplyOrchestrationPlanInput {
  projectId: string;
  expectedVersion?: number;
  baseVersion?: number;
  planId?: string;
  commands?: OrchestrationCommand[];
  createSnapshot?: boolean;
}
