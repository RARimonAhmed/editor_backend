import { z } from 'zod';
import { CopilotCommandAction } from './copilot.types.js';

export const allowedCopilotActions = [
  'ADD_CLIP',
  'DELETE_CLIP',
  'SPLIT_CLIP',
  'TRIM_CLIP',
  'MOVE_CLIP',
  'RIPPLE_DELETE',
  'DUPLICATE_CLIP',
  'SET_TRANSFORM',
  'SET_CROP',
  'SET_CANVAS',
  'ADD_TEXT',
  'UPDATE_TEXT',
  'ADD_EFFECT',
  'REMOVE_EFFECT',
  'UPDATE_EFFECT',
  'ADD_KEYFRAME',
  'UPDATE_KEYFRAME',
  'SET_AUDIO',
  'ADD_CAPTION',
  'UPDATE_CAPTION',
  'SET_SPEED',
] as const;

export const copilotActionEnum = z.enum(allowedCopilotActions);

// Anti-code injection parameter sanitizer: disallows script tags, javascript: URI, eval(), template literals
const forbiddenCodeInjectionPattern = /<script|javascript:|eval\(|\${|<\/script/i;

export const safeParameterSchema = z.union([
  z.string().refine(
    (val) => !forbiddenCodeInjectionPattern.test(val) && !val.includes('`') && !val.includes('<script') && !val.includes('javascript:'),
    { message: 'String contains forbidden characters or potential code injection' }
  ),
  z.number().finite(),
  z.boolean(),
  z.record(z.unknown()),
  z.array(z.unknown()),
]);

export const copilotCommandSchema = z.object({
  id: z.string().default(() => Math.random().toString(36).substring(2, 9)),
  action: copilotActionEnum,
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
  explanation: z.string().max(1000).default(''),
  confidence: z.number().min(0).max(1).default(1.0),
});

export const copilotRequestSchema = z.object({
  projectId: z.string().uuid('Valid project ID required'),
  projectVersion: z.number().int().min(1).optional(),
  prompt: z.string().min(1, 'Prompt cannot be empty').max(2000, 'Prompt exceeds 2000 characters limit'),
  selectedClipId: z.string().optional(),
  selectedTrackId: z.string().optional(),
  playheadPosition: z.number().min(0).default(0),
  timelineContext: z
    .object({
      duration: z.number().min(0).optional(),
      currentPlayhead: z.number().min(0).optional(),
      selectedClipId: z.string().optional(),
      selectedTrackId: z.string().optional(),
      aspectRatio: z.string().optional(),
      resolutionWidth: z.number().int().positive().optional(),
      resolutionHeight: z.number().int().positive().optional(),
      tracks: z.array(z.any()).optional(),
    })
    .optional(),
  provider: z.enum(['gemini', 'openai', 'mock', 'fake']).optional(),
  model: z.string().max(100).optional(),
});

export const estimatedImpactSchema = z.object({
  affectedTracks: z.array(z.string()).default([]),
  affectedClips: z.array(z.string()).default([]),
  durationDelta: z.number().default(0),
  newEstimatedDuration: z.number().min(0).optional(),
});

export const editorCommandPlanSchema = z.object({
  planId: z.string().uuid(),
  projectId: z.string().uuid(),
  projectVersion: z.number().int().min(1),
  explanation: z.string().min(1),
  commands: z.array(copilotCommandSchema).min(1, 'Plan must contain at least one command'),
  warnings: z.array(z.string()).default([]),
  estimatedImpact: estimatedImpactSchema.default({
    affectedTracks: [],
    affectedClips: [],
    durationDelta: 0,
  }),
  createdAt: z.string(),
  appliedAt: z.string().nullable().optional(),
  status: z.enum(['generated', 'validated', 'applied', 'rejected']).default('generated'),
});

/**
 * JSON Schema for LLM function calling / structured generation
 */
export const copilotStructuredPlanJsonSchema = {
  type: 'object',
  required: ['explanation', 'commands'],
  properties: {
    explanation: {
      type: 'string',
      description: 'Human-readable explanation of what edits this command plan performs.',
    },
    commands: {
      type: 'array',
      description: 'Ordered sequence of structured timeline editing operations.',
      items: {
        type: 'object',
        required: ['action', 'explanation'],
        properties: {
          action: {
            type: 'string',
            enum: allowedCopilotActions,
            description: 'The strict editor command action.',
          },
          targetTrackId: {
            type: 'string',
            description: 'Optional ID of the track targeted by this command.',
          },
          targetClipId: {
            type: 'string',
            description: 'Optional ID of the clip targeted by this command.',
          },
          timeRange: {
            type: 'object',
            properties: {
              start: { type: 'number', minimum: 0 },
              end: { type: 'number', minimum: 0 },
            },
          },
          parameters: {
            type: 'object',
            description: 'Command parameters like scale, volume, text, effectType, etc.',
          },
          explanation: {
            type: 'string',
            description: 'Brief explanation of this specific command.',
          },
        },
      },
    },
    warnings: {
      type: 'array',
      items: { type: 'string' },
      description: 'Potential conflicts, overlaps, or edge cases.',
    },
    estimatedImpact: {
      type: 'object',
      properties: {
        affectedTracks: { type: 'array', items: { type: 'string' } },
        affectedClips: { type: 'array', items: { type: 'string' } },
        durationDelta: { type: 'number' },
        newEstimatedDuration: { type: 'number' },
      },
    },
  },
};
