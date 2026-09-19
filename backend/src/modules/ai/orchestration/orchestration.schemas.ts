import { z } from 'zod';

export const shortTargetDurationSchema = z.union([
  z.literal(30),
  z.literal(45),
  z.literal(60),
  z.number().min(15).max(180),
]);

export const shortAspectRatioSchema = z.enum(['9:16', '1:1', '4:5', '16:9']);

export const captionPresetSchema = z.enum(['bold_yellow', 'clean_white', 'karaoke_glow', 'minimal']);

export const colorPresetSchema = z.enum([
  'cinematic_warm',
  'vibrant_boost',
  'punchy_contrast',
  'clean_documentary',
  'cool_modern',
  'none',
]);

export const musicPresetSchema = z.enum([
  'upbeat_ambient',
  'cinematic_chill',
  'lofi_beat',
  'high_energy',
  'none',
]);

export const autoReframeModeSchema = z.enum(['face', 'object', 'center', 'auto']);

export const createOrchestrationPlanSchema = z
  .object({
    projectId: z.string().uuid().optional(),
    mediaAssetId: z.string().uuid().optional(),
    mediaUrl: z.string().url().optional(),
    audioBase64: z.string().optional(),
    duration: z.number().positive().optional(),
    targetDuration: shortTargetDurationSchema.default(60),
    aspectRatio: shortAspectRatioSchema.default('9:16'),
    captionPreset: captionPresetSchema.default('bold_yellow'),
    colorPreset: colorPresetSchema.default('cinematic_warm'),
    musicPreset: musicPresetSchema.default('upbeat_ambient'),
    duckingAmount: z.number().min(0).max(1).default(0.2),
    autoReframeTracking: autoReframeModeSchema.default('auto'),
    silenceThreshold: z.number().min(0.2).max(3.0).default(0.5),
    title: z.string().max(200).optional(),
  })
  .refine(
    (data) => !!(data.projectId || data.mediaAssetId || data.mediaUrl || data.audioBase64),
    {
      message: 'At least one of projectId, mediaAssetId, mediaUrl, or audioBase64 must be provided',
      path: ['mediaUrl'],
    }
  );

export const sequenceClipItemSchema = z.object({
  id: z.string(),
  mediaAssetId: z.string().optional(),
  sourceStart: z.number().nonnegative(),
  duration: z.number().positive(),
  targetStart: z.number().nonnegative(),
  speed: z.number().positive().default(1.0),
  volume: z.number().min(0).max(2).default(1.0),
  name: z.string().optional(),
});

export const setCanvasCommandSchema = z.object({
  id: z.string(),
  type: z.literal('SET_CANVAS'),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  aspectRatio: shortAspectRatioSchema,
  framerate: z.number().positive().optional(),
  backgroundColor: z.string().optional(),
  confidence: z.number().min(0).max(1).default(1.0),
  accepted: z.boolean().default(true),
  reason: z.string().optional(),
});

export const createSequenceCommandSchema = z.object({
  id: z.string(),
  type: z.literal('CREATE_SEQUENCE'),
  targetDuration: z.number().positive(),
  clips: z.array(sequenceClipItemSchema),
  trackCount: z.number().int().positive().default(4),
  confidence: z.number().min(0).max(1).default(0.95),
  accepted: z.boolean().default(true),
  reason: z.string().optional(),
});

export const deleteRangeCommandSchema = z.object({
  id: z.string(),
  type: z.literal('DELETE_RANGE'),
  start: z.number().nonnegative(),
  end: z.number().positive(),
  durationSaved: z.number().nonnegative().default(0),
  source: z.enum(['silence', 'filler', 'pause']).default('silence'),
  trackIds: z.array(z.string()).optional(),
  confidence: z.number().min(0).max(1).default(0.9),
  accepted: z.boolean().default(true),
  reason: z.string().optional(),
});

export const reframeKeyframeSchema = z.object({
  time: z.number().nonnegative(),
  focalX: z.number().min(0).max(1),
  focalY: z.number().min(0).max(1),
  scale: z.number().positive().default(1.0),
  cropBox: z.object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().min(0).max(1),
    height: z.number().min(0).max(1),
  }),
});

export const setReframeCommandSchema = z.object({
  id: z.string(),
  type: z.literal('SET_REFRAME'),
  clipId: z.string(),
  aspectRatio: shortAspectRatioSchema,
  trackingMode: autoReframeModeSchema,
  keyframes: z.array(reframeKeyframeSchema),
  averageFocalPoint: z.object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
  }),
  confidence: z.number().min(0).max(1).default(0.92),
  accepted: z.boolean().default(true),
  reason: z.string().optional(),
});

