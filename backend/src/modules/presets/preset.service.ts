import {
  EffectPreset,
  ListPresetsQuery,
  PlatformId,
  PlatformCapability,
  PresetRenderer,
} from './preset.types.js';
import { NotFoundError } from '../../core/errors.js';

export const mockPresets = new Map<string, EffectPreset>();

export const PLATFORM_RENDERER_MATRIX: Record<PlatformId, PresetRenderer[]> = {
  windows: ['glsl_shader', 'ffmpeg_filter', 'canvas_2d', 'native_skia', 'lottie'],
  macos: ['glsl_shader', 'ffmpeg_filter', 'canvas_2d', 'native_skia', 'lottie'],
  linux: ['glsl_shader', 'ffmpeg_filter', 'canvas_2d', 'native_skia', 'lottie'],
  web: ['canvas_2d', 'glsl_shader', 'lottie'],
  ios: ['native_skia', 'canvas_2d', 'lottie'],
  android: ['canvas_2d', 'native_skia', 'lottie'], // Restricted from high-overhead custom GLSL compute shaders
};

export class PresetService {
  constructor() {
    this.seedCatalog();
  }

  private seedCatalog() {
    if (mockPresets.size > 0) return;

    const now = '2026-09-01T00:00:00.000Z';

    // 1. Universal Gaussian Blur
    mockPresets.set('fx-gaussian-blur', {
      id: 'fx-gaussian-blur',
      version: 1,
      name: 'Gaussian Blur',
      type: 'effect',
      category: 'blur',
      renderer: 'canvas_2d',
      parameters: [
        { name: 'radius', label: 'Blur Radius', type: 'number', default: 10, min: 0, max: 100, step: 1 },
      ],
      defaults: { radius: 10 },
      minValues: { radius: 0 },
      maxValues: { radius: 100 },
      preview: { type: 'image', url: 'https://storage.mock.local/presets/blur.jpg' },
      supportedPlatforms: ['windows', 'macos', 'linux', 'android', 'ios', 'web'],
      isPremium: false,
      ffmpegFilterExpression: 'gblur=sigma={radius}',
      createdAt: now,
      updatedAt: now,
    });

    // 2. High-Performance Chromatic Aberration Shader
    mockPresets.set('fx-chromatic-aberration', {
      id: 'fx-chromatic-aberration',
      version: 1,
      name: 'Chromatic Aberration',
      type: 'effect',
      category: 'distortion',
      renderer: 'glsl_shader',
      parameters: [
        { name: 'intensity', label: 'Separation Intensity', type: 'number', default: 0.015, min: 0.0, max: 0.1, step: 0.001 },
      ],
      defaults: { intensity: 0.015 },
      minValues: { intensity: 0.0 },
      maxValues: { intensity: 0.1 },
      preview: { type: 'shader', url: 'https://storage.mock.local/presets/chromatic.jpg' },
      supportedPlatforms: ['windows', 'macos', 'linux', 'web'],
      isPremium: false,
      shaderCode: `precision mediump float; uniform sampler2D u_image; varying vec2 v_texCoord; uniform float intensity; void main() { ... }`,
      createdAt: now,
      updatedAt: now,
    });

    // 3. Desktop-Only Heavy Compute Ray-Marching Volumetric Light
    // (Explicitly unsupported on mobile to prove capability validation)
    mockPresets.set('fx-volumetric-godrays', {
      id: 'fx-volumetric-godrays',
      version: 1,
      name: 'Volumetric God Rays (Compute)',
      type: 'effect',
      category: 'lighting',
      renderer: 'ffmpeg_filter',
      parameters: [
        { name: 'samples', label: 'Ray Samples', type: 'number', default: 64, min: 16, max: 256, step: 8 },
        { name: 'decay', label: 'Falloff Decay', type: 'number', default: 0.95, min: 0.5, max: 1.0, step: 0.01 },
      ],
      defaults: { samples: 64, decay: 0.95 },
      minValues: { samples: 16, decay: 0.5 },
      maxValues: { samples: 256, decay: 1.0 },
      preview: { type: 'video', url: 'https://storage.mock.local/presets/godrays.mp4' },
      supportedPlatforms: ['windows', 'macos', 'linux'], // NOT android, ios, web
      isPremium: true,
      ffmpegFilterExpression: 'frei0r=filter_name=light_rays',
      createdAt: now,
      updatedAt: now,
    });

    // 4. Universal Crossfade Transition
    mockPresets.set('tr-crossfade', {
      id: 'tr-crossfade',
      version: 1,
      name: 'Cross Dissolve',
      type: 'transition',
      category: 'dissolve',
      renderer: 'canvas_2d',
      parameters: [
        { name: 'duration', label: 'Transition Duration', type: 'number', default: 0.5, min: 0.1, max: 5.0, step: 0.1 },
      ],
      defaults: { duration: 0.5 },
      minValues: { duration: 0.1 },
      maxValues: { duration: 5.0 },
      preview: { type: 'image', url: 'https://storage.mock.local/presets/crossfade.jpg' },
      supportedPlatforms: ['windows', 'macos', 'linux', 'android', 'ios', 'web'],
      isPremium: false,
      createdAt: now,
      updatedAt: now,
    });

    // 5. Glitch Flash Transition (GLSL)
    mockPresets.set('tr-glitch-flash', {
      id: 'tr-glitch-flash',
      version: 1,
      name: 'RGB Glitch Flash',
      type: 'transition',
      category: 'stylize',
      renderer: 'glsl_shader',
      parameters: [
        { name: 'blockNoise', label: 'Block Noise', type: 'number', default: 0.5, min: 0.1, max: 1.0, step: 0.05 },
      ],
      defaults: { blockNoise: 0.5 },
      minValues: { blockNoise: 0.1 },
      maxValues: { blockNoise: 1.0 },
      preview: { type: 'shader', url: 'https://storage.mock.local/presets/glitch.jpg' },
      supportedPlatforms: ['windows', 'macos', 'linux', 'web'],
      isPremium: true,
      createdAt: now,
      updatedAt: now,
    });

    // 6. Kinetic Typewriter Text Animation
    mockPresets.set('text-kinetic-typewriter', {
      id: 'text-kinetic-typewriter',
      version: 1,
      name: 'Kinetic Typewriter',
      type: 'text_animation',
      category: 'titles',
      renderer: 'native_skia',
      parameters: [
        { name: 'cursorBlink', label: 'Blinking Cursor', type: 'boolean', default: true },
        { name: 'charsPerSecond', label: 'Speed (chars/sec)', type: 'number', default: 20, min: 5, max: 60, step: 1 },
      ],
      defaults: { cursorBlink: true, charsPerSecond: 20 },
      minValues: { charsPerSecond: 5 },
      maxValues: { charsPerSecond: 60 },
      preview: { type: 'image', url: 'https://storage.mock.local/presets/typewriter.gif' },
      supportedPlatforms: ['windows', 'macos', 'linux', 'android', 'ios', 'web'],
      isPremium: false,
      createdAt: now,
      updatedAt: now,
    });

    // 7. Cinematic Teal & Orange LUT
    mockPresets.set('lut-teal-orange', {
      id: 'lut-teal-orange',
      version: 1,
      name: 'Blockbuster Teal & Orange',
      type: 'lut',
      category: 'cinematic',
      renderer: 'canvas_2d',
      parameters: [
        { name: 'mix', label: 'LUT Intensity', type: 'number', default: 0.8, min: 0.0, max: 1.0, step: 0.05 },
      ],
      defaults: { mix: 0.8 },
      minValues: { mix: 0.0 },
      maxValues: { mix: 1.0 },
      preview: { type: 'image', url: 'https://storage.mock.local/presets/teal_orange.jpg' },
      supportedPlatforms: ['windows', 'macos', 'linux', 'android', 'ios', 'web'],
      isPremium: false,
      createdAt: now,
      updatedAt: now,
    });

    // 8. Motion Pan & Zoom (Ken Burns)
    mockPresets.set('motion-ken-burns', {
      id: 'motion-ken-burns',
      version: 1,
      name: 'Smooth Pan & Zoom (Ken Burns)',
      type: 'motion',
      category: 'camera',
      renderer: 'native_skia',
      parameters: [
        { name: 'startScale', label: 'Start Zoom', type: 'number', default: 1.0, min: 0.8, max: 2.0, step: 0.05 },
        { name: 'endScale', label: 'End Zoom', type: 'number', default: 1.25, min: 0.8, max: 2.0, step: 0.05 },
      ],
      defaults: { startScale: 1.0, endScale: 1.25 },
      minValues: { startScale: 0.8, endScale: 0.8 },
      maxValues: { startScale: 2.0, endScale: 2.0 },
      preview: { type: 'image', url: 'https://storage.mock.local/presets/ken_burns.jpg' },
      supportedPlatforms: ['windows', 'macos', 'linux', 'android', 'ios', 'web'],
      isPremium: false,
      createdAt: now,
      updatedAt: now,
    });
  }

