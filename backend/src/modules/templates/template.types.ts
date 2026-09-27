export type TemplatePlaceholderType = 'media' | 'text' | 'audio' | 'logo';

export interface TemplatePlaceholderConstraints {
  maxCharacters?: number;
  minDurationSeconds?: number;
  maxDurationSeconds?: number;
  allowedMimeTypes?: string[];
  aspectRatio?: string;
}

export interface TemplatePlaceholder {
  id: string;
  type: TemplatePlaceholderType;
  label: string;
  clipId: string;
  trackId: string;
  defaultValue?: any;
  constraints?: TemplatePlaceholderConstraints;
}

export interface TemplateColorTheme {
  id: string;
  name: string;
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
}

export interface TemplateFontTheme {
  id: string;
  name: string;
  headingFont: string;
  bodyFont: string;
  subtitleFont?: string;
}

export interface Template {
  id: string;
  name: string;
  slug: string;
  category: string;
  description?: string;
  tags: string[];
  aspectRatio: string;
  duration: number;
  thumbnailUrl?: string;
  previewVideoUrl?: string;
  timelineData: any;
  placeholders: TemplatePlaceholder[];
  colorThemes: TemplateColorTheme[];
  fontThemes: TemplateFontTheme[];
  popularity: number;
  isFeatured: boolean;
  isPremium: boolean;
  version: number;
  schemaVersion: number;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ListTemplatesQuery {
  category?: string;
  search?: string;
  tags?: string[];
  aspectRatio?: string;
  minDuration?: number;
  maxDuration?: number;
  isFeatured?: boolean;
  isFavorite?: boolean;
  page?: number;
  limit?: number;
  sort?: 'popularity' | 'featured' | 'recent' | 'name';
}

export interface UseTemplatePlaceholderSubstitution {
  placeholderId: string;
  value: any; // mediaAssetId, text content, audioAssetId, or logoAssetId
}

export interface UseTemplateInput {
  title?: string;
  substitutions?: UseTemplatePlaceholderSubstitution[];
  colorThemeId?: string;
  fontThemeId?: string;
  brandKitId?: string;
  applyBrandKit?: boolean;
}
