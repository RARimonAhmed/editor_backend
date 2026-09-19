import { z } from 'zod';

export const commandCategoryEnum = z.enum([
  'timeline',
  'clip',
  'trim',
  'split',
  'delete',
  'ripple',
  'transform',
  'text',
  'effects',
  'color',
  'audio',
  'caption',
  'canvas',
  'reframe',
  'export',
]);

// Anti-code injection parameter sanitizer: disallows script tags, javascript: URI, eval(), template literals
const forbiddenCodeInjectionPattern = /<script|javascript:|eval\(|\${|<\/script/i;

export const safeParameterSchema = z.union([
  z.string().refine((val) => !forbiddenCodeInjectionPattern.test(val) && !val.includes('`') && !val.includes('<') && !val.includes('>'), {
    message: 'String contains forbidden characters or potential code injection',
  }),
  z.number().finite(),
  z.boolean(),
  z.record(z.unknown()),
  z.array(z.unknown()),
]);

export const editorCommandSchema = z.object({
  id: z.string().default(() => Math.random().toString(36).substring(2, 9)),
  category: commandCategoryEnum,
  action: z.string().min(1).max(100).regex(/^[A-Z0-9_]+$/, 'Action must be upper snake case (e.g. DELETE_RANGE)'),
  targetTrackId: z.string().optional(),
  targetClipId: z.string().optional(),
  timeRange: z
    .object({
      start: z.number().min(0, 'Start time must be non-negative'),
      end: z.number().min(0, 'End time must be non-negative'),
    })
    .refine((data) => data.end >= data.start, {
      message: 'End time must be greater than or equal to start time',
    })
    .optional(),
  parameters: z.record(safeParameterSchema).default({}),
  confidence: z.number().min(0).max(1).default(1.0),
  explanation: z.string().max(500).default(''),
});

export const interpretPromptSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required').max(2000),
  projectId: z.string().uuid().optional(),
  selectedClipId: z.string().optional(),
  playheadPosition: z.number().min(0).default(0),
  timelineContext: z
    .object({
      duration: z.number().min(0).default(0),
      currentPlayhead: z.number().min(0).default(0),
      selectedClipId: z.string().optional(),
      selectedTrackId: z.string().optional(),
      aspectRatio: z.string().optional(),
      tracks: z.array(z.any()).optional(),
    })
    .optional(),
});

export const validateCommandsSchema = z.object({
  commands: z.array(editorCommandSchema).min(1, 'At least one command is required'),
  projectId: z.string().uuid().optional(),
  timelineDuration: z.number().min(0).optional(),
});

export const executeCommandsSchema = z.object({
  commands: z.array(editorCommandSchema).min(1, 'At least one command is required'),
  projectId: z.string().uuid(),
  expectedVersion: z.number().int().optional(),
  clientTimestamp: z.string().optional(),
  deviceId: z.string().optional(),
});
