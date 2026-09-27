import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { storageService } from '../src/services/storage/index.js';

describe('Day 6 — Creative Asset Library, Templates, Presets & Brand Kit E2E', () => {
  let app: FastifyInstance;
  let authToken: string;
  let userId: string;
  let uploadedAssetId: string;
  let instantiatedProjectId: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    // Register test user
    const regRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: `creative_director_${Date.now()}@techxayan.com`,
        password: 'Password123!',
        displayName: 'TechXayan Lead Animator',
      },
    });

    expect(regRes.statusCode).toBe(201);
    const regBody = JSON.parse(regRes.body);
    authToken = regBody.data.tokens.accessToken;
    userId = regBody.data.user.id;
  });

  afterAll(async () => {
    await app.close();
  });

  // ============================================================================
  // COMMAND 26: REAL CREATIVE ASSET LIBRARY + CDN
  // ============================================================================
  describe('Command 26: Real Creative Asset Library + CDN', () => {
    it('uploads a creative asset through StorageService, extracts metadata, and signs CDN preview', async () => {
      // 1x1 valid PNG transparent pixel base64
      const validPngBase64 =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

      const uploadRes = await app.inject({
        method: 'POST',
        url: '/v1/assets/upload',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          type: 'sticker',
          category: 'reactions',
          name: 'Golden Verified Badge',
          tags: ['badge', 'gold', 'verified', 'overlay'],
          filename: 'golden-badge.png',
          mimeType: 'image/png',
          fileBase64: validPngBase64,
          aspectRatios: ['1:1'],
          supportedPlatforms: ['all'],
          licenseMetadata: {
            type: 'commercial',
            commercialUse: true,
            attributionRequired: false,
          },
          compatibility: {
            minEditorVersion: '1.0.0',
          },
        },
      });

      expect(uploadRes.statusCode).toBe(201);
      const body = JSON.parse(uploadRes.body);
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();

      const asset = body.data;
      uploadedAssetId = asset.id;

      expect(asset.name).toBe('Golden Verified Badge');
      expect(asset.type).toBe('sticker');
      expect(asset.category).toBe('reactions');
      expect(asset.version).toBe(1);
      expect(asset.status).toBe('published');
      expect(asset.storageKey).toMatch(/^assets\/sticker\//);
      expect(asset.cdnUrl).toBeDefined();
      expect(asset.versionHistory).toHaveLength(1);
      expect(asset.versionHistory[0].version).toBe(1);

      // Verify asset actually exists in underlying storageService
      const head = await storageService.headObject(asset.storageKey);
      expect(head).toBeDefined();
      expect(head?.contentLength).toBeGreaterThan(0);
    });

    it('retrieves asset by ID and lists with filtering and tags', async () => {
      // Get single
      const getRes = await app.inject({
        method: 'GET',
        url: `/v1/assets/${uploadedAssetId}`,
      });
      expect(getRes.statusCode).toBe(200);
      const getBody = JSON.parse(getRes.body);
      expect(getBody.data.id).toBe(uploadedAssetId);

      // List with query
      const listRes = await app.inject({
        method: 'GET',
        url: '/v1/assets?type=sticker&category=reactions',
      });
      expect(listRes.statusCode).toBe(200);
      const listBody = JSON.parse(listRes.body);
      expect(listBody.data.length).toBeGreaterThanOrEqual(1);
      expect(listBody.data.some((a: any) => a.id === uploadedAssetId)).toBe(true);
    });

    it('generates a signed CDN download URL with TTL expiry', async () => {
      const cdnRes = await app.inject({
        method: 'GET',
        url: `/v1/assets/${uploadedAssetId}/download-url?expiresIn=1800&signed=true`,
      });
      expect(cdnRes.statusCode).toBe(200);
      const cdnBody = JSON.parse(cdnRes.body);
      expect(cdnBody.data.downloadUrl).toBeDefined();
      expect(cdnBody.data.expiresIn).toBe(1800);
      expect(cdnBody.data.assetId).toBe(uploadedAssetId);
    });

    it('creates version 2 of an asset with change log and stores in version history', async () => {
      const v2PngBase64 =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

      const versionRes = await app.inject({
        method: 'POST',
        url: `/v1/assets/${uploadedAssetId}/version`,
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          changeLog: 'Enhanced shine highlights for HDR displays',
          filename: 'golden-badge-v2.png',
          mimeType: 'image/png',
          fileBase64: v2PngBase64,
        },
      });

      expect(versionRes.statusCode).toBe(200);
      const versionBody = JSON.parse(versionRes.body);
      const updatedAsset = versionBody.data;

      expect(updatedAsset.version).toBe(2);
      expect(updatedAsset.versionHistory).toHaveLength(2);
      expect(updatedAsset.versionHistory[1].version).toBe(2);
      expect(updatedAsset.versionHistory[1].changeLog).toBe(
        'Enhanced shine highlights for HDR displays'
      );
    });

    it('allows admin lifecycle controls: update status, feature, and categorize', async () => {
      // 1. Feature and update category
      const updateRes = await app.inject({
        method: 'PATCH',
        url: `/v1/assets/${uploadedAssetId}`,
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          isFeatured: true,
          category: 'featured_stickers',
          tags: ['gold', 'badge', 'verified', 'vip'],
        },
      });
      expect(updateRes.statusCode).toBe(200);
      const updateBody = JSON.parse(updateRes.body);
      expect(updateBody.data.isFeatured).toBe(true);
      expect(updateBody.data.category).toBe('featured_stickers');

      // 2. Disable asset
      const statusRes = await app.inject({
        method: 'PATCH',
        url: `/v1/assets/${uploadedAssetId}/status`,
        headers: { Authorization: `Bearer ${authToken}` },
        payload: { status: 'disabled' },
      });
      expect(statusRes.statusCode).toBe(200);
      const statusBody = JSON.parse(statusRes.body);
      expect(statusBody.data.status).toBe('disabled');
    });
  });

  // ============================================================================
  // COMMAND 27: REAL TEMPLATE SERVICE
  // ============================================================================
  describe('Command 27: Real Template Service', () => {
    let viralHookTemplateId = 't-tiktok-viral-hook';

    it('GET /v1/templates lists seeded templates with aspect ratio, duration, and popularity sorting', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/templates?aspectRatio=9:16&sort=popularity',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.data.length).toBeGreaterThanOrEqual(1);

      const template = body.data.find((t: any) => t.id === viralHookTemplateId);
      expect(template).toBeDefined();
      expect(template.aspectRatio).toBe('9:16');
      expect(template.placeholders.length).toBeGreaterThan(0);
      expect(template.colorThemes.length).toBeGreaterThan(0);
      expect(template.fontThemes.length).toBeGreaterThan(0);
    });

    it('GET /v1/templates/:id returns full template definition including placeholders and project snapshot', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/v1/templates/${viralHookTemplateId}`,
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      const template = body.data;

      expect(template.id).toBe(viralHookTemplateId);
      expect(template.timelineData).toBeDefined();
      expect(template.timelineData.tracks.length).toBeGreaterThan(0);

      // Verify presence of placeholders (media, text, audio)
      const placeholderTypes = template.placeholders.map((p: any) => p.type);
      expect(placeholderTypes).toContain('media');
      expect(placeholderTypes).toContain('text');
      expect(placeholderTypes).toContain('audio');
    });

    it('POST /v1/templates/:id/favorite toggles favorite state for authenticated user', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/v1/templates/${viralHookTemplateId}/favorite`,
        headers: { Authorization: `Bearer ${authToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(typeof body.data.isFavorite).toBe('boolean');
    });

    it('POST /v1/templates/:id/use instantiates a real editable ProjectDocument with substituted placeholders (NOT flattened video)', async () => {
      const useRes = await app.inject({
        method: 'POST',
        url: `/v1/templates/${viralHookTemplateId}/use`,
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          title: 'My Custom TikTok Ad Project',
          colorThemeId: 'neon-yellow',
          fontThemeId: 'bold-impact',
          substitutions: [
            {
              placeholderId: 'ph-text-hook',
              value: 'THIS 1 SECRET CHANGED EVERYTHING',
            },
            {
              placeholderId: 'ph-video-hook',
              value: 'media-custom-video-asset-uuid-1234',
            },
          ],
        },
      });

      expect(useRes.statusCode).toBe(201);
      const body = JSON.parse(useRes.body);
      expect(body.success).toBe(true);

      const project = body.data;
      instantiatedProjectId = project.id;

      // Must be a real project document with editable timeline tracks
      expect(project.title).toBe('My Custom TikTok Ad Project');
      expect(project.timeline).toBeDefined();
      expect(project.timeline.tracks.length).toBeGreaterThan(0);

      // Check that substituted text exists on the text track
      const textTrack = project.timeline.tracks.find((t: any) => t.type === 'text' || t.type === 'overlay');
      expect(textTrack).toBeDefined();
      const textClip = textTrack.clips.find(
        (c: any) => c.text === 'THIS 1 SECRET CHANGED EVERYTHING'
      );
      expect(textClip).toBeDefined();
      expect(textClip.fontFamily).toBe('Montserrat'); // From bold-impact font theme

      // Check that media substitution replaced the placeholder
      const videoTrack = project.timeline.tracks.find((t: any) => t.type === 'video');
      expect(videoTrack).toBeDefined();
      const videoClip = videoTrack.clips.find(
        (c: any) => c.mediaAssetId === 'media-custom-video-asset-uuid-1234' || c.mediaId === 'media-custom-video-asset-uuid-1234'
      );
      expect(videoClip).toBeDefined();
    });
  });

  // ============================================================================
  // COMMAND 28: VERSIONED EFFECT + TRANSITION PRESET SERVICE
  // ============================================================================
  describe('Command 28: Versioned Effect + Transition Preset Service', () => {
    it('queries platform capabilities to determine supported renderers', async () => {
      const winRes = await app.inject({
        method: 'GET',
        url: '/v1/presets/capabilities?platform=windows',
      });
      expect(winRes.statusCode).toBe(200);
      const winCaps = JSON.parse(winRes.body).data;
      expect(winCaps.supportedRenderers).toContain('glsl_shader');
      expect(winCaps.supportedRenderers).toContain('ffmpeg_filter');

      const androidRes = await app.inject({
        method: 'GET',
        url: '/v1/presets/capabilities?platform=android',
      });
      expect(androidRes.statusCode).toBe(200);
      const androidCaps = JSON.parse(androidRes.body).data;
      expect(androidCaps.supportedRenderers).toContain('canvas_2d');
      expect(androidCaps.supportedRenderers).toContain('native_skia');
    });

    it('NEVER exposes an effect preset as available if renderer support does not exist for target platform', async () => {
      // On Windows: volumetric godrays shader preset should be available
      const winPresetsRes = await app.inject({
        method: 'GET',
        url: '/v1/presets?platform=windows',
      });
      expect(winPresetsRes.statusCode).toBe(200);
      const winPresets = JSON.parse(winPresetsRes.body).data;
      const godraysOnWin = winPresets.find((p: any) => p.id === 'fx-volumetric-godrays');
      expect(godraysOnWin).toBeDefined();

      // On Android: volumetric godrays (glsl_shader requiring compute shaders) MUST NOT be exposed
      const androidPresetsRes = await app.inject({
        method: 'GET',
        url: '/v1/presets?platform=android',
      });
      expect(androidPresetsRes.statusCode).toBe(200);
      const androidPresets = JSON.parse(androidPresetsRes.body).data;
      const godraysOnAndroid = androidPresets.find((p: any) => p.id === 'fx-volumetric-godrays');
      expect(godraysOnAndroid).toBeUndefined();

      // Attempting to directly fetch godrays with Android platform query returns 404 NOT_FOUND
      const directFetchRes = await app.inject({
        method: 'GET',
        url: '/v1/presets/fx-volumetric-godrays?platform=android',
      });
      expect(directFetchRes.statusCode).toBe(404);
    });

    it('returns full preset metadata with min/max bounds and parameter defaults', async () => {
      const presetRes = await app.inject({
        method: 'GET',
        url: '/v1/presets/tr-crossfade?platform=windows',
      });
      expect(presetRes.statusCode).toBe(200);
      const preset = JSON.parse(presetRes.body).data;

      expect(preset.type).toBe('transition');
      expect(preset.renderer).toBe('canvas_2d');
      expect(preset.parameters.length).toBeGreaterThan(0);

      const durationParam = preset.parameters.find((p: any) => p.name === 'duration');
      expect(durationParam).toBeDefined();
      expect(durationParam.min).toBe(0.1);
      expect(durationParam.max).toBe(5.0);
      expect(durationParam.default).toBe(0.5);
    });
  });

  // ============================================================================
  // COMMAND 29: MOTION GRAPHICS ASSET PIPELINE
  // ============================================================================
  describe('Command 29: Motion Graphics Asset Pipeline & Security', () => {
    it('accepts safe SVG and extracts dimensions and vector metadata', async () => {
      const safeSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500" viewBox="0 0 500 500"><circle cx="250" cy="250" r="200" fill="#6366F1"/></svg>`;
      const safeSvgBase64 = Buffer.from(safeSvg, 'utf-8').toString('base64');

      const res = await app.inject({
        method: 'POST',
        url: '/v1/assets/upload',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          type: 'motion_graphics',
          category: 'lower_thirds',
          name: 'Minimal Modern Circle',
          filename: 'circle.svg',
          mimeType: 'image/svg+xml',
          fileBase64: safeSvgBase64,
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.data.metadata.format).toBe('svg');
      expect(body.data.metadata.width).toBe(500);
      expect(body.data.metadata.height).toBe(500);
    });

    it('REJECTS malicious SVG containing script tags or event handlers (XSS prevention)', async () => {
      const maliciousSvg = `<svg xmlns="http://www.w3.org/2000/svg"><script>alert("pwned")</script><rect width="10" height="10"/></svg>`;
      const maliciousSvgBase64 = Buffer.from(maliciousSvg, 'utf-8').toString('base64');

      const res = await app.inject({
        method: 'POST',
        url: '/v1/assets/upload',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          type: 'motion_graphics',
          category: 'overlays',
          name: 'Infected Overlay',
          filename: 'exploit.svg',
          mimeType: 'image/svg+xml',
          fileBase64: maliciousSvgBase64,
        },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error.message).toMatch(/forbidden executable script|malicious/i);
    });

    it('REJECTS malicious SVG with XML Entity Expansion (Billion Laughs / XXE attack)', async () => {
      const xxeSvg = `<?xml version="1.0"?>
      <!DOCTYPE lolz [
        <!ENTITY lol "lol">
        <!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;">
      ]>
      <svg xmlns="http://www.w3.org/2000/svg"><text>&lol2;</text></svg>`;
      const xxeSvgBase64 = Buffer.from(xxeSvg, 'utf-8').toString('base64');

      const res = await app.inject({
        method: 'POST',
        url: '/v1/assets/upload',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          type: 'motion_graphics',
          category: 'titles',
          name: 'XXE Vector Bomb',
          filename: 'bomb.svg',
          mimeType: 'image/svg+xml',
          fileBase64: xxeSvgBase64,
        },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error.message).toMatch(/Entity Expansion|XXE/i);
    });

    it('validates Lottie animation constraints: parses layers, framerate, and duration', async () => {
      const validLottie = {
        v: '5.7.4',
        fr: 60,
        ip: 0,
        op: 120, // 2 seconds
        w: 1920,
        h: 1080,
        layers: [
          { ind: 1, ty: 4, nm: 'Shape Layer 1', ip: 0, op: 120 },
          { ind: 2, ty: 4, nm: 'Shape Layer 2', ip: 0, op: 120 },
        ],
      };
      const lottieBase64 = Buffer.from(JSON.stringify(validLottie), 'utf-8').toString('base64');

      const res = await app.inject({
        method: 'POST',
        url: '/v1/assets/upload',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          type: 'motion_graphics',
          category: 'cta_graphics',
          name: 'Subscribe Button Lottie',
          filename: 'subscribe.json',
          mimeType: 'application/json',
          fileBase64: lottieBase64,
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.data.metadata.format).toBe('lottie');
      expect(body.data.metadata.durationSeconds).toBe(2);
      expect(body.data.metadata.layerCount).toBe(2);
    });

    it('REJECTS excessive Lottie animation exceeding complexity limits (>200 layers)', async () => {
      const heavyLayers = Array.from({ length: 250 }, (_, i) => ({
        ind: i,
        ty: 4,
        nm: `Layer ${i}`,
        ip: 0,
        op: 100,
      }));

      const excessiveLottie = {
        v: '5.7.4',
        fr: 30,
        ip: 0,
        op: 100,
        w: 1920,
        h: 1080,
        layers: heavyLayers,
      };

      const excessiveBase64 = Buffer.from(
        JSON.stringify(excessiveLottie),
        'utf-8'
      ).toString('base64');

      const res = await app.inject({
        method: 'POST',
        url: '/v1/assets/upload',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          type: 'motion_graphics',
          category: 'lower_thirds',
          name: 'Crash Browser Lottie',
          filename: 'heavy.json',
          mimeType: 'application/json',
          fileBase64: excessiveBase64,
        },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error.message).toMatch(/too many layers|maximum limit/i);
    });
  });

  // ============================================================================
  // COMMAND 30: SOCIAL EXPORT PRESETS + BRAND KIT
  // ============================================================================
  describe('Command 30: Social Export Presets + Brand Kit', () => {
    it('GET /v1/presets/social retrieves platform-specific export presets with safe areas and thumbnail rules', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/presets/social?platform=tiktok',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data).toHaveLength(1);

      const tiktok = body.data[0];
      expect(tiktok.platform).toBe('tiktok');
      expect(tiktok.width).toBe(1080);
      expect(tiktok.height).toBe(1920);
      expect(tiktok.aspectRatio).toBe('9:16');
      expect(tiktok.safeArea.bottom).toBe(280); // Bottom action / caption margin
      expect(tiktok.safeArea.right).toBe(140); // Right side like/share icons
      expect(tiktok.captionDefaults.fontSize).toBe(48);
      expect(tiktok.thumbnailRules.aspectRatio).toBe('9:16');
    });

    it('PUT /v1/brand-kit updates user brand kit with custom colors, typography, watermark, and CTA', async () => {
      const putRes = await app.inject({
        method: 'PUT',
        url: '/v1/brand-kit',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          name: 'TechXayan Prime Branding',
          colors: {
            primary: '#7C3AED',
            secondary: '#06B6D4',
            accent: '#F59E0B',
            background: '#0B0F19',
            text: '#F8FAFC',
          },
          fonts: {
            primaryFont: 'Outfit',
            headingFont: 'Outfit',
            bodyFont: 'Inter',
          },
          watermark: {
            url: 'https://cdn.techxayan.com/brand/watermark.png',
            position: 'top_right',
            opacity: 0.85,
            scale: 0.12,
            margin: 20,
          },
          cta: {
            text: 'Subscribe for Tech Insights',
            buttonColor: '#7C3AED',
            textColor: '#FFFFFF',
            style: 'pill',
          },
          socialHandles: {
            tiktok: '@techxayan',
            youtube: '@techxayan_official',
            x: '@techxayan',
          },
        },
      });

      expect(putRes.statusCode).toBe(200);
      const body = JSON.parse(putRes.body);
      expect(body.data.name).toBe('TechXayan Prime Branding');
      expect(body.data.colors.primary).toBe('#7C3AED');
      expect(body.data.fonts.primaryFont).toBe('Outfit');

      // Verify GET /v1/brand-kit returns persisted data
      const getRes = await app.inject({
        method: 'GET',
        url: '/v1/brand-kit',
        headers: { Authorization: `Bearer ${authToken}` },
      });
      expect(getRes.statusCode).toBe(200);
      const getBody = JSON.parse(getRes.body);
      expect(getBody.data.name).toBe('TechXayan Prime Branding');
      expect(getBody.data.socialHandles.tiktok).toBe('@techxayan');
    });

    it('POST /v1/brand-kit/apply injects brand colors, fonts, and watermark track into existing editable project', async () => {
      const applyRes = await app.inject({
        method: 'POST',
        url: '/v1/brand-kit/apply',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          projectId: instantiatedProjectId,
        },
      });

      expect(applyRes.statusCode).toBe(200);
      const body = JSON.parse(applyRes.body);
      expect(body.success).toBe(true);

      const project = body.data;

      // 1. Watermark track was created and configured
      const watermarkTrack = project.timeline.tracks.find(
        (t: any) => t.name === 'Brand Watermark'
      );
      expect(watermarkTrack).toBeDefined();
      expect(watermarkTrack.clips.length).toBe(1);
      expect(watermarkTrack.clips[0].opacity).toBe(0.85);
      expect(watermarkTrack.clips[0].scale).toBe(0.12);

      // 2. Text clips adopted brand font family
      const textTrack = project.timeline.tracks.find((t: any) => t.type === 'text' || t.type === 'overlay');
      const textClips = (textTrack?.clips || []).filter((c: any) => c.text);
      expect(textClips.length).toBeGreaterThan(0);
      for (const textClip of textClips) {
        expect(textClip.fontFamily).toBe('Outfit');
      }
    });
  });
});
