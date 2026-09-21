import { z } from 'zod';

export const baseCanvasSchema = z.object({
  resolutionWidth: z.number().int().positive().optional(),
  resolutionHeight: z.number().int().positive().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  framerate: z.number().positive().optional(),
  fps: z.number().positive().optional(),
  aspectRatio: z.string().default('16:9'),
  colorSpace: z.string().default('rec709'),
  backgroundColor: z.string().default('#000000'),
});

export const canvasSchema = baseCanvasSchema.transform((data) => ({
  resolutionWidth: data.resolutionWidth || data.width || 1920,
  resolutionHeight: data.resolutionHeight || data.height || 1080,
  framerate: data.framerate || data.fps || 30.0,
  aspectRatio: data.aspectRatio,
  colorSpace: data.colorSpace,
  backgroundColor: data.backgroundColor,
}));

export const clipTextSchema = z
  .object({
    content: z.string().default(''),
    fontFamily: z.string().default('Inter'),
    fontSize: z.number().positive().default(32),
    fontWeight: z.string().default('normal'),
    fontStyle: z.string().default('normal'),
    color: z.string().default('#FFFFFF'),
    backgroundColor: z.string().optional(),
    outlineColor: z.string().optional(),
    outlineWidth: z.number().nonnegative().optional(),
    shadowColor: z.string().optional(),
    alignment: z.enum(['left', 'center', 'right', 'justify']).default('center'),
    letterSpacing: z.number().optional(),
    lineHeight: z.number().optional(),
  })
  .passthrough();

export const clipEffectSchema = z
  .object({
    id: z.string().optional(),
    type: z.string(), // e.g. 'color_grading', 'blur', 'chroma_key', 'lut', 'vignette', 'glitch'
    name: z.string().optional(),
    enabled: z.boolean().default(true),
    parameters: z.record(z.unknown()).default({}),
  })
  .passthrough();

export const clipKeyframeSchema = z
  .object({
    id: z.string().optional(),
    property: z.string(), // 'position' | 'scale' | 'rotation' | 'opacity' | 'volume'
    timeMs: z.number().nonnegative(),
    value: z.unknown(),
    easing: z.string().default('linear'),
  })
  .passthrough();

export const clipAudioSchema = z
  .object({
    volume: z.number().min(0).max(4).default(1.0),
    gainDb: z.number().default(0),
    pan: z.number().min(-1).max(1).default(0),
    fadeInMs: z.number().nonnegative().default(0),
    fadeOutMs: z.number().nonnegative().default(0),
    pitchShift: z.number().default(0),
    equalizer: z.record(z.unknown()).optional(),
  })
  .passthrough();

export const clipCaptionSchema = z
  .object({
    id: z.string().optional(),
    text: z.string(),
    startMs: z.number().nonnegative(),
    endMs: z.number().positive(),
    speaker: z.string().optional(),
    words: z
      .array(
        z.object({
          word: z.string(),
          startMs: z.number(),
          endMs: z.number(),
          confidence: z.number().optional(),
        })
      )
      .optional(),
  })
  .passthrough();

export const timelineClipSchema = z.preprocess(
  (val: any) => {
    if (!val || typeof val !== 'object') return val;
    const start = val.start ?? (val.timelineStartMs != null ? val.timelineStartMs / 1000 : undefined);
    const duration = val.duration ?? (val.durationMs != null ? val.durationMs / 1000 : undefined);
    const sourceStart = val.sourceStart ?? (val.sourceInPointMs != null ? val.sourceInPointMs / 1000 : 0);
    const mediaAssetId = val.mediaAssetId ?? val.assetId;
    return {
      ...val,
      start: start !== undefined ? start : 0,
      duration: duration !== undefined ? duration : 1,
      sourceStart: sourceStart !== undefined ? sourceStart : 0,
      mediaAssetId,
    };
  },
  z
    .object({
      id: z.string(),
      name: z.string().default('Clip'),
      mediaAssetId: z.string().optional(),
      start: z.number().nonnegative(),
      duration: z.number().positive(),
      sourceStart: z.number().nonnegative().default(0),
      speed: z.number().positive().default(1.0),
      volume: z.number().min(0).max(4).default(1.0),
      style: z.record(z.unknown()).optional(),
      transform: z.record(z.unknown()).optional(),
      transitions: z.record(z.unknown()).optional(),
      text: clipTextSchema.optional(),
      effects: z.array(clipEffectSchema).optional(),
      keyframes: z.array(clipKeyframeSchema).optional(),
      audio: clipAudioSchema.optional(),
      captions: z.array(clipCaptionSchema).optional(),
    })
    .passthrough()
);

