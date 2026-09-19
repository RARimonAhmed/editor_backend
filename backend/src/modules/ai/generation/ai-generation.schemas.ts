import { z } from 'zod';

export const generateImageSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required').max(2000),
  negativePrompt: z.string().max(1000).optional(),
  width: z.number().int().min(256).max(4096).default(1024),
  height: z.number().int().min(256).max(4096).default(1024),
  aspectRatio: z.enum(['1:1', '16:9', '9:16', '4:5']).default('1:1'),
  count: z.number().int().min(1).max(4).default(1),
  projectId: z.string().uuid().optional(),
  model: z.string().optional(),
  provider: z.string().optional(),
});

export const generateVideoSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required').max(2000),
  imageUrl: z.string().url().optional(),
  durationSeconds: z.number().min(2).max(60).default(5),
  fps: z.number().int().min(24).max(60).default(30),
  resolution: z.enum(['720p', '1080p', '4k']).default('1080p'),
  aspectRatio: z.enum(['16:9', '9:16', '1:1']).default('16:9'),
  projectId: z.string().uuid().optional(),
  model: z.string().optional(),
  provider: z.string().optional(),
});

export const generateMusicSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required').max(1000),
  genre: z.string().max(100).optional(),
  tempoBpm: z.number().min(40).max(220).optional(),
  durationSeconds: z.number().min(5).max(300).default(30),
  mood: z.string().max(100).optional(),
  projectId: z.string().uuid().optional(),
  model: z.string().optional(),
  provider: z.string().optional(),
});

export const generateSfxSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required').max(500),
  category: z.string().max(100).optional(),
  durationSeconds: z.number().min(0.5).max(30).default(3),
  projectId: z.string().uuid().optional(),
  model: z.string().optional(),
  provider: z.string().optional(),
});

export const generateVoiceSchema = z.object({
  prompt: z.string().min(1, 'Speech text prompt is required').max(5000),
  voiceId: z.string().optional(),
  voiceGender: z.enum(['male', 'female', 'neutral']).default('neutral'),
  speed: z.number().min(0.5).max(2.0).default(1.0),
  language: z.string().default('en'),
  projectId: z.string().uuid().optional(),
  model: z.string().optional(),
  provider: z.string().optional(),
});

export const generateScriptSchema = z.object({
  prompt: z.string().min(1, 'Topic or prompt is required').max(2000),
  style: z.string().max(100).optional(),
  targetDurationSeconds: z.number().min(10).max(600).default(60),
  genre: z.string().max(100).optional(),
  projectId: z.string().uuid().optional(),
  model: z.string().optional(),
  provider: z.string().optional(),
});
