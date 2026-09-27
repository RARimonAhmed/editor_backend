import { z } from 'zod';

export const listTemplatesQuerySchema = z.object({
  category: z.string().optional(),
  search: z.string().optional(),
  tags: z.union([z.string().transform((v) => v.split(',')), z.array(z.string())]).optional(),
  aspectRatio: z.string().optional(),
  minDuration: z.coerce.number().positive().optional(),
  maxDuration: z.coerce.number().positive().optional(),
  isFeatured: z.coerce.boolean().optional(),
  isFavorite: z.coerce.boolean().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  sort: z.enum(['popularity', 'featured', 'recent', 'name']).optional().default('popularity'),
});

export const useTemplateSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  substitutions: z
    .array(
      z.object({
        placeholderId: z.string().min(1),
        value: z.any(),
      })
    )
    .optional(),
  colorThemeId: z.string().optional(),
  fontThemeId: z.string().optional(),
  brandKitId: z.string().optional(),
  applyBrandKit: z.boolean().optional(),
});
