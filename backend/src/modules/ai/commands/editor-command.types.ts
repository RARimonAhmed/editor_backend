/**
 * Natural-Language AI Editor Command System Domain Types
 * 15 Distinct Command Categories covering professional desktop/mobile NLE editing.
 */

export type CommandCategory =
  | 'timeline'
  | 'clip'
  | 'trim'
  | 'split'
  | 'delete'
  | 'ripple'
  | 'transform'
  | 'text'
  | 'effects'
  | 'color'
  | 'audio'
  | 'caption'
  | 'canvas'
  | 'reframe'
  | 'export';

export interface EditorCommand {
  id: string;
  category: CommandCategory;
  action: string;
  targetTrackId?: string;
  targetClipId?: string;
  timeRange?: {
    start: number;
    end: number;
  };
  parameters: Record<string, unknown>;
  confidence: number;
  explanation: string;
}

export interface CommandIntent {
  rawPrompt: string;
  primaryIntent: string;
  detectedCategories: CommandCategory[];
  confidence: number;
  targetEntity?: {
    type: 'clip' | 'track' | 'timeline' | 'range';
    id?: string;
  };
  commands: EditorCommand[];
  summary: string;
}

export interface CommandValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  validatedCommands: EditorCommand[];
}

export interface CommandExecutionPreview {
  affectedClips: string[];
  affectedTracks: string[];
  timelineDurationDelta: number;
  newEstimatedDuration: number;
  summary: string;
  projectBlocActions: Array<{
    type: string;
    payload: Record<string, unknown>;
  }>;
}

export interface CommandPlan {
  id: string;
  userId: string;
  projectId?: string;
  prompt: string;
  intent: CommandIntent;
  commands: EditorCommand[];
  validation: CommandValidationResult;
  preview: CommandExecutionPreview;
  createdAt: string;
}

export interface TimelineContext {
  duration: number;
  currentPlayhead: number;
  selectedClipId?: string;
  selectedTrackId?: string;
  aspectRatio?: string;
  tracks?: Array<{
    id: string;
    name: string;
    type: 'video' | 'audio' | 'text' | 'overlay';
    clips: Array<{
      id: string;
      name: string;
      startTime: number;
      endTime: number;
      duration: number;
    }>;
  }>;
}
