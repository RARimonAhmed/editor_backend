import { z } from 'zod';

export const editingAnalysisOptionsSchema = z.object({
  detectSilences: z.boolean().default(true),
  minSilenceDuration: z.number().positive().default(0.6),
  silencePadding: z.number().nonnegative().default(0.08),
  detectFillerWords: z.boolean().default(true),
  fillerWordsList: z.array(z.string()).default(['um', 'uh', 'like', 'you know', 'er', 'ah', 'hmm']),
  detectPauses: z.boolean().default(true),
  minPauseDuration: z.number().positive().default(1.2),
  targetPauseDuration: z.number().nonnegative().default(0.4),
  detectScenes: z.boolean().default(true),
  sceneSensitivity: z.number().min(0).max(1).default(0.5),
  detectHighlights: z.boolean().default(true),
  maxHighlightClips: z.number().int().positive().default(5),
});

export const runEditingAnalysisSchema = z
  .object({
    projectId: z.string().uuid().optional(),
    mediaAssetId: z.string().uuid().optional(),
    mediaUrl: z.string().url().optional(),
    transcriptionId: z.string().uuid().optional(),
    audioBase64: z.string().optional(),
    duration: z.number().positive().optional(),
    options: editingAnalysisOptionsSchema.default({}),
  })
  .refine(
    (data) => !!(data.projectId || data.mediaAssetId || data.mediaUrl || data.transcriptionId || data.audioBase64),
    {
      message: 'At least one of projectId, mediaAssetId, mediaUrl, transcriptionId, or audioBase64 must be provided',
      path: ['mediaUrl'],
    }
  );

export const deleteRangeCommandSchema = z.object({
  id: z.string().default(() => ''),
  type: z.literal('DELETE_RANGE'),
  start: z.number(),
  end: z.number(),
  durationSaved: z.number().default(0),
  source: z.enum(['silence', 'pause', 'manual', 'filler']).default('silence'),
  trackIds: z.array(z.string()).optional(),
  confidence: z.number().min(0).max(1).default(0.9),
  reason: z.string().optional(),
  accepted: z.boolean().default(true),
  metadata: z.record(z.unknown()).optional(),
});

export const removeFillerCommandSchema = z.object({
  id: z.string().default(() => ''),
  type: z.literal('REMOVE_FILLER'),
  word: z.string().min(1),
  start: z.number(),
  end: z.number(),
  padding: z.number().default(0.05),
  durationSaved: z.number().default(0),
  confidence: z.number().min(0).max(1).default(0.9),
  reason: z.string().optional(),
  accepted: z.boolean().default(true),
  metadata: z.record(z.unknown()).optional(),
});

export const shortenPauseCommandSchema = z.object({
  id: z.string().default(() => ''),
  type: z.literal('SHORTEN_PAUSE'),
  start: z.number(),
  end: z.number(),
  targetDuration: z.number().default(0.4),
  durationSaved: z.number().default(0),
  confidence: z.number().min(0).max(1).default(0.9),
  reason: z.string().optional(),
  accepted: z.boolean().default(true),
  metadata: z.record(z.unknown()).optional(),
});

export const sceneSplitCommandSchema = z.object({
  id: z.string().default(() => ''),
  type: z.literal('SCENE_SPLIT'),
  time: z.number(),
  sceneIndex: z.number().int().optional(),
  confidence: z.number().min(0).max(1).default(0.9),
  reason: z.string().optional(),
  accepted: z.boolean().default(true),
  metadata: z.record(z.unknown()).optional(),
});

export const createHighlightClipCommandSchema = z.object({
  id: z.string().default(() => ''),
  type: z.literal('CREATE_HIGHLIGHT_CLIP'),
  start: z.number(),
  end: z.number(),
  label: z.string().default('Highlight'),
  score: z.number().min(0).max(1).default(0.8),
  confidence: z.number().min(0).max(1).default(0.9),
  reason: z.string().optional(),
  accepted: z.boolean().default(true),
  metadata: z.record(z.unknown()).optional(),
});

export const addMarkerCommandSchema = z.object({
  id: z.string().default(() => ''),
  type: z.literal('ADD_MARKER'),
  time: z.number(),
  label: z.string().default('Marker'),
  color: z.string().optional(),
  confidence: z.number().min(0).max(1).default(1.0),
  reason: z.string().optional(),
  accepted: z.boolean().default(true),
  metadata: z.record(z.unknown()).optional(),
});

export const editorCommandSchema = z.discriminatedUnion('type', [
  deleteRangeCommandSchema,
  removeFillerCommandSchema,
  shortenPauseCommandSchema,
  sceneSplitCommandSchema,
  createHighlightClipCommandSchema,
  addMarkerCommandSchema,
]);

export const validateCommandsSchema = z.object({
  projectId: z.string().uuid().optional(),
  duration: z.number().positive().optional(),
  commands: z.array(editorCommandSchema),
});

export const applyEditingCommandsSchema = z
  .object({
    projectId: z.string().uuid(),
    expectedVersion: z.number().int().positive().optional(),
    baseVersion: z.number().int().positive().optional(),
    commandIds: z.array(z.string()).optional(),
    commands: z.array(editorCommandSchema).optional(),
    rippleEditing: z.boolean().default(true),
  })
  .refine((data) => data.expectedVersion !== undefined || data.baseVersion !== undefined, {
    message: 'Either expectedVersion or baseVersion is required for concurrency safety',
    path: ['expectedVersion'],
  })
  .refine((data) => (data.commandIds && data.commandIds.length > 0) || (data.commands && data.commands.length > 0), {
    message: 'Either commandIds or commands must be supplied to apply edits',
    path: ['commands'],
  });

export const getAnalysisParamsSchema = z.object({
  id: z.string().uuid('Invalid analysis ID format'),
});