export const addCaptionsCommandSchema = z.object({
  id: z.string(),
  type: z.literal('ADD_CAPTIONS'),
  trackId: z.string().default('track-captions'),
  preset: captionPresetSchema,
  style: z.object({
    fontFamily: z.string(),
    fontSize: z.number().positive(),
    textColor: z.string(),
    backgroundColor: z.string().optional(),
    highlightColor: z.string(),
    position: z.enum(['center', 'lower_third', 'bottom']),
    preset: captionPresetSchema,
    safeZoneMargin: z.number(),
  }),
  captions: z.array(
    z.object({
      id: z.string(),
      start: z.number().nonnegative(),
      end: z.number().positive(),
      text: z.string(),
      words: z.array(
        z.object({
          word: z.string(),
          start: z.number().nonnegative(),
          end: z.number().positive(),
          confidence: z.number().min(0).max(1),
        })
      ),
    })
  ),
  confidence: z.number().min(0).max(1).default(0.96),
  accepted: z.boolean().default(true),
  reason: z.string().optional(),
});

export const addAudioCommandSchema = z.object({
  id: z.string(),
  type: z.literal('ADD_AUDIO'),
  trackId: z.string().default('track-music'),
  assetId: z.string().optional(),
  preset: musicPresetSchema.optional(),
  start: z.number().nonnegative().default(0),
  duration: z.number().positive(),
  volume: z.number().min(0).max(2).default(0.8),
  loop: z.boolean().default(true),
  fadeInSeconds: z.number().nonnegative().default(0.5),
  fadeOutSeconds: z.number().nonnegative().default(1.0),
  confidence: z.number().min(0).max(1).default(0.9),
  accepted: z.boolean().default(true),
  reason: z.string().optional(),
});

export const setAudioDuckingCommandSchema = z.object({
  id: z.string(),
  type: z.literal('SET_AUDIO_DUCKING'),
  musicTrackId: z.string().default('track-music'),
  speechTrackId: z.string().default('track-audio-primary'),
  duckVolume: z.number().min(0).max(1).default(0.2),
  attackTime: z.number().nonnegative().default(0.3),
  releaseTime: z.number().nonnegative().default(0.6),
  duckingRanges: z.array(
    z.object({
      start: z.number().nonnegative(),
      end: z.number().positive(),
      targetVolume: z.number().min(0).max(1),
    })
  ),
  confidence: z.number().min(0).max(1).default(0.94),
  accepted: z.boolean().default(true),
  reason: z.string().optional(),
});

export const addEffectCommandSchema = z.object({
  id: z.string(),
  type: z.literal('ADD_EFFECT'),
  clipId: z.string().optional(),
  trackId: z.string().optional(),
  effectType: z.enum(['color_preset', 'lut']).default('color_preset'),
  config: z.object({
    preset: colorPresetSchema,
    lutName: z.string().optional(),
    contrast: z.number().default(1.0),
    saturation: z.number().default(1.0),
    temperature: z.number().default(0),
    exposure: z.number().default(0),
    vignette: z.number().optional(),
  }),
  confidence: z.number().min(0).max(1).default(0.9),
  accepted: z.boolean().default(true),
  reason: z.string().optional(),
});

export const orchestrationCommandSchema = z.discriminatedUnion('type', [
  setCanvasCommandSchema,
  createSequenceCommandSchema,
  deleteRangeCommandSchema,
  setReframeCommandSchema,
  addCaptionsCommandSchema,
  addAudioCommandSchema,
  setAudioDuckingCommandSchema,
  addEffectCommandSchema,
]);

export const validateOrchestrationPlanSchema = z.object({
  projectId: z.string().uuid().optional(),
  commands: z.array(orchestrationCommandSchema),
  targetDuration: z.number().positive().optional(),
  aspectRatio: shortAspectRatioSchema.optional(),
});

export const applyOrchestrationPlanSchema = z.object({
  projectId: z.string().uuid(),
  expectedVersion: z.number().int().positive().optional(),
  baseVersion: z.number().int().positive().optional(),
  planId: z.string().uuid().optional(),
  commands: z.array(orchestrationCommandSchema).optional(),
  createSnapshot: z.boolean().default(true),
});

export const orchestrationParamsSchema = z.object({
  id: z.string().uuid(),
});
