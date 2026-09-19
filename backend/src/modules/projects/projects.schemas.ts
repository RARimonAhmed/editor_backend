import { z } from 'zod';

export const timelineClipSchema = z.object({
  id: z.string(),
  name: z.string(),
  mediaAssetId: z.string().optional(),
  start: z.number().nonnegative(),
  duration: z.number().positive(),
  sourceStart: z.number().nonnegative().default(0),
  speed: z.number().positive().default(1.0),
  volume: z.number().min(0).max(2).default(1.0),
  style: z.record(z.unknown()).optional(),
});

export const timelineTrackSchema = z.object({
  id: z.string(),
  type: z.enum(['video', 'audio', 'text', 'effect']),
  name: z.string(),
  muted: z.boolean().default(false),
  locked: z.boolean().default(false),
  clips: z.array(timelineClipSchema).default([]),
});

export const timelineDataSchema = z.object({
  duration: z.number().nonnegative().default(0),
  framerate: z.number().positive().default(30),
  tracks: z.array(timelineTrackSchema).default([]),
  markers: z.array(z.object({ time: z.number(), label: z.string() })).default([]),
});

export const createProjectSchema = z.object({
  title: z.string().min(1, 'Project title is required').default('Untitled Project'),
  resolutionWidth: z.number().int().positive().default(1920),
  resolutionHeight: z.number().int().positive().default(1080),
  framerate: z.number().positive().default(30.0),
  aspectRatio: z.string().default('16:9'),
  timelineData: timelineDataSchema.optional(),
});

export const updateProjectSchema = z.object({
  title: z.string().min(1).optional(),
  resolutionWidth: z.number().int().positive().optional(),
  resolutionHeight: z.number().int().positive().optional(),
  framerate: z.number().positive().optional(),
  aspectRatio: z.string().optional(),
  timelineData: timelineDataSchema.optional(),
  thumbnailUrl: z.string().url().optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type TimelineData = z.infer<typeof timelineDataSchema>;
