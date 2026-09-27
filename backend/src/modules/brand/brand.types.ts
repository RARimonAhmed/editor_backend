export type SocialPlatform =
  | 'tiktok'
  | 'instagram'
  | 'youtube'
  | 'facebook'
  | 'linkedin'
  | 'x'
  | 'pinterest';

export interface SafeArea {
  top: number; // percentage or px
  bottom: number;
  left: number;
  right: number;
}

export interface CaptionDefaults {
  maxCharsPerLine: number;
  fontSize: number;
  position: 'bottom' | 'center';
  safeMarginBottom: number;
}

export interface ThumbnailRules {
  width: number;
  height: number;
  aspectRatio: string;
  maxSizeBytes: number;
  recommendedFormat: string;
}

export interface SocialExportPreset {
  id: string;
  platform: SocialPlatform;
  name: string;
  width: number;
  height: number;
  aspectRatio: string;
  framerate: number;
  videoCodec: string;
  bitrateKbps: number;
  audioCodec: string;
  audioBitrateKbps: number;
  safeArea: SafeArea;
  captionDefaults: CaptionDefaults;
  thumbnailRules: ThumbnailRules;
}

export interface BrandColorPalette {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
  palette: string[];
}

export interface BrandTypography {
  primaryFont: string;
  secondaryFont: string;
  headingFont: string;
  bodyFont: string;
  customFontAssetIds?: string[];
}

export interface BrandWatermark {
  assetId?: string;
  url?: string;
  position: 'top_left' | 'top_right' | 'bottom_left' | 'bottom_right';
  opacity: number;
  scale: number;
  margin: number;
}

export interface BrandCTA {
  text: string;
  buttonColor: string;
  textColor: string;
  style: 'pill' | 'rectangle' | 'outline';
  url?: string;
}

export interface BrandSocialHandles {
  tiktok?: string;
  instagram?: string;
  youtube?: string;
  x?: string;
  facebook?: string;
  linkedin?: string;
  website?: string;
}

export interface BrandKit {
  id: string;
  userId: string;
  name: string;
  logo: {
    assetId?: string;
    storageKey?: string;
    url?: string;
    width?: number;
    height?: number;
  };
  colors: BrandColorPalette;
  fonts: BrandTypography;
  intro: {
    assetId?: string;
    templateId?: string;
    durationSeconds?: number;
  };
  outro: {
    assetId?: string;
    templateId?: string;
    durationSeconds?: number;
  };
  watermark: BrandWatermark;
  cta: BrandCTA;
  socialHandles: BrandSocialHandles;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertBrandKitInput {
  name?: string;
  logo?: {
    assetId?: string;
    storageKey?: string;
    url?: string;
    width?: number;
    height?: number;
  };
  colors?: Partial<BrandColorPalette>;
  fonts?: Partial<BrandTypography>;
  intro?: {
    assetId?: string;
    templateId?: string;
    durationSeconds?: number;
  };
  outro?: {
    assetId?: string;
    templateId?: string;
    durationSeconds?: number;
  };
  watermark?: Partial<BrandWatermark>;
  cta?: Partial<BrandCTA>;
  socialHandles?: Partial<BrandSocialHandles>;
}
