import { z } from 'zod';

export type MediaCategory = 'video' | 'audio' | 'image' | 'font' | 'lut' | 'sticker' | 'template';

export type MediaLifecycleStatus =
  | 'UPLOADING'
  | 'UPLOADED'
  | 'PROCESSING'
  | 'READY'
  | 'FAILED'
  | 'DELETING'
  | 'DELETED'
  | 'ARCHIVED';

export type MediaOrientation = 'landscape' | 'portrait' | 'square';

// Maximum size quotas per category
export const MEDIA_SIZE_LIMITS: Record<MediaCategory, number> = {
  video: 50 * 1024 * 1024 * 1024, // 50 GB
  audio: 2 * 1024 * 1024 * 1024, // 2 GB
  image: 100 * 1024 * 1024, // 100 MB
  font: 50 * 1024 * 1024, // 50 MB
  lut: 100 * 1024 * 1024, // 100 MB
  sticker: 20 * 1024 * 1024, // 20 MB
  template: 500 * 1024 * 1024, // 500 MB
};

// Allowed MIME types by category
export const ALLOWED_MIME_TYPES: Record<MediaCategory, string[]> = {
  video: [
    'video/mp4',
    'video/quicktime', // .mov
    'video/x-matroska', // .mkv
    'video/webm',
    'video/x-msvideo', // .avi
  ],
  audio: [
    'audio/mpeg', // .mp3
    'audio/wav',
    'audio/x-wav',
    'audio/aac',
    'audio/flac',
    'audio/ogg',
    'audio/mp4',
    'audio/m4a',
    'audio/x-m4a',
  ],
  image: [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/svg+xml',
    'image/tiff',
    'image/bmp',
  ],
  font: [
    'font/ttf',
    'font/otf',
    'font/woff',
    'font/woff2',
    'application/x-font-ttf',
    'application/x-font-opentype',
    'application/font-woff',
  ],
  lut: [
    'application/x-lut',
    'text/plain',
    'application/octet-stream',
  ],
  sticker: [
    'image/png',
    'image/webp',
    'image/gif',
    'image/svg+xml',
    'application/json', // Lottie stickers
  ],
  template: [
    'application/json',
    'application/zip',
    'application/x-zip-compressed',
    'application/octet-stream',
  ],
};

export function inferCategoryFromMime(mime: string, filename: string): MediaCategory {
  const ext = filename.split('.').pop()?.toLowerCase() || '';

  // 1. Extension-based specific checks
  if (['cube', '3dl', 'look'].includes(ext)) return 'lut';
  if (['ttf', 'otf', 'woff', 'woff2'].includes(ext)) return 'font';
  if (['mote', 'motr', 'bundle'].includes(ext)) return 'template';
  if (['sticker', 'tgs'].includes(ext)) return 'sticker';

  // 2. MIME type based checks
  for (const [category, mimeList] of Object.entries(ALLOWED_MIME_TYPES)) {
    if (mimeList.includes(mime.toLowerCase())) {
      return category as MediaCategory;
    }
  }

  // 3. Prefix fallbacks
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('font/')) return 'font';

  return 'template';
}

export interface MediaVariants {
  original?: {
    fileKey: string;
    url?: string;
    sizeBytes: number;
    mimeType: string;
  };
  thumbnail?: {
    fileKey: string;
    url?: string;
    width: number;
    height: number;
  };
  waveform?: {
    fileKey?: string;
    url?: string;
    peaks: number[];
    channels: number;
    samplesPerPixel: number;
  };
  proxy?: {
    fileKey: string;
    url?: string;
    resolution: string;
    codec: string;
    sizeBytes: number;
  };
  previewDerivative?: {
    fileKey: string;
    url?: string;
    resolution: string;
    durationSeconds: number;
  };
}

// POST /v1/media/presign
export const presignUploadSchema = z.object({
  fileName: z.string().min(1, 'File name is required'),
  mimeType: z.string().min(1, 'MIME type is required'),
  fileSizeBytes: z.number().int().positive('File size must be positive'),
  category: z.enum(['video', 'audio', 'image', 'font', 'lut', 'sticker', 'template']).optional(),
  folderId: z.string().optional(),
  projectId: z.string().optional(),
  checksumSha256: z.string().regex(/^[a-fA-F0-9]{64}$/, 'Checksum must be 64 hex characters').optional(),
  uploadType: z.enum(['auto', 'direct', 'multipart']).default('auto'),
  partCount: z.number().int().positive().max(10000).optional(),
});

