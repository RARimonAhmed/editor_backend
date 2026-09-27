export type PresetType =
  | 'effect'
  | 'transition'
  | 'filter'
  | 'motion'
  | 'text_animation'
  | 'color_preset'
  | 'lut';

export type PresetRenderer =
  | 'glsl_shader'
  | 'ffmpeg_filter'
  | 'canvas_2d'
  | 'native_skia'
  | 'lottie';

export type PlatformId = 'windows' | 'macos' | 'linux' | 'android' | 'ios' | 'web';

export interface PresetParameter {
  name: string;
  label: string;
  type: 'number' | 'color' | 'boolean' | 'enum' | 'vec2' | 'text';
  default: any;
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ label: string; value: any }>;
}

export interface EffectPreset {
  id: string;
  version: number;
  name: string;
  type: PresetType;
  category: string;
  renderer: PresetRenderer;
  parameters: PresetParameter[];
  defaults: Record<string, any>;
  minValues: Record<string, number>;
  maxValues: Record<string, number>;
  preview: {
    type: 'image' | 'video' | 'shader';
    url: string;
  };
  supportedPlatforms: PlatformId[];
  isPremium: boolean;
  shaderCode?: string;
  ffmpegFilterExpression?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformCapability {
  platform: PlatformId;
  supportedRenderers: PresetRenderer[];
  unsupportedRenderers: PresetRenderer[];
  supportedPresets: string[];
  unsupportedPresets: Array<{ id: string; name: string; reason: string }>;
  deviceConstraints?: {
    maxTextureSize?: number;
    floatingPointTextures?: boolean;
    computeShaders?: boolean;
  };
}

export interface ListPresetsQuery {
  type?: PresetType;
  category?: string;
  platform?: PlatformId;
  renderer?: PresetRenderer;
  search?: string;
  page?: number;
  limit?: number;
}
