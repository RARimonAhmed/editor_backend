import { z } from 'zod';

export const creativeAssetTypes = [
  'template',
  'effect',
  'transition',
  'motion_graphics',
  'sticker',
  'font',
  'music',
  'sfx',
  'lut',
  'overlay',
  'stock_media',
  'ai_generated',
] as const;

export const assetStatuses = ['draft', 'review', 'published', 'disabled', 'archived'] as const;

export const listAssetsQuerySchema = z.object({
  type: z.enum(creativeAssetTypes).optional(),
  category: z.string().optional(),
  status: z.enum(assetStatuses).optional(),
  search: z.string().optional(),
  tags: z.union([z.string().transform((v) => v.split(',')), z.array(z.string())]).optional(),
  platform: z.string().optional(),
  aspectRatio: z.string().optional(),
  isFeatured: z.coerce.boolean().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  sort: z.enum(['recent', 'name', 'popularity', 'featured']).optional().default('recent'),
});

export const updateAssetStatusSchema = z.object({
  status: z.enum(assetStatuses),
});

export const updateAssetSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  category: z.string().min(1).max(64).optional(),
  tags: z.array(z.string()).optional(),
  status: z.enum(assetStatuses).optional(),
  isFeatured: z.boolean().optional(),
  aspectRatios: z.array(z.string()).optional(),
  supportedPlatforms: z.array(z.string()).optional(),
  licenseMetadata: z
    .object({
      type: z.enum(['commercial', 'editorial', 'creative_commons', 'royalty_free', 'proprietary']).optional(),
      commercialUse: z.boolean().optional(),
      attributionRequired: z.boolean().optional(),
      licenseUrl: z.string().url().optional(),
      authorName: z.string().optional(),
    })
    .optional(),
  compatibility: z
    .object({
      minEditorVersion: z.string().optional(),
      maxEditorVersion: z.string().optional(),
      minRendererVersion: z.string().optional(),
      requiredFeatures: z.array(z.string()).optional(),
    })
    .optional(),
  metadata: z.record(z.any()).optional(),
});

export const addVersionSchema = z.object({
  changeLog: z.string().min(1).max(1000).optional().default('Version update'),
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(128),
  fileBase64: z.string().min(1),
});

export const directUploadAssetSchema = z.object({
  type: z.enum(creativeAssetTypes),
  category: z.string().min(1).max(64),
  name: z.string().min(1).max(255),
  tags: z.array(z.string()).optional().default([]),
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(128),
  fileBase64: z.string().min(1),
  aspectRatios: z.array(z.string()).optional().default(['all']),
  supportedPlatforms: z.array(z.string()).optional().default(['all']),
  status: z.enum(assetStatuses).optional().default('published'),
  isFeatured: z.boolean().optional().default(false),
  licenseMetadata: z
    .object({
      type: z.enum(['commercial', 'editorial', 'creative_commons', 'royalty_free', 'proprietary']).optional(),
      commercialUse: z.boolean().optional(),
      attributionRequired: z.boolean().optional(),
      licenseUrl: z.string().optional(),
    })
    .optional(),
  compatibility: z
    .object({
      minEditorVersion: z.string().optional(),
      maxEditorVersion: z.string().optional(),
      minRendererVersion: z.string().optional(),
      requiredFeatures: z.array(z.string()).optional(),
    })
    .optional(),
});
