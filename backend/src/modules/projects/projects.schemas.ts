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

export const timelineClipSchema = z.object({
  id: z.string(),
  name: z.string().default('Clip'),
  mediaAssetId: z.string().optional(),
  start: z.number().nonnegative(),
  duration: z.number().positive(),
  sourceStart: z.number().nonnegative().default(0),
  speed: z.number().positive().default(1.0),
  volume: z.number().min(0).max(2).default(1.0),
  style: z.record(z.unknown()).optional(),
  transform: z.record(z.unknown()).optional(),
  transitions: z.record(z.unknown()).optional(),
});

export const timelineTrackSchema = z.object({
  id: z.string(),
  type: z.enum(['video', 'audio', 'text', 'effect']),
  name: z.string().default('Track'),
  muted: z.boolean().default(false),
  locked: z.boolean().default(false),
  clips: z.array(timelineClipSchema).default([]),
});

export const timelineMarkerSchema = z.object({
  id: z.string().optional(),
  time: z.number().nonnegative(),
  label: z.string(),
  color: z.string().optional(),
});

export const timelineDataSchema = z.object({
  duration: z.number().nonnegative().default(0),
  framerate: z.number().positive().default(30),
  tracks: z.array(timelineTrackSchema).default([]),
  markers: z.array(timelineMarkerSchema).default([]),
});

export const projectAssetSchema = z.object({
  id: z.string(),
  mediaAssetId: z.string().optional(),
  name: z.string(),
  type: z.enum(['video', 'audio', 'image', 'font', 'lut', 'other']).default('video'),
  uri: z.string().optional(),
  sizeBytes: z.number().optional(),
  duration: z.number().optional(),
  thumbnailUrl: z.string().optional(),
});

export const projectSettingsSchema = z.object({
  autoSaveIntervalSeconds: z.number().int().positive().default(30),
  snapToGrid: z.boolean().default(true),
  rippleEditing: z.boolean().default(false),
  proxyEnabled: z.boolean().default(true),
  defaultAudioGain: z.number().default(0),
  exportSettings: z.record(z.unknown()).optional(),
});

export const createProjectSchema = z.object({
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
});

export const updateProjectSchema = z.object({
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
});

export const autosaveProjectSchema = z.object({
  baseVersion: z.number().int().positive('baseVersion is required for autosave conflict checking'),
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
});

export const duplicateProjectSchema = z.object({
  newTitle: z.string().min(1).optional(),
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
export type ProjectAsset = z.infer<typeof projectAssetSchema>;
export type ProjectSettings = z.infer<typeof projectSettingsSchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type AutosaveProjectInput = z.infer<typeof autosaveProjectSchema>;
export type DuplicateProjectInput = z.infer<typeof duplicateProjectSchema>;
export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;
