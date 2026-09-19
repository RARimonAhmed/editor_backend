import { z } from 'zod';

export const textGenerationSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required'),
  systemPrompt: z.string().optional(),
  model: z.string().optional(),
  provider: z.string().optional(),
  fallbackProvider: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
  stopSequences: z.array(z.string()).optional(),
  timeoutMs: z.number().int().positive().optional(),
});

export const structuredJsonSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required'),
  schema: z.record(z.any()).default({}),
  schemaName: z.string().optional(),
  systemPrompt: z.string().optional(),
  model: z.string().optional(),
  provider: z.string().optional(),
  fallbackProvider: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  timeoutMs: z.number().int().positive().optional(),
});

export const speechToTextSchema = z.object({
  audioUrl: z.string().url().optional(),
  audioBase64: z.string().optional(),
  mimeType: z.string().optional(),
  language: z.string().default('en'),
  prompt: z.string().optional(),
  wordTimestamps: z.boolean().default(true),
  model: z.string().optional(),
  provider: z.string().optional(),
  fallbackProvider: z.string().optional(),
  timeoutMs: z.number().int().positive().optional(),
}).refine((data) => data.audioUrl || data.audioBase64, {
  message: 'Either audioUrl or audioBase64 must be provided',
});

export const textToSpeechSchema = z.object({
  text: z.string().min(1, 'Text to synthesize is required'),
  voiceId: z.string().optional(),
  voiceGender: z.enum(['male', 'female', 'neutral']).default('neutral'),
  speed: z.number().min(0.25).max(4.0).default(1.0),
  pitch: z.number().optional(),
  format: z.enum(['mp3', 'wav', 'aac']).default('mp3'),
  model: z.string().optional(),
  provider: z.string().optional(),
  fallbackProvider: z.string().optional(),
  timeoutMs: z.number().int().positive().optional(),
});

export const imageGenerationSchema = z.object({
  prompt: z.string().min(1, 'Image prompt is required'),
  negativePrompt: z.string().optional(),
  width: z.number().int().positive().default(1024),
  height: z.number().int().positive().default(1024),
  aspectRatio: z.enum(['1:1', '16:9', '9:16', '4:3']).default('1:1'),
  count: z.number().int().min(1).max(4).default(1),
  style: z.string().optional(),
  model: z.string().optional(),
  provider: z.string().optional(),
  fallbackProvider: z.string().optional(),
  timeoutMs: z.number().int().positive().optional(),
});

export const videoGenerationSchema = z.object({
  prompt: z.string().min(1, 'Video generation prompt is required'),
  imageUrl: z.string().url().optional(),
  durationSeconds: z.number().min(1).max(60).default(5),
  fps: z.number().int().positive().default(30),
  resolution: z.enum(['720p', '1080p']).default('1080p'),
  motionStrength: z.number().min(0).max(100).optional(),
  model: z.string().optional(),
  provider: z.string().optional(),
  fallbackProvider: z.string().optional(),
  timeoutMs: z.number().int().positive().optional(),
});

export const embeddingSchema = z.object({
  input: z.union([z.string(), z.array(z.string())]),
  dimensions: z.number().int().positive().optional(),
  model: z.string().optional(),
  provider: z.string().optional(),
  fallbackProvider: z.string().optional(),
  timeoutMs: z.number().int().positive().optional(),
});

export const visionSchema = z.object({
  images: z.array(
    z.object({
      url: z.string().url().optional(),
      base64: z.string().optional(),
      mimeType: z.string(),
    })
  ).min(1, 'At least one image is required'),
  prompt: z.string().min(1, 'Prompt is required'),
  maxTokens: z.number().int().positive().optional(),
  model: z.string().optional(),
  provider: z.string().optional(),
  fallbackProvider: z.string().optional(),
  timeoutMs: z.number().int().positive().optional(),
});

export const audioAnalysisSchema = z.object({
  audioUrl: z.string().url().optional(),
  audioBase64: z.string().optional(),
  minSilenceSeconds: z.number().min(0.1).max(10).default(0.5),
  detectBeats: z.boolean().default(true),
  model: z.string().optional(),
  provider: z.string().optional(),
  fallbackProvider: z.string().optional(),
  timeoutMs: z.number().int().positive().optional(),
});

export const legacyTranscribeSchema = z.object({
  mediaUrl: z.string().url('Valid media URL required'),
  language: z.string().default('en'),
  provider: z.string().optional(),
});

export const legacyCaptionsSchema = z.object({
  mediaUrl: z.string().url('Valid media URL required'),
  style: z.string().default('dynamic'),
  provider: z.string().optional(),
});

export const legacySmartCutSchema = z.object({
  mediaUrl: z.string().url('Valid media URL required'),
  minSilenceDurationSeconds: z.number().positive().default(0.6),
  provider: z.string().optional(),
});

export const legacyBrollSchema = z.object({
  prompt: z.string().min(3, 'Visual prompt required'),
  durationSeconds: z.number().positive().default(5),
  provider: z.string().optional(),
});