  /**
   * Get Platform Capabilities Matrix
   * Communicates exact renderer & preset availability per client OS
   */
  public getPlatformCapabilities(platform: PlatformId): PlatformCapability {
    const supportedRenderers = PLATFORM_RENDERER_MATRIX[platform] || PLATFORM_RENDERER_MATRIX.web;
    const allRenderers: PresetRenderer[] = ['glsl_shader', 'ffmpeg_filter', 'canvas_2d', 'native_skia', 'lottie'];
    const unsupportedRenderers = allRenderers.filter((r) => !supportedRenderers.includes(r));

    const supportedPresets: string[] = [];
    const unsupportedPresets: Array<{ id: string; name: string; reason: string }> = [];

    for (const preset of mockPresets.values()) {
      const isPlatformListed = preset.supportedPlatforms.includes(platform);
      const isRendererSupported = supportedRenderers.includes(preset.renderer);

      if (isPlatformListed && isRendererSupported) {
        supportedPresets.push(preset.id);
      } else {
        let reason = `Renderer '${preset.renderer}' is not supported on platform '${platform}'`;
        if (!isPlatformListed) {
          reason = `Preset is explicitly restricted from platform '${platform}'`;
        }
        unsupportedPresets.push({
          id: preset.id,
          name: preset.name,
          reason,
        });
      }
    }

    return {
      platform,
      supportedRenderers,
      unsupportedRenderers,
      supportedPresets,
      unsupportedPresets,
      deviceConstraints: {
        maxTextureSize: platform === 'android' ? 4096 : 16384,
        floatingPointTextures: platform !== 'android',
        computeShaders: ['windows', 'macos', 'linux'].includes(platform),
      },
    };
  }

