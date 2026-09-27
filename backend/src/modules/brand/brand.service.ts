import crypto from 'node:crypto';
import { db } from '../../database/client.js';
import { ProjectDocument } from '../projects/projects.service.js';
import {
  BrandKit,
  SocialExportPreset,
  SocialPlatform,
  UpsertBrandKitInput,
} from './brand.types.js';

export const SOCIAL_EXPORT_PRESETS: SocialExportPreset[] = [
  {
    id: 'social-tiktok-vertical',
    platform: 'tiktok',
    name: 'TikTok Video (9:16)',
    width: 1080,
    height: 1920,
    aspectRatio: '9:16',
    framerate: 30,
    videoCodec: 'h264',
    bitrateKbps: 6000,
    audioCodec: 'aac',
    audioBitrateKbps: 192,
    safeArea: {
      top: 150,     // Top navigation & sound bar
      bottom: 280,  // Bottom caption & sound title area
      left: 60,     // Account handle margin
      right: 140,   // Right side like/comment/share icons
    },
    captionDefaults: {
      maxCharsPerLine: 32,
      fontSize: 48,
      position: 'bottom',
      safeMarginBottom: 320,
    },
    thumbnailRules: {
      width: 1080,
      height: 1920,
      aspectRatio: '9:16',
      maxSizeBytes: 2 * 1024 * 1024,
      recommendedFormat: 'image/jpeg',
    },
  },
  {
    id: 'social-instagram-reels',
    platform: 'instagram',
    name: 'Instagram Reels (9:16)',
    width: 1080,
    height: 1920,
    aspectRatio: '9:16',
    framerate: 30,
    videoCodec: 'h264',
    bitrateKbps: 8000,
    audioCodec: 'aac',
    audioBitrateKbps: 192,
    safeArea: {
      top: 140,
      bottom: 260,
      left: 50,
      right: 130,
    },
    captionDefaults: {
      maxCharsPerLine: 35,
      fontSize: 44,
      position: 'bottom',
      safeMarginBottom: 300,
    },
    thumbnailRules: {
      width: 1080,
      height: 1920,
      aspectRatio: '9:16',
      maxSizeBytes: 4 * 1024 * 1024,
      recommendedFormat: 'image/jpeg',
    },
  },
  {
    id: 'social-instagram-feed-portrait',
    platform: 'instagram',
    name: 'Instagram Feed Portrait (4:5)',
    width: 1080,
    height: 1350,
    aspectRatio: '4:5',
    framerate: 30,
    videoCodec: 'h264',
    bitrateKbps: 6500,
    audioCodec: 'aac',
    audioBitrateKbps: 192,
    safeArea: {
      top: 40,
      bottom: 40,
      left: 40,
      right: 40,
    },
    captionDefaults: {
      maxCharsPerLine: 38,
      fontSize: 42,
      position: 'bottom',
      safeMarginBottom: 80,
    },
    thumbnailRules: {
      width: 1080,
      height: 1350,
      aspectRatio: '4:5',
      maxSizeBytes: 4 * 1024 * 1024,
      recommendedFormat: 'image/jpeg',
    },
  },
  {
    id: 'social-youtube-standard',
    platform: 'youtube',
    name: 'YouTube Standard HD (16:9)',
    width: 1920,
    height: 1080,
    aspectRatio: '16:9',
    framerate: 60,
    videoCodec: 'h264',
    bitrateKbps: 12000,
    audioCodec: 'aac',
    audioBitrateKbps: 320,
    safeArea: {
      top: 54,
      bottom: 54,
      left: 96,
      right: 96,
    },
    captionDefaults: {
      maxCharsPerLine: 45,
      fontSize: 40,
      position: 'bottom',
      safeMarginBottom: 70,
    },
    thumbnailRules: {
      width: 1280,
      height: 720,
      aspectRatio: '16:9',
      maxSizeBytes: 2 * 1024 * 1024,
      recommendedFormat: 'image/jpeg',
    },
  },
  {
    id: 'social-youtube-shorts',
    platform: 'youtube',
    name: 'YouTube Shorts (9:16)',
    width: 1080,
    height: 1920,
    aspectRatio: '9:16',
    framerate: 60,
    videoCodec: 'h264',
    bitrateKbps: 9000,
    audioCodec: 'aac',
    audioBitrateKbps: 256,
    safeArea: {
      top: 180,
      bottom: 290,
      left: 60,
      right: 140,
    },
    captionDefaults: {
      maxCharsPerLine: 32,
      fontSize: 48,
      position: 'bottom',
      safeMarginBottom: 340,
    },
    thumbnailRules: {
      width: 1080,
      height: 1920,
      aspectRatio: '9:16',
      maxSizeBytes: 2 * 1024 * 1024,
      recommendedFormat: 'image/jpeg',
    },
  },
  {
    id: 'social-facebook-feed',
    platform: 'facebook',
    name: 'Facebook Feed Square (1:1)',
    width: 1080,
    height: 1080,
    aspectRatio: '1:1',
    framerate: 30,
    videoCodec: 'h264',
    bitrateKbps: 5500,
    audioCodec: 'aac',
    audioBitrateKbps: 192,
    safeArea: {
      top: 40,
      bottom: 40,
      left: 40,
      right: 40,
    },
    captionDefaults: {
      maxCharsPerLine: 36,
      fontSize: 38,
      position: 'bottom',
      safeMarginBottom: 60,
    },
    thumbnailRules: {
      width: 1080,
      height: 1080,
      aspectRatio: '1:1',
      maxSizeBytes: 4 * 1024 * 1024,
      recommendedFormat: 'image/jpeg',
    },
  },
  {
    id: 'social-linkedin-landscape',
    platform: 'linkedin',
    name: 'LinkedIn Video (16:9)',
    width: 1920,
    height: 1080,
    aspectRatio: '16:9',
    framerate: 30,
    videoCodec: 'h264',
    bitrateKbps: 6000,
    audioCodec: 'aac',
    audioBitrateKbps: 192,
    safeArea: {
      top: 50,
      bottom: 50,
      left: 80,
      right: 80,
    },
    captionDefaults: {
      maxCharsPerLine: 42,
      fontSize: 38,
      position: 'bottom',
      safeMarginBottom: 70,
    },
    thumbnailRules: {
      width: 1920,
      height: 1080,
      aspectRatio: '16:9',
      maxSizeBytes: 5 * 1024 * 1024,
      recommendedFormat: 'image/png',
    },
  },
  {
    id: 'social-x-landscape',
    platform: 'x',
    name: 'X (Twitter) Landscape (16:9)',
    width: 1280,
    height: 720,
    aspectRatio: '16:9',
    framerate: 30,
    videoCodec: 'h264',
    bitrateKbps: 4500,
    audioCodec: 'aac',
    audioBitrateKbps: 160,
    safeArea: {
      top: 30,
      bottom: 40,
      left: 50,
      right: 50,
    },
    captionDefaults: {
      maxCharsPerLine: 40,
      fontSize: 32,
      position: 'bottom',
      safeMarginBottom: 50,
    },
    thumbnailRules: {
      width: 1280,
      height: 720,
      aspectRatio: '16:9',
      maxSizeBytes: 5 * 1024 * 1024,
      recommendedFormat: 'image/jpeg',
    },
  },
  {
    id: 'social-pinterest-standard',
    platform: 'pinterest',
    name: 'Pinterest Standard Pin (2:3)',
    width: 1000,
    height: 1500,
    aspectRatio: '2:3',
    framerate: 30,
    videoCodec: 'h264',
    bitrateKbps: 5000,
    audioCodec: 'aac',
    audioBitrateKbps: 160,
    safeArea: {
      top: 50,
      bottom: 70,
      left: 40,
      right: 40,
    },
    captionDefaults: {
      maxCharsPerLine: 34,
      fontSize: 40,
      position: 'bottom',
      safeMarginBottom: 90,
    },
    thumbnailRules: {
      width: 1000,
      height: 1500,
      aspectRatio: '2:3',
      maxSizeBytes: 10 * 1024 * 1024,
      recommendedFormat: 'image/jpeg',
    },
  },
];

