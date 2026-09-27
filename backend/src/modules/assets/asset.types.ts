export type CreativeAssetType =
  | 'template'
  | 'effect'
  | 'transition'
  | 'motion_graphics'
  | 'sticker'
  | 'font'
  | 'music'
  | 'sfx'
  | 'lut'
  | 'overlay'
  | 'stock_media'
  | 'ai_generated';

export type MotionGraphicsFormat = 'svg' | 'png' | 'webp' | 'lottie';

export type MotionGraphicsSubtype =
  | 'animated_overlay'
  | 'lower_third'
  | 'title_package'
  | 'logo_animation'
  | 'sticker'
  | 'cta_graphic';

export type AssetStatus = 'draft' | 'review' | 'published' | 'disabled' | 'archived';

export interface LicenseMetadata {
  type: 'commercial' | 'editorial' | 'creative_commons' | 'royalty_free' | 'proprietary';
  commercialUse: boolean;
  attributionRequired: boolean;
  licenseUrl?: string;
  authorName?: string;
}

export interface CompatibilityConfig {
  minEditorVersion: string;
  maxEditorVersion?: string;
  minRendererVersion?: string;
  requiredFeatures?: string[];
}

export interface AssetVersionRecord {
  version: number;
  storageKey: string;
  fileSizeBytes: number;
  checksumSha256: string;
  changeLog: string;
  createdAt: string;
  metadata?: Record<string, any>;
}

export interface AssetThumbnail {
  storageKey?: string;
  url?: string;
  width?: number;
  height?: number;
}

export interface AssetPreview {
  storageKey?: string;
  url?: string;
  durationSeconds?: number;
  mimeType?: string;
}

export interface CreativeAsset {
  id: string;
  version: number;
  type: CreativeAssetType;
  category: string;
  name: string;
  slug: string;
  tags: string[];
  thumbnail: AssetThumbnail;
  preview: AssetPreview;
  storageKey: string;
  cdnUrl: string;
  licenseMetadata: LicenseMetadata;
  compatibility: CompatibilityConfig;
  aspectRatios: string[];
  supportedPlatforms: string[];
  status: AssetStatus;
  isFeatured: boolean;
  createdBy: string;
  metadata: Record<string, any>;
  versionHistory: AssetVersionRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface MotionGraphicsValidationResult {
  valid: boolean;
  format: MotionGraphicsFormat;
  dimensions?: { width: number; height: number };
  durationSeconds?: number;
  fps?: number;
  layerCount?: number;
  sanitizedBuffer?: Buffer;
  warnings?: string[];
}

export interface CreateAssetInput {
  type: CreativeAssetType;
  category: string;
  name: string;
  tags?: string[];
  storageKey: string;
  licenseMetadata?: Partial<LicenseMetadata>;
  compatibility?: Partial<CompatibilityConfig>;
  aspectRatios?: string[];
  supportedPlatforms?: string[];
  status?: AssetStatus;
  isFeatured?: boolean;
  metadata?: Record<string, any>;
  thumbnail?: AssetThumbnail;
  preview?: AssetPreview;
}

export interface UpdateAssetInput {
  name?: string;
  category?: string;
  tags?: string[];
  status?: AssetStatus;
  isFeatured?: boolean;
  licenseMetadata?: Partial<LicenseMetadata>;
  compatibility?: Partial<CompatibilityConfig>;
  aspectRatios?: string[];
  supportedPlatforms?: string[];
  metadata?: Record<string, any>;
  thumbnail?: AssetThumbnail;
  preview?: AssetPreview;
}

export interface ListAssetsQuery {
  type?: CreativeAssetType;
  category?: string;
  status?: AssetStatus;
  search?: string;
  tags?: string[];
  platform?: string;
  aspectRatio?: string;
  isFeatured?: boolean;
  page?: number;
  limit?: number;
  sort?: 'recent' | 'name' | 'popularity' | 'featured';
}