export const timelineTrackSchema = z.preprocess(
  (val: any) => {
    if (!val || typeof val !== 'object') return val;
    return {
      ...val,
      locked: val.locked ?? val.isLocked ?? false,
      muted: val.muted ?? val.isMuted ?? false,
    };
  },
  z
    .object({
      id: z.string(),
      type: z.enum(['video', 'audio', 'text', 'effect', 'image', 'overlay', 'caption']),
      name: z.string().default('Track'),
      muted: z.boolean().default(false),
      locked: z.boolean().default(false),
      clips: z.array(timelineClipSchema).default([]),
      effects: z.array(clipEffectSchema).optional(),
    })
    .passthrough()
);

export const timelineMarkerSchema = z.preprocess(
  (val: any) => {
    if (!val || typeof val !== 'object') return val;
    const time = val.time ?? (val.positionMs != null ? val.positionMs / 1000 : 0);
    return {
      ...val,
      time,
      color: val.color ?? (val.colorValue != null ? `#${(val.colorValue & 0x00ffffff).toString(16).padStart(6, '0')}` : undefined),
    };
  },
  z
    .object({
      id: z.string().optional(),
      time: z.number().nonnegative(),
      label: z.string().default(''),
      color: z.string().optional(),
      colorValue: z.number().optional(),
    })
    .passthrough()
);

export const timelineDataSchema = z.object({
  duration: z.number().nonnegative().default(0),
  framerate: z.number().positive().default(30),
  tracks: z.array(timelineTrackSchema).default([]),
  markers: z.array(timelineMarkerSchema).default([]),
});

export const projectAssetSchema = z.preprocess(
  (val: any) => {
    if (!val || typeof val !== 'object') return val;
    const mediaAssetId = val.mediaAssetId ?? val.id;
    const uri = val.uri ?? val.source?.pathOrUri;
    const sizeBytes = val.sizeBytes ?? val.fileSizeBytes;
    return {
      ...val,
      mediaAssetId,
      uri,
      sizeBytes,
    };
  },
  z
    .object({
      id: z.string(),
      mediaAssetId: z.string().optional(),
      name: z.string(),
      type: z.enum(['video', 'audio', 'image', 'font', 'lut', 'other']).default('video'),
      uri: z.string().optional(),
      sizeBytes: z.number().optional(),
      duration: z.number().optional(),
      thumbnailUrl: z.string().optional(),
    })
    .passthrough()
);

export const projectSettingsSchema = z.object({
  autoSaveIntervalSeconds: z.number().int().positive().default(30),
  snapToGrid: z.boolean().default(true),
  rippleEditing: z.boolean().default(false),
  proxyEnabled: z.boolean().default(true),
  defaultAudioGain: z.number().default(0),
  exportSettings: z.record(z.unknown()).optional(),
});

function preprocessProjectInput(val: any) {
  if (!val || typeof val !== 'object') return val;
  const data = { ...val };

  // 1. Flutter Canvas Resolution format: { resolution: { width, height } }
  if (data.resolution && typeof data.resolution === 'object') {
    data.resolutionWidth = data.resolutionWidth ?? data.resolution.width;
    data.resolutionHeight = data.resolutionHeight ?? data.resolution.height;
  }
  if (data.frameRate != null && data.framerate == null) {
    data.framerate = data.frameRate;
  }

  // 2. Flutter top-level tracks array: auto-wrap into timeline if timeline is omitted
  if (Array.isArray(data.tracks) && !data.timeline && !data.timelineData) {
    const durationSeconds =
      data.durationMs != null
        ? data.durationMs / 1000
        : typeof data.duration === 'number'
          ? data.duration
          : 0;
    data.timeline = {
      duration: durationSeconds,
      framerate: data.framerate ?? 30,
      tracks: data.tracks,
      markers: Array.isArray(data.markers) ? data.markers : [],
    };
  }

  return data;
}