export class BrandService {
  /**
   * Return predefined social export presets, optionally filtered by platform
   */
  public getSocialExportPresets(platform?: SocialPlatform): SocialExportPreset[] {
    if (!platform) {
      return SOCIAL_EXPORT_PRESETS;
    }
    return SOCIAL_EXPORT_PRESETS.filter((p) => p.platform === platform);
  }

  /**
   * Return single social export preset by id
   */
  public getSocialExportPresetById(id: string): SocialExportPreset | null {
    return SOCIAL_EXPORT_PRESETS.find((p) => p.id === id) || null;
  }

  /**
   * Retrieve active brand kit for a user, or default structure if not yet customized
   */
  public async getBrandKit(userId: string): Promise<BrandKit> {
    const existing = await db.query<{
      id: string;
      user_id: string;
      name: string;
      logo: any;
      colors: any;
      fonts: any;
      intro: any;
      outro: any;
      watermark: any;
      cta: any;
      social_handles: any;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT * FROM brand_kits WHERE user_id = $1 LIMIT 1;`,
      [userId]
    );

    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      return {
        id: row.id,
        userId: row.user_id,
        name: row.name,
        logo: typeof row.logo === 'string' ? JSON.parse(row.logo) : row.logo,
        colors: typeof row.colors === 'string' ? JSON.parse(row.colors) : row.colors,
        fonts: typeof row.fonts === 'string' ? JSON.parse(row.fonts) : row.fonts,
        intro: typeof row.intro === 'string' ? JSON.parse(row.intro) : row.intro,
        outro: typeof row.outro === 'string' ? JSON.parse(row.outro) : row.outro,
        watermark: typeof row.watermark === 'string' ? JSON.parse(row.watermark) : row.watermark,
        cta: typeof row.cta === 'string' ? JSON.parse(row.cta) : row.cta,
        socialHandles:
          typeof row.social_handles === 'string'
            ? JSON.parse(row.social_handles)
            : row.social_handles,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    }

    // Default Brand Kit for new user
    return {
      id: 'default',
      userId,
      name: 'Default Brand Kit',
      logo: {},
      colors: {
        primary: '#6366F1',
        secondary: '#EC4899',
        accent: '#F59E0B',
        background: '#0F172A',
        text: '#FFFFFF',
        palette: ['#6366F1', '#EC4899', '#F59E0B', '#10B981', '#3B82F6'],
      },
      fonts: {
        primaryFont: 'Inter',
        secondaryFont: 'Outfit',
        headingFont: 'Outfit',
        bodyFont: 'Inter',
      },
      intro: {},
      outro: {},
      watermark: {
        position: 'top_right',
        opacity: 0.8,
        scale: 0.15,
        margin: 24,
      },
      cta: {
        text: 'Follow for More',
        buttonColor: '#6366F1',
        textColor: '#FFFFFF',
        style: 'pill',
      },
      socialHandles: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Upsert a user's brand kit
   */
  public async upsertBrandKit(userId: string, input: UpsertBrandKitInput): Promise<BrandKit> {
    const existing = await this.getBrandKit(userId);

    const updatedKit: BrandKit = {
      id: existing.id === 'default' ? crypto.randomUUID() : existing.id,
      userId,
      name: input.name ?? existing.name,
      logo: { ...existing.logo, ...input.logo },
      colors: { ...existing.colors, ...input.colors },
      fonts: { ...existing.fonts, ...input.fonts },
      intro: { ...existing.intro, ...input.intro },
      outro: { ...existing.outro, ...input.outro },
      watermark: { ...existing.watermark, ...input.watermark },
      cta: { ...existing.cta, ...input.cta },
      socialHandles: { ...existing.socialHandles, ...input.socialHandles },
      createdAt: existing.id === 'default' ? new Date().toISOString() : existing.createdAt,
      updatedAt: new Date().toISOString(),
    };

    if (existing.id === 'default') {
      await db.query(
        `INSERT INTO brand_kits (id, user_id, name, logo, colors, fonts, intro, outro, watermark, cta, social_handles, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13);`,
        [
          updatedKit.id,
          userId,
          updatedKit.name,
          JSON.stringify(updatedKit.logo),
          JSON.stringify(updatedKit.colors),
          JSON.stringify(updatedKit.fonts),
          JSON.stringify(updatedKit.intro),
          JSON.stringify(updatedKit.outro),
          JSON.stringify(updatedKit.watermark),
          JSON.stringify(updatedKit.cta),
          JSON.stringify(updatedKit.socialHandles),
          updatedKit.createdAt,
          updatedKit.updatedAt,
        ]
      );
    } else {
      await db.query(
        `UPDATE brand_kits
         SET name = $1, logo = $2, colors = $3, fonts = $4, intro = $5, outro = $6, watermark = $7, cta = $8, social_handles = $9, updated_at = $10
         WHERE id = $11;`,
        [
          updatedKit.name,
          JSON.stringify(updatedKit.logo),
          JSON.stringify(updatedKit.colors),
          JSON.stringify(updatedKit.fonts),
          JSON.stringify(updatedKit.intro),
          JSON.stringify(updatedKit.outro),
          JSON.stringify(updatedKit.watermark),
          JSON.stringify(updatedKit.cta),
          JSON.stringify(updatedKit.socialHandles),
          updatedKit.updatedAt,
          updatedKit.id,
        ]
      );
    }

    return updatedKit;
  }

  /**
   * Apply a Brand Kit to a ProjectDocument:
   * - Updates text clip styles to match brand fonts and colors
   * - Injects watermark clip if logo / watermark asset is configured
   */
  public applyBrandKitToProject(project: ProjectDocument, brandKit: BrandKit): ProjectDocument;
  public applyBrandKitToProject(
    projectIdOrDoc: string | ProjectDocument,
    brandKitOrUserId: BrandKit | string,
    brandKitId?: string
  ): Promise<ProjectDocument> | ProjectDocument {
    if (typeof projectIdOrDoc === 'string') {
      const projectId = projectIdOrDoc;
      const userId = brandKitOrUserId as string;
      return this.applyBrandKitToProjectId(projectId, userId, brandKitId);
    }

    const project = projectIdOrDoc;
    const brandKit = brandKitOrUserId as BrandKit;
    const updated = JSON.parse(JSON.stringify(project)) as ProjectDocument;

    // 1. Update text clips with brand font and colors
    for (const track of ((updated.timeline?.tracks as any[]) || [])) {
      for (const clip of (track.clips || [])) {
        if (clip.kind === 'text' || track.type === 'text') {
          clip.fontFamily = brandKit.fonts.primaryFont || clip.fontFamily;
          clip.color = brandKit.colors.text || clip.color;
          if (clip.backgroundColor) {
            clip.backgroundColor = brandKit.colors.primary;
          }
        }
      }
    }

    // 2. Add or update Watermark if configured
    if (brandKit.watermark.assetId || brandKit.watermark.url || brandKit.logo.url) {
      let watermarkTrack = ((updated.timeline?.tracks as any[]) || []).find((t: any) => t.name === 'Brand Watermark');
      if (!watermarkTrack) {
        watermarkTrack = {
          id: `track-brand-watermark-${crypto.randomUUID().slice(0, 8)}`,
          name: 'Brand Watermark',
          type: 'overlay',
          order: ((updated.timeline?.tracks as any[]) || []).length + 1,
          isMuted: false,
          isLocked: true,
          clips: [],
        };
        updated.timeline.tracks.push(watermarkTrack);
      }

      // Calculate total duration across existing tracks
      let totalDuration = 0;
      for (const t of ((updated.timeline?.tracks as any[]) || [])) {
        for (const c of (t.clips || [])) {
          const end = (c.timelineStartMs || 0) + (c.durationMs || 0);
          if (end > totalDuration) totalDuration = end;
        }
      }
      if (totalDuration === 0) totalDuration = 10000;

      const watermarkClip: any = {
        id: `clip-watermark-${crypto.randomUUID().slice(0, 8)}`,
        trackId: watermarkTrack.id,
        mediaId: brandKit.watermark.assetId || 'brand-logo',
        kind: 'overlay',
        sourceStartMs: 0,
        sourceEndMs: totalDuration,
        timelineStartMs: 0,
        durationMs: totalDuration,
        opacity: brandKit.watermark.opacity,
        scale: brandKit.watermark.scale,
        position: {
          x: brandKit.watermark.position.includes('right') ? 0.85 : 0.15,
          y: brandKit.watermark.position.includes('bottom') ? 0.85 : 0.15,
        },
      };

      watermarkTrack.clips = [watermarkClip];
    }

    return updated;
  }

  /**
   * Helper to load project by ID, load user brand kit, apply transformations and save back
   */
  public async applyBrandKitToProjectId(
    projectId: string,
    userId: string,
    _brandKitId?: string
  ): Promise<ProjectDocument> {
    const { projectsService } = await import('../projects/projects.service.js');
    const project = await projectsService.getById(projectId, userId);
    const brandKit = await this.getBrandKit(userId);

    const updated = this.applyBrandKitToProject(project, brandKit);
    return projectsService.update(projectId, userId, {
      timeline: updated.timeline,
      timelineData: updated.timeline,
    });
  }
}

export const brandService = new BrandService();
