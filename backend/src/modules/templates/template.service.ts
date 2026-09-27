import { v4 as uuidv4 } from 'uuid';
import { db } from '../../database/client.js';
import { projectsService, mockProjects, ProjectDocument } from '../projects/projects.service.js';
import { logger } from '../../core/logger.js';
import { NotFoundError, ValidationError, ForbiddenError } from '../../core/errors.js';
import {
  Template,
  ListTemplatesQuery,
  UseTemplateInput,
  TemplatePlaceholder,
} from './template.types.js';

export const mockTemplates = new Map<string, Template>();
export const mockTemplateFavorites = new Set<string>(); // "userId:templateId"

export class TemplateService {
  constructor() {
    this.seedDefaultTemplates();
  }

  /**
   * Seed realistic production templates with complete multi-track editable timelines & placeholders
   */
  private seedDefaultTemplates() {
    if (mockTemplates.size > 0) return;

    const t1Id = 't-tiktok-viral-hook';
    mockTemplates.set(t1Id, {
      id: t1Id,
      name: 'TikTok Viral Dynamic Hook',
      slug: 'tiktok-viral-dynamic-hook',
      category: 'social',
      description: 'High energy 9:16 vertical template with kinetic text and punchy beat transitions',
      tags: ['tiktok', 'reels', 'shorts', 'fast', 'viral'],
      aspectRatio: '9:16',
      duration: 15.0,
      thumbnailUrl: 'https://storage.mock.local/editor-assets/templates/thumb_tiktok.jpg',
      previewVideoUrl: 'https://storage.mock.local/editor-assets/templates/preview_tiktok.mp4',
      popularity: 98,
      isFeatured: true,
      isPremium: false,
      version: 1,
      schemaVersion: 1,
      createdBy: 'system',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
      placeholders: [
        {
          id: 'ph-video-hook',
          type: 'media',
          label: 'Opening Hook Video',
          clipId: 'c-hook-video',
          trackId: 'track-v1',
          defaultValue: 'sample-hook-video-1',
          constraints: { allowedMimeTypes: ['video/mp4', 'video/quicktime'], aspectRatio: '9:16' },
        },
        {
          id: 'ph-text-hook',
          type: 'text',
          label: 'Hook Question Text',
          clipId: 'c-hook-text',
          trackId: 'track-txt1',
          defaultValue: 'DID YOU KNOW THIS SECRET?',
          constraints: { maxCharacters: 60 },
        },
        {
          id: 'ph-audio-beat',
          type: 'audio',
          label: 'Trending Background Audio Bed',
          clipId: 'c-hook-audio',
          trackId: 'track-a1',
          defaultValue: 'trending-phonk-bed',
        },
      ],
      colorThemes: [
        {
          id: 'neon-yellow',
          name: 'Cyber Neon',
          primary: '#FFFF00',
          secondary: '#FF0055',
          accent: '#00FFFF',
          background: '#0D0D11',
          text: '#FFFFFF',
        },
        {
          id: 'sunset-orange',
          name: 'Sunset Glow',
          primary: '#FF5E3A',
          secondary: '#FF2A68',
          accent: '#FFD400',
          background: '#1A0B2E',
          text: '#FFFFFF',
        },
      ],
      fontThemes: [
        {
          id: 'bold-impact',
          name: 'Impact Viral',
          headingFont: 'Montserrat',
          bodyFont: 'Inter',
        },
      ],
      timelineData: {
        duration: 15.0,
        framerate: 30,
        tracks: [
          {
            id: 'track-v1',
            type: 'video',
            name: 'Video Background',
            muted: false,
            locked: false,
            clips: [
              {
                id: 'c-hook-video',
                name: 'Main Video Clip',
                mediaAssetId: 'sample-hook-video-1',
                start: 0,
                duration: 15.0,
                sourceStart: 0,
                sourceEnd: 15.0,
                transform: { scaleX: 1, scaleY: 1, positionX: 0, positionY: 0, rotationDegrees: 0, opacity: 1 },
                effects: [{ id: 'fx-zoom-pop', type: 'zoom_punch', intensity: 1.2 }],
              },
            ],
          },
          {
            id: 'track-txt1',
            type: 'text',
            name: 'Captions & Titles',
            muted: false,
            locked: false,
            clips: [
              {
                id: 'c-hook-text',
                name: 'Punchy Hook Title',
                text: 'DID YOU KNOW THIS SECRET?',
                start: 0.5,
                duration: 4.0,
                fontSize: 48,
                color: '#FFFF00',
                alignment: 'center',
                keyframes: [{ time: 0, scale: 0.8 }, { time: 0.2, scale: 1.1 }, { time: 0.4, scale: 1.0 }],
              },
            ],
          },
          {
            id: 'track-a1',
            type: 'audio',
            name: 'Music Bed',
            muted: false,
            locked: false,
            clips: [
              {
                id: 'c-hook-audio',
                name: 'Audio Beat',
                start: 0,
                duration: 15.0,
                volume: 0.85,
              },
            ],
          },
        ],
      },
    });

    const t2Id = 't-youtube-explainer';
    mockTemplates.set(t2Id, {
      id: t2Id,
      name: 'YouTube Cinematic Explainer',
      slug: 'youtube-cinematic-explainer',
      category: 'youtube',
      description: 'Clean 16:9 widescreen documentary/explainer template with lower thirds and intro sequence',
      tags: ['youtube', 'explainer', 'documentary', 'widescreen', '16:9'],
      aspectRatio: '16:9',
      duration: 30.0,
      thumbnailUrl: 'https://storage.mock.local/editor-assets/templates/thumb_yt.jpg',
      previewVideoUrl: 'https://storage.mock.local/editor-assets/templates/preview_yt.mp4',
      popularity: 85,
      isFeatured: true,
      isPremium: true,
      version: 1,
      schemaVersion: 1,
      createdBy: 'system',
      createdAt: '2026-09-02T00:00:00.000Z',
      updatedAt: '2026-09-02T00:00:00.000Z',
      placeholders: [
        {
          id: 'ph-logo',
          type: 'logo',
          label: 'Channel Watermark Logo',
          clipId: 'c-logo-watermark',
          trackId: 'track-graphics',
          defaultValue: 'sample-channel-logo',
        },
        {
          id: 'ph-lowerthird-title',
          type: 'text',
          label: 'Presenter Name',
          clipId: 'c-lowerthird-title',
          trackId: 'track-txt1',
          defaultValue: 'Dr. Jane Doe, Tech Architect',
          constraints: { maxCharacters: 40 },
        },
      ],
      colorThemes: [
        {
          id: 'corporate-clean',
          name: 'Corporate Slate',
          primary: '#2563EB',
          secondary: '#3B82F6',
          accent: '#10B981',
          background: '#0F172A',
          text: '#F8FAFC',
        },
      ],
      fontThemes: [
        {
          id: 'editorial',
          name: 'Editorial Serif',
          headingFont: 'Playfair Display',
          bodyFont: 'Inter',
        },
      ],
      timelineData: {
        duration: 30.0,
        framerate: 30,
        tracks: [
          {
            id: 'track-v1',
            type: 'video',
            name: 'A-Roll Camera',
            muted: false,
            locked: false,
            clips: [
              {
                id: 'c-main-shot',
                name: 'Presenter A-Roll',
                start: 0,
                duration: 30.0,
                transform: { scaleX: 1, scaleY: 1, positionX: 0, positionY: 0, rotationDegrees: 0, opacity: 1 },
              },
            ],
          },
          {
            id: 'track-txt1',
            type: 'text',
            name: 'Lower Thirds',
            muted: false,
            locked: false,
            clips: [
              {
                id: 'c-lowerthird-title',
                name: 'Presenter Name Overlay',
                text: 'Dr. Jane Doe, Tech Architect',
                start: 2.0,
                duration: 6.0,
                fontSize: 32,
                color: '#F8FAFC',
                alignment: 'left',
              },
            ],
          },
        ],
      },
    });
  }

