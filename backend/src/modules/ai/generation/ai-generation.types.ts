/**
 * Domain types for Asynchronous AI Generation Backend
 * Supports Text->Image, Text->Video, Image->Video, Text->Music, Text->SFX, Text->Voice, Text->Script.
 */

export interface GenerateImageInput {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:5';
  count?: number;
  projectId?: string;
  model?: string;
  provider?: string;
}

export interface GenerateVideoInput {
  prompt: string;
  imageUrl?: string; // Image -> Video
  durationSeconds?: number;
  fps?: number;
  resolution?: '720p' | '1080p' | '4k';
  aspectRatio?: '16:9' | '9:16' | '1:1';
  projectId?: string;
  model?: string;
  provider?: string;
}

export interface GenerateMusicInput {
  prompt: string;
  genre?: string;
  tempoBpm?: number;
  durationSeconds?: number;
  mood?: string;
  projectId?: string;
  model?: string;
  provider?: string;
}

export interface GenerateSfxInput {
  prompt: string;
  category?: string;
  durationSeconds?: number;
  projectId?: string;
  model?: string;
  provider?: string;
}

export interface GenerateVoiceInput {
  prompt: string; // The speech script text
  voiceId?: string;
  voiceGender?: 'male' | 'female' | 'neutral';
  speed?: number;
  language?: string;
  projectId?: string;
  model?: string;
  provider?: string;
}

export interface GenerateScriptInput {
  prompt: string;
  style?: string;
  targetDurationSeconds?: number;
  genre?: string;
  projectId?: string;
  model?: string;
  provider?: string;
}

export interface GenerationJobOutput {
  mediaAssetId?: string;
  mediaMetadataId?: string;
  projectId?: string;
  fileName: string;
  mimeType: string;
  downloadUrl: string;
  fileKey: string;
  fileSizeBytes: number;
  durationSeconds?: number;
  width?: number;
  height?: number;
  thumbnailUrl?: string;
  text?: string;
  rawMetadata?: Record<string, unknown>;
}
