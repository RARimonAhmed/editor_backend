/**
 * Domain types for AI-Assisted Video Editing Analysis
 * Strictly maintains separation: AI generates commands -> Frontend/User previews -> ProjectBloc mutates timeline.
 */

export type EditorCommandType =
  | 'DELETE_RANGE'
  | 'REMOVE_FILLER'
  | 'SHORTEN_PAUSE'
  | 'SCENE_SPLIT'
  | 'CREATE_HIGHLIGHT_CLIP'
  | 'ADD_MARKER';

export interface BaseEditorCommand {
  id: string;
  type: EditorCommandType;
  confidence: number;
  reason?: string;
  accepted: boolean;
  metadata?: Record<string, unknown>;
}

export interface DeleteRangeCommand extends BaseEditorCommand {
  type: 'DELETE_RANGE';
  start: number;
  end: number;
  durationSaved: number;
  source?: 'silence' | 'pause' | 'manual' | 'filler';
  trackIds?: string[];
}

export interface RemoveFillerCommand extends BaseEditorCommand {
  type: 'REMOVE_FILLER';
  word: string;
  start: number;
  end: number;
  padding?: number;
  durationSaved: number;
}

export interface ShortenPauseCommand extends BaseEditorCommand {
  type: 'SHORTEN_PAUSE';
  start: number;
  end: number;
  targetDuration: number;
  durationSaved: number;
}

export interface SceneSplitCommand extends BaseEditorCommand {
  type: 'SCENE_SPLIT';
  time: number;
  sceneIndex?: number;
}

export interface CreateHighlightClipCommand extends BaseEditorCommand {
  type: 'CREATE_HIGHLIGHT_CLIP';
  start: number;
  end: number;
  label: string;
  score: number;
}

export interface AddMarkerCommand extends BaseEditorCommand {
  type: 'ADD_MARKER';
  time: number;
  label: string;
  color?: string;
}

export type EditorCommand =
  | DeleteRangeCommand
  | RemoveFillerCommand
  | ShortenPauseCommand
  | SceneSplitCommand
  | CreateHighlightClipCommand
  | AddMarkerCommand;

export interface SilenceDetectionItem {
  id: string;
  start: number;
  end: number;
  duration: number;
  confidence: number;
}

export interface FillerWordItem {
  id: string;
  word: string;
  start: number;
  end: number;
  confidence: number;
}

export interface PauseItem {
  id: string;
  start: number;
  end: number;
  duration: number;
  targetDuration: number;
  recommendation: string;
}

export interface SpeechSegmentItem {
  id: string;
  start: number;
  end: number;
  wordCount: number;
  speakingRateWpm: number;
  text?: string;
}

export interface SceneBoundaryItem {
  id: string;
  time: number;
  sceneIndex: number;
  confidence: number;
}

export interface HighlightCandidateItem {
  id: string;
  start: number;
  end: number;
  label: string;
  score: number;
  reason: string;
}

export interface AnalysisFeatures {
  silences: SilenceDetectionItem[];
  fillerWords: FillerWordItem[];
  pauses: PauseItem[];
  speechSegments: SpeechSegmentItem[];
  sceneBoundaries: SceneBoundaryItem[];
  highlightCandidates: HighlightCandidateItem[];
}

export interface AnalysisSummary {
  totalSilences: number;
  totalFillerWords: number;
  totalPauses: number;
  totalSceneSplits: number;
  totalHighlights: number;
  potentialDurationReduction: number;
  speakingRateAvgWpm: number;
}

export interface TimelinePreviewDiff {
  originalDuration: number;
  projectedDuration: number;
  totalDurationSaved: number;
  cutsCount: number;
  splitsCount: number;
  affectedTracksCount: number;
  affectedClipsCount: number;
}

export interface AIEditingAnalysisResult {
  id: string;
  userId: string;
  projectId?: string;
  mediaAssetId?: string;
  duration: number;
  summary: AnalysisSummary;
  features: AnalysisFeatures;
  commands: EditorCommand[];
  previewMetrics: TimelinePreviewDiff;
  createdAt: string;
}

export interface EditingAnalysisOptions {
  detectSilences?: boolean;
  minSilenceDuration?: number;
  silencePadding?: number;
  detectFillerWords?: boolean;
  fillerWordsList?: string[];
  detectPauses?: boolean;
  minPauseDuration?: number;
  targetPauseDuration?: number;
  detectScenes?: boolean;
  sceneSensitivity?: number;
  detectHighlights?: boolean;
  maxHighlightClips?: number;
}

export interface RunEditingAnalysisInput {
  projectId?: string;
  mediaAssetId?: string;
  mediaUrl?: string;
  transcriptionId?: string;
  audioBase64?: string;
  duration?: number;
  options?: EditingAnalysisOptions;
}

export interface ValidateCommandsInput {
  projectId?: string;
  duration?: number;
  commands: EditorCommand[];
}

export interface CommandValidationResult {
  isValid: boolean;
  errors: string[];
  normalizedCommands: EditorCommand[];
  previewMetrics: TimelinePreviewDiff;
}

export interface ApplyEditingCommandsInput {
  projectId: string;
  expectedVersion?: number;
  baseVersion?: number;
  commandIds?: string[];
  commands?: EditorCommand[];
  rippleEditing?: boolean;
}
