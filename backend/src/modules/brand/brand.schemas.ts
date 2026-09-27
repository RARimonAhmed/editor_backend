import { z } from 'zod';

export const querySocialPresetsSchema = z.object({
  query: z.object({
    platform: z
      .enum(['tiktok', 'instagram', 'youtube', 'facebook', 'linkedin', 'x', 'pinterest'])
      .optional(),
  }),
});

export const upsertBrandKitSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(100).optional(),
    logo: z
      .object({
        assetId: z.string().optional(),
        storageKey: z.string().optional(),
        url: z.string().url().optional(),
        width: z.number().positive().optional(),
        height: z.number().positive().optional(),
      })
      .optional(),
    colors: z
      .object({
        primary: z.string().optional(),
        secondary: z.string().optional(),
        accent: z.string().optional(),
        background: z.string().optional(),
        text: z.string().optional(),
        palette: z.array(z.string()).optional(),
      })
      .optional(),
    fonts: z
      .object({
        primaryFont: z.string().optional(),
        secondaryFont: z.string().optional(),
        headingFont: z.string().optional(),
        bodyFont: z.string().optional(),
        customFontAssetIds: z.array(z.string()).optional(),
      })
      .optional(),
    intro: z
      .object({
        assetId: z.string().optional(),
        templateId: z.string().optional(),
        durationSeconds: z.number().positive().optional(),
      })
      .optional(),
    outro: z
      .object({
        assetId: z.string().optional(),
        templateId: z.string().optional(),
        durationSeconds: z.number().positive().optional(),
      })
      .optional(),
    watermark: z
      .object({
        assetId: z.string().optional(),
        url: z.string().url().optional(),
        position: z.enum(['top_left', 'top_right', 'bottom_left', 'bottom_right']).optional(),
        opacity: z.number().min(0).max(1).optional(),
        scale: z.number().min(0.01).max(1).optional(),
        margin: z.number().min(0).optional(),
      })
      .optional(),
    cta: z
      .object({
        text: z.string().min(1).max(100),
        buttonColor: z.string(),
        textColor: z.string(),
        style: z.enum(['pill', 'rectangle', 'outline']),
        url: z.string().url().optional(),
      })
      .optional(),
    socialHandles: z
      .object({
        tiktok: z.string().optional(),
        instagram: z.string().optional(),
        youtube: z.string().optional(),
        x: z.string().optional(),
        facebook: z.string().optional(),
        linkedin: z.string().optional(),
        website: z.string().url().optional(),
      })
      .optional(),
  }),
});

export const applyBrandKitToProjectSchema = z.object({
  body: z.object({
    projectId: z.string().uuid(),
  }),
});
