import { z } from 'zod';

export const presetTypes = [
  'effect',
  'transition',
  'filter',
  'motion',
  'text_animation',
  'color_preset',
  'lut',
] as const;

export const presetRenderers = [
  'glsl_shader',
  'ffmpeg_filter',
  'canvas_2d',
  'native_skia',
  'lottie',
] as const;

export const platformIds = ['windows', 'macos', 'linux', 'android', 'ios', 'web'] as const;

export const listPresetsQuerySchema = z.object({
  type: z.enum(presetTypes).optional(),
  category: z.string().optional(),
  platform: z.enum(platformIds).optional(),
  renderer: z.enum(presetRenderers).optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(50),
});

export const getCapabilitiesQuerySchema = z.object({
  platform: z.enum(platformIds).optional().default('web'),
});