export const createProjectSchema: z.ZodType<any> = z.preprocess(
  preprocessProjectInput,
  z
    .object({
      title: z.string().min(1, 'Project title is required').default('Untitled Project'),
      description: z.string().max(1000).optional(),
      canvas: canvasSchema.optional(),
      timeline: timelineDataSchema.optional(),
      timelineData: timelineDataSchema.optional(), // backward compatibility
      assets: z.array(projectAssetSchema).default([]),
      settings: projectSettingsSchema.optional(),
      // Flat canvas helpers for backward compatibility
      resolutionWidth: z.number().int().positive().optional(),
      resolutionHeight: z.number().int().positive().optional(),
      framerate: z.number().positive().optional(),
      aspectRatio: z.string().optional(),
    })
    .passthrough()
);

export const updateProjectSchema: z.ZodType<any> = z.preprocess(
  preprocessProjectInput,
  z
    .object({
      title: z.string().min(1).optional(),
      description: z.string().max(1000).nullable().optional(),
      status: z.enum(['active', 'archived', 'deleted']).optional(),
      canvas: baseCanvasSchema.partial().optional(),
      timeline: timelineDataSchema.optional(),
      timelineData: timelineDataSchema.optional(), // backward compatibility
      assets: z.array(projectAssetSchema).optional(),
      settings: projectSettingsSchema.partial().optional(),
      thumbnailUrl: z.string().nullable().optional(),
      // Flat canvas helpers for backward compatibility
      resolutionWidth: z.number().int().positive().optional(),
      resolutionHeight: z.number().int().positive().optional(),
      framerate: z.number().positive().optional(),
      aspectRatio: z.string().optional(),
      // Optimistic Concurrency Control
      expectedVersion: z.number().int().positive().optional(),
      baseVersion: z.number().int().positive().optional(),
    })
    .passthrough()
);

export const autosaveProjectSchema: z.ZodType<any> = z.preprocess(
  preprocessProjectInput,
  z
    .object({
      baseVersion: z.number().int().positive('baseVersion is required for autosave conflict checking'),
      clientMutationId: z.string().optional(),
      clientTimestamp: z.string().optional(),
      canvas: baseCanvasSchema.partial().optional(),
      timeline: timelineDataSchema.optional(),
      timelineData: timelineDataSchema.optional(),
      assets: z.array(projectAssetSchema).optional(),
      settings: projectSettingsSchema.partial().optional(),
      changeSummary: z.string().optional(),
      device: z
        .object({
          deviceFingerprint: z.string().optional(),
          deviceName: z.string().optional(),
          deviceType: z.string().optional(),
          appVersion: z.string().optional(),
        })
        .optional(),
    })
    .passthrough()
);

export const renameProjectSchema = z.object({
  title: z.string().min(1, 'Project title is required'),
  expectedVersion: z.number().int().positive().optional(),
});

export const duplicateProjectSchema = z.object({
  newTitle: z.string().min(1).optional(),
});

export const createBackupSchema = z.object({
  name: z.string().min(1).default('Project Backup Snapshot'),
  description: z.string().max(1000).optional(),
});

export const deleteProjectQuerySchema = z.object({
  permanent: z
    .preprocess((val) => val === true || val === 'true', z.boolean())
    .default(false),
});

export const listProjectsQuerySchema = z.object({
  search: z.string().optional(),
  q: z.string().optional(),
  status: z.enum(['active', 'archived', 'deleted', 'all']).default('active'),
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().nonnegative().default(0),
  sortBy: z.enum(['updatedAt', 'createdAt', 'title']).default('updatedAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type CanvasConfig = z.infer<typeof canvasSchema>;
export type TimelineData = z.infer<typeof timelineDataSchema>;
export type TimelineTrack = z.infer<typeof timelineTrackSchema>;
export type TimelineClip = z.infer<typeof timelineClipSchema>;
export type ClipText = z.infer<typeof clipTextSchema>;
export type ClipEffect = z.infer<typeof clipEffectSchema>;
export type ClipKeyframe = z.infer<typeof clipKeyframeSchema>;
export type ClipAudio = z.infer<typeof clipAudioSchema>;
export type ClipCaption = z.infer<typeof clipCaptionSchema>;
export type ProjectAsset = z.infer<typeof projectAssetSchema>;
export type ProjectSettings = z.infer<typeof projectSettingsSchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type AutosaveProjectInput = z.infer<typeof autosaveProjectSchema>;
export type RenameProjectInput = z.infer<typeof renameProjectSchema>;
export type DuplicateProjectInput = z.infer<typeof duplicateProjectSchema>;
export type CreateBackupInput = z.infer<typeof createBackupSchema>;
export type DeleteProjectQuery = z.infer<typeof deleteProjectQuerySchema>;
export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;