  /**
   * List Presets with strict platform compatibility enforcement
   * Never exposes an effect as available when renderer support does not exist on that platform.
   */
  public listPresets(query: ListPresetsQuery): { items: EffectPreset[]; total: number; page: number; limit: number } {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 50));
    const offset = (page - 1) * limit;

    let items = Array.from(mockPresets.values());

    // Filter by type
    if (query.type) {
      items = items.filter((p) => p.type === query.type);
    }

    // Filter by category
    if (query.category) {
      items = items.filter((p) => p.category.toLowerCase() === query.category!.toLowerCase());
    }

    // Filter by renderer
    if (query.renderer) {
      items = items.filter((p) => p.renderer === query.renderer);
    }

    // Strict Platform Compatibility Check
    if (query.platform) {
      const capabilities = this.getPlatformCapabilities(query.platform);
      items = items.filter((p) => capabilities.supportedPresets.includes(p.id));
    }

    // Search query
    if (query.search) {
      const q = query.search.toLowerCase();
      items = items.filter((p) => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q));
    }

    const total = items.length;
    const paginated = items.slice(offset, offset + limit);

    return { items: paginated, total, page, limit };
  }

  /**
   * Get single preset by ID with platform check
   */
  public getPresetById(id: string, platform?: PlatformId): EffectPreset {
    const preset = mockPresets.get(id);
    if (!preset) {
      throw new NotFoundError(`Effect/Transition preset not found: ${id}`);
    }

    if (platform) {
      const caps = this.getPlatformCapabilities(platform);
      if (!caps.supportedPresets.includes(id)) {
        throw new NotFoundError(
          `Preset '${preset.name}' (${id}) is not available on platform '${platform}' (renderer '${preset.renderer}' unsupported)`
        );
      }
    }

    return preset;
  }
}

export const presetService = new PresetService();