  /**
   * List templates with flexible filtering, search, and sorting
   */
  public async listTemplates(query: ListTemplatesQuery, userId?: string): Promise<{ items: Template[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const offset = (page - 1) * limit;

    let items = Array.from(mockTemplates.values());

    // Filter category
    if (query.category && query.category !== 'all') {
      items = items.filter((t) => t.category.toLowerCase() === query.category!.toLowerCase());
    }

    // Filter aspect ratio
    if (query.aspectRatio && query.aspectRatio !== 'all') {
      items = items.filter((t) => t.aspectRatio === query.aspectRatio);
    }

    // Filter duration
    if (query.minDuration !== undefined) {
      items = items.filter((t) => t.duration >= query.minDuration!);
    }
    if (query.maxDuration !== undefined) {
      items = items.filter((t) => t.duration <= query.maxDuration!);
    }

    // Filter featured
    if (query.isFeatured !== undefined) {
      items = items.filter((t) => t.isFeatured === query.isFeatured);
    }

    // Filter favorites
    if (query.isFavorite && userId) {
      items = items.filter((t) => mockTemplateFavorites.has(`${userId}:${t.id}`));
    }

    // Search query
    if (query.search) {
      const q = query.search.toLowerCase();
      items = items.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          (t.description && t.description.toLowerCase().includes(q)) ||
          t.tags.some((tag) => tag.toLowerCase().includes(q))
      );
    }

    // Filter tags
    if (query.tags && query.tags.length > 0) {
      items = items.filter((t) => query.tags!.some((tag) => t.tags.includes(tag)));
    }

    // Sort
    if (query.sort === 'popularity') {
      items.sort((a, b) => b.popularity - a.popularity);
    } else if (query.sort === 'name') {
      items.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    const total = items.length;
    const paginated = items.slice(offset, offset + limit);

    return { items: paginated, total, page, limit };
  }

  /**
   * Get template by ID
   */
  public async getTemplateById(id: string): Promise<Template> {
    const template = mockTemplates.get(id);
    if (!template) {
      throw new NotFoundError(`Template not found: ${id}`);
    }
    return template;
  }

  /**
   * Instantiate Template into a Real Editable Project Definition
   * Returns a real ProjectDocument, NOT a flattened video.
   */
  public async useTemplate(
    templateId: string,
    userId: string,
    input: UseTemplateInput
  ): Promise<ProjectDocument> {
    const template = await this.getTemplateById(templateId);

    // Schema version check
    if (template.schemaVersion > 2) {
      throw new ValidationError(`Template schema version ${template.schemaVersion} is not supported by current editor engine`);
    }

    logger.info({ templateId, userId, title: input.title }, 'Instantiating template into editable project');

    // 1. Build map of user placeholder substitutions
    const subMap = new Map<string, any>();
    for (const sub of input.substitutions || []) {
      subMap.set(sub.placeholderId, sub.value);
    }

    // 2. Clone timeline with fresh unique clip & track IDs and substitute values
    const rawTimeline = template.timelineData;
    const clipIdMap = new Map<string, string>();

    const clonedTracks = (rawTimeline.tracks || []).map((track: any) => {
      const freshTrackId = `track-${uuidv4().slice(0, 8)}`;
      const clonedClips = (track.clips || []).map((clip: any) => {
        const freshClipId = `clip-${uuidv4().slice(0, 8)}`;
        clipIdMap.set(clip.id, freshClipId);

        const newClip = {
          ...clip,
          id: freshClipId,
        };

        // Find placeholder attached to this original clip
        const ph = template.placeholders.find((p) => p.clipId === clip.id);
        if (ph) {
          const userVal = subMap.get(ph.id) ?? ph.defaultValue;
          if (ph.type === 'media') {
            newClip.mediaAssetId = userVal;
            newClip.assetId = userVal;
          } else if (ph.type === 'text') {
            if (typeof newClip.text === 'object') {
              newClip.text = { ...newClip.text, content: String(userVal) };
            } else {
              newClip.text = String(userVal);
            }
          } else if (ph.type === 'audio') {
            newClip.mediaAssetId = userVal;
            newClip.assetId = userVal;
          } else if (ph.type === 'logo') {
            newClip.mediaAssetId = userVal;
            newClip.assetId = userVal;
          }
        }

        return newClip;
      });

      return {
        ...track,
        id: freshTrackId,
        clips: clonedClips,
      };
    });

    // 3. Apply color theme overrides if requested
    let chosenColorTheme = template.colorThemes.find((ct) => ct.id === input.colorThemeId);
    if (!chosenColorTheme && template.colorThemes.length > 0) {
      chosenColorTheme = template.colorThemes[0];
    }

    // 4. Apply font theme overrides if requested
    let chosenFontTheme = template.fontThemes.find((ft) => ft.id === input.fontThemeId);
    if (!chosenFontTheme && template.fontThemes.length > 0) {
      chosenFontTheme = template.fontThemes[0];
    }

    // Apply color and font themes to text clips if defined
    if (chosenColorTheme || chosenFontTheme) {
      for (const track of clonedTracks) {
        if (track.type === 'text') {
          for (const clip of track.clips) {
            if (chosenColorTheme?.primary && (!clip.color || clip.color === '#FFFFFF')) {
              clip.color = chosenColorTheme.primary;
            }
            if (chosenFontTheme?.headingFont) {
              if (typeof clip.text === 'object') {
                clip.text.fontFamily = chosenFontTheme.headingFont;
              } else {
                clip.fontFamily = chosenFontTheme.headingFont;
              }
            }
          }
        }
      }
    }

    // 5. Parse aspect ratio to width/height
    let width = 1920;
    let height = 1080;
    if (template.aspectRatio === '9:16') {
      width = 1080;
      height = 1920;
    } else if (template.aspectRatio === '1:1') {
      width = 1080;
      height = 1080;
    } else if (template.aspectRatio === '4:5') {
      width = 1080;
      height = 1350;
    }

    // 6. Create the real ProjectDocument in ProjectsService
    const projectTitle = input.title || `${template.name} Project`;
    const newProjectId = uuidv4();
    const now = new Date().toISOString();

    const canvas = {
      resolutionWidth: width,
      resolutionHeight: height,
      framerate: rawTimeline.framerate || 30,
      aspectRatio: template.aspectRatio,
      colorSpace: 'rec709',
      backgroundColor: chosenColorTheme?.background || '#000000',
    };

    const timeline = {
      duration: template.duration,
      framerate: rawTimeline.framerate || 30,
      tracks: clonedTracks,
      markers: rawTimeline.markers || [],
    };

    const newProject: ProjectDocument = {
      id: newProjectId,
      userId,
      title: projectTitle,
      description: `Instantiated from template: ${template.name}`,
      status: 'active',
      version: 1,
      projectVersion: 1,
      createdAt: now,
      updatedAt: now,
      etag: uuidv4(),
      metadata: {
        id: newProjectId,
        userId,
        title: projectTitle,
        description: `Instantiated from template: ${template.name}`,
        status: 'active',
        thumbnailUrl: template.thumbnailUrl || null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
      canvas,
      timeline,
      assets: [],
      versions: {
        currentVersion: 1,
        etag: uuidv4(),
        versionToken: uuidv4(),
        totalVersions: 1,
        recentVersions: [],
      },
      settings: {
        autoSaveIntervalSeconds: 30,
        snapToGrid: true,
        rippleEditing: false,
        proxyEnabled: false,
        defaultAudioGain: 0,
      },
      resolutionWidth: width,
      resolutionHeight: height,
      framerate: rawTimeline.framerate || 30,
      aspectRatio: template.aspectRatio,
      timelineData: timeline,
      thumbnailUrl: template.thumbnailUrl || null,
      schemaVersion: 1,
    };

    // Increment popularity
    template.popularity += 1;
    mockTemplates.set(templateId, template);

    // Save project into mock/db
    mockProjects.set(newProjectId, newProject);

    try {
      if (await db.isHealthy()) {
        await db.query(
          `INSERT INTO projects (
            id, user_id, title, description, status, canvas_config, timeline_data,
            settings, version, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11);`,
          [
            newProject.id,
            newProject.userId,
            newProject.title,
            newProject.description,
            newProject.status,
            JSON.stringify(newProject.canvas),
            JSON.stringify(newProject.timeline),
            JSON.stringify(newProject.settings),
            newProject.version,
            newProject.createdAt,
            newProject.updatedAt,
          ]
        );
      }
    } catch {}

    logger.info({ newProjectId, templateId }, 'Template successfully instantiated into real editable project definition');
    return newProject;
  }

  /**
   * Toggle Template Favorite
   */
  public async toggleFavorite(templateId: string, userId: string): Promise<{ isFavorite: boolean }> {
    await this.getTemplateById(templateId);
    const key = `${userId}:${templateId}`;
    let isFavorite: boolean;

    if (mockTemplateFavorites.has(key)) {
      mockTemplateFavorites.delete(key);
      isFavorite = false;
    } else {
      mockTemplateFavorites.add(key);
      isFavorite = true;
    }

    try {
      if (await db.isHealthy()) {
        if (isFavorite) {
          await db.query(
            'INSERT INTO template_favorites (user_id, template_id) VALUES ($1, $2) ON CONFLICT DO NOTHING;',
            [userId, templateId]
          );
        } else {
          await db.query('DELETE FROM template_favorites WHERE user_id = $1 AND template_id = $2;', [
            userId,
            templateId,
          ]);
        }
      }
    } catch {}

    return { isFavorite };
  }
}

export const templateService = new TemplateService();