// POST /v1/media/complete
export const completeUploadSchema = z.object({
  mediaId: z.string().min(1, 'mediaId is required'),
  uploadId: z.string().optional(),
  parts: z
    .array(
      z.object({
        partNumber: z.number().int().positive(),
        eTag: z.string().min(1),
      })
    )
    .optional(),
  checksumSha256: z.string().optional(),
  durationSeconds: z.number().positive().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

// POST /v1/media/register
export const registerMediaSchema = z.object({
  fileName: z.string().min(1, 'File name is required'),
  mimeType: z.string().min(1, 'MIME type is required'),
  fileSizeBytes: z.number().int().positive('File size must be positive'),
  category: z.enum(['video', 'audio', 'image', 'font', 'lut', 'sticker', 'template']).optional(),
  folderId: z.string().optional(),
  projectId: z.string().optional(),
  fileKey: z.string().optional(),
  checksumSha256: z.string().optional(),
  durationSeconds: z.number().optional(),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
  framerate: z.number().optional(),
  codec: z.string().optional(),
  bitrateKbps: z.number().optional(),
  audioChannels: z.number().int().optional(),
  audioSampleRate: z.number().int().optional(),
  rotation: z.number().optional(),
});

// POST /v1/media/upload (Direct upload for small assets)
export const directUploadSchema = z.object({
  fileName: z.string().min(1, 'File name is required'),
  mimeType: z.string().min(1, 'MIME type is required'),
  fileBase64: z.string().min(1, 'Base64 encoded file data is required'),
  category: z.enum(['video', 'audio', 'image', 'font', 'lut', 'sticker', 'template']).optional(),
  folderId: z.string().optional(),
  projectId: z.string().optional(),
  checksumSha256: z.string().optional(),
});

// PATCH /v1/media/:id/rename
export const renameMediaSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
});

// PATCH /v1/media/:id/move
export const moveMediaSchema = z.object({
  folderId: z.string().nullable().optional(),
});

// POST /v1/media/:id/favorite
export const favoriteMediaSchema = z.object({
  isFavorite: z.boolean().default(true),
});

// FOLDER SCHEMAS
export const createFolderSchema = z.object({
  name: z.string().min(1, 'Folder name is required').max(100),
  parentId: z.string().nullable().optional(),
  color: z.string().optional(),
});

export const renameFolderSchema = z.object({
  name: z.string().min(1, 'Folder name is required').max(100),
  color: z.string().optional(),
});

export const moveFolderSchema = z.object({
  parentId: z.string().nullable().optional(),
});

// GET /v1/media (List query)
export const listMediaQuerySchema = z.object({
  category: z.enum(['video', 'audio', 'image', 'font', 'lut', 'sticker', 'template', 'all']).default('all'),
  type: z.string().optional(),
  status: z.enum(['UPLOADING', 'UPLOADED', 'PROCESSING', 'READY', 'FAILED', 'DELETING', 'DELETED', 'ARCHIVED', 'all']).default('READY'),
  folderId: z.string().optional(),
  favorite: z.preprocess((v) => (v === 'true' || v === true ? true : v === 'false' || v === false ? false : undefined), z.boolean().optional()),
  recent: z.preprocess((v) => (v === 'true' || v === true ? true : v === 'false' || v === false ? false : undefined), z.boolean().optional()),
  projectId: z.string().optional(),
  search: z.string().optional(),
  q: z.string().optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'name', 'fileSizeBytes', 'durationSeconds']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().nonnegative().default(0),
});

// Backwards compatibility schemas
export const requestUploadUrlSchema = z.object({
  fileName: z.string().min(1, 'File name is required'),
  mimeType: z.string().min(1, 'MIME type is required'),
  fileSizeBytes: z.number().int().positive('File size must be positive'),
  projectId: z.string().optional(),
});

export const confirmUploadSchema = z.object({
  fileKey: z.string().min(1, 'File key is required'),
  fileName: z.string().min(1, 'File name is required'),
  mimeType: z.string().min(1, 'MIME type is required'),
  fileSizeBytes: z.number().int().positive(),
  projectId: z.string().optional(),
  durationSeconds: z.number().optional(),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
});

export type PresignUploadInput = z.infer<typeof presignUploadSchema>;
export type CompleteUploadInput = z.infer<typeof completeUploadSchema>;
export type RegisterMediaInput = z.infer<typeof registerMediaSchema>;
export type DirectUploadInput = z.infer<typeof directUploadSchema>;
export type RenameMediaInput = z.infer<typeof renameMediaSchema>;
export type MoveMediaInput = z.infer<typeof moveMediaSchema>;
export type FavoriteMediaInput = z.infer<typeof favoriteMediaSchema>;
export type CreateFolderInput = z.infer<typeof createFolderSchema>;
export type RenameFolderInput = z.infer<typeof renameFolderSchema>;
export type MoveFolderInput = z.infer<typeof moveFolderSchema>;
export type ListMediaQuery = z.infer<typeof listMediaQuerySchema>;
export type RequestUploadUrlInput = z.infer<typeof requestUploadUrlSchema>;
export type ConfirmUploadInput = z.infer<typeof confirmUploadSchema>;
