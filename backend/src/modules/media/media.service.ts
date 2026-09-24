import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import crypto from 'crypto';
import { storageService, PresignedUrlResult, MultipartPartInfo } from '../../services/storage/index.js';
import { db } from '../../database/client.js';
import { jobQueue } from '../../services/queue/index.js';
import { MediaProcessingJobPayload, mediaProcessorService } from './media-processor.service.js';
import { mediaValidationService } from './media-validation.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../../core/errors.js';
import {
  MediaCategory,
  MediaLifecycleStatus,
  MediaOrientation,
  MediaVariants,
  PresignUploadInput,
  CompleteUploadInput,
  RegisterMediaInput,
  DirectUploadInput,
  RenameMediaInput,
  MoveMediaInput,
  FavoriteMediaInput,
  CreateFolderInput,
  RenameFolderInput,
  MoveFolderInput,
  ListMediaQuery,
  RequestUploadUrlInput,
  ConfirmUploadInput,
  inferCategoryFromMime,
  ALLOWED_MIME_TYPES,
  MEDIA_SIZE_LIMITS,
} from './media.schemas.js';
import { logger } from '../../core/logger.js';

export interface MediaFolder {
  id: string;
  userId: string;
  name: string;
  parentId?: string | null;
  color?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MediaAsset {
  id: string;
  userId: string;
  projectId?: string;
  folderId?: string | null;
  name: string;
  originalFilename: string;
  category: MediaCategory;
  fileKey: string;
  mimeType: string;
  fileSizeBytes: number;
  durationSeconds?: number;
  width?: number;
  height?: number;
  framerate?: number;
  codec?: string;
  container?: string;
  bitrateKbps?: number;
  audioCodec?: string;
  audioChannels?: number;
  audioSampleRate?: number;
  rotation?: number;
  orientation?: MediaOrientation;
  checksumSha256?: string;
  isFavorite?: boolean;
  uploadId?: string;
  uploadType: 'direct' | 'multipart';
  status: MediaLifecycleStatus;
  variants?: MediaVariants;
  isDuplicate?: boolean;
  scanResult?: {
    status: 'passed' | 'failed';
    details?: string;
    scannedAt: string;
  };
  retentionDays: number;
  downloadUrl?: string;
  thumbnailUrl?: string;
  thumbnailStrip?: Array<any>;
  waveform?: any;
  proxy?: any;
  searchMetadata?: any;
  metadata?: any;
  processingJobId?: string;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export const mockMediaFolders = new Map<string, MediaFolder>();
export const mockMediaAssets = new Map<string, MediaAsset>();

function validateFilenameSecurity(filename: string) {
  if (!filename || filename.trim().length === 0) {
    throw new ValidationError('Filename cannot be empty');
  }
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    throw new ValidationError('Security violation: Path traversal characters are forbidden in filename');
  }
  const dangerousExts = [
    '.exe',
    '.bat',
    '.cmd',
    '.sh',
    '.bash',
    '.ps1',
    '.vbs',
    '.js',
    '.py',
    '.php',
    '.msi',
    '.dll',
    '.scr',
    '.com',
    '.bin',
  ];
  const ext = path.extname(filename).toLowerCase();
  if (dangerousExts.includes(ext)) {
    throw new ValidationError(`Execution security violation: File extension "${ext}" is not permitted (forbidden executable/script format).`);
  }
}

export class MediaService {
  // ============================================================================
  // SECURITY & MALWARE SCANNING HOOK
  // ============================================================================
  private async executeSecurityScan(
    fileKey: string,
    mimeType: string,
    category: MediaCategory,
    buffer?: Buffer
  ): Promise<{ passed: boolean; reason?: string }> {
    logger.debug({ fileKey, mimeType, category }, 'Running security & malware scan hook');

    // 1. If buffer is provided, check for script injection / malware signatures
    if (buffer) {
      const contentStr = buffer.slice(0, 1024).toString('utf-8').toLowerCase();

      // Malicious script payload detection in SVG/XML/templates
      if (['image', 'template', 'sticker'].includes(category) && mimeType.includes('svg')) {
        if (contentStr.includes('<script') || contentStr.includes('javascript:') || contentStr.includes('onload=')) {
          return { passed: false, reason: 'Malicious JavaScript payload detected in SVG vector asset' };
        }
      }

      // EICAR test signature check for anti-malware verification
      if (contentStr.includes('x5o!p%@ap[4\\pzx54(p^)7cc)7}$eicar-standard-antivirus-test-file!$h+h*')) {
        return { passed: false, reason: 'Known malware signature detected (EICAR test string)' };
      }
    }

    return { passed: true };
  }

  // ============================================================================
  // FOLDER CRUD
  // ============================================================================
  async createFolder(userId: string, input: CreateFolderInput): Promise<MediaFolder> {
    const trimmed = (input.name || '').trim();
    if (!trimmed) {
      throw new ValidationError('Folder name cannot be empty');
    }
    if (trimmed.includes('/') || trimmed.includes('\\') || trimmed.includes('..')) {
      throw new ValidationError('Folder name contains invalid path characters');
    }

    if (input.parentId) {
      const parent = mockMediaFolders.get(input.parentId);
      if (!parent || parent.userId !== userId) {
        throw new NotFoundError(`Parent folder not found: ${input.parentId}`);
      }
    }

    const folderId = `folder_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const now = new Date().toISOString();
    const folder: MediaFolder = {
      id: folderId,
      userId,
      name: trimmed,
      parentId: input.parentId || null,
      color: input.color || '#3B82F6',
      createdAt: now,
      updatedAt: now,
    };

    mockMediaFolders.set(folderId, folder);
    logger.info({ folderId, name: trimmed, userId }, 'Created media folder');
    return folder;
  }

  async listFolders(userId: string): Promise<MediaFolder[]> {
    return Array.from(mockMediaFolders.values())
      .filter((f) => f.userId === userId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async getFolderById(userId: string, folderId: string): Promise<MediaFolder> {
    const folder = mockMediaFolders.get(folderId);
    if (!folder || folder.userId !== userId) {
      throw new NotFoundError(`Folder not found: ${folderId}`);
    }
    return folder;
  }

  async renameFolder(userId: string, folderId: string, input: RenameFolderInput): Promise<MediaFolder> {
    const folder = await this.getFolderById(userId, folderId);
    const trimmed = (input.name || '').trim();
    if (!trimmed) {
      throw new ValidationError('Folder name cannot be empty');
    }
    if (trimmed.includes('/') || trimmed.includes('\\') || trimmed.includes('..')) {
      throw new ValidationError('Folder name contains invalid characters');
    }

    folder.name = trimmed;
    if (input.color) folder.color = input.color;
    folder.updatedAt = new Date().toISOString();
    mockMediaFolders.set(folderId, folder);
    return folder;
  }

  async moveFolder(userId: string, folderId: string, input: MoveFolderInput): Promise<MediaFolder> {
    const folder = await this.getFolderById(userId, folderId);

    if (input.parentId === folderId) {
      throw new ValidationError('Cannot move folder into itself');
    }

    if (input.parentId) {
      const parent = await this.getFolderById(userId, input.parentId);
      let curr = parent;
      while (curr.parentId) {
        if (curr.parentId === folderId) {
          throw new ValidationError('Cannot move folder into one of its subfolders');
        }
        const next = mockMediaFolders.get(curr.parentId);
        if (!next) break;
        curr = next;
      }
    }

    folder.parentId = input.parentId || null;
    folder.updatedAt = new Date().toISOString();
    mockMediaFolders.set(folderId, folder);
    return folder;
  }

  async deleteFolder(userId: string, folderId: string): Promise<{ deleted: boolean; id: string }> {
    await this.getFolderById(userId, folderId);

    // Unlink any assets located in this folder to root
    for (const asset of mockMediaAssets.values()) {
      if (asset.userId === userId && asset.folderId === folderId) {
        asset.folderId = null;
        asset.updatedAt = new Date().toISOString();
      }
    }

    // Unlink any child folders to root
    for (const child of mockMediaFolders.values()) {
      if (child.userId === userId && child.parentId === folderId) {
        child.parentId = null;
        child.updatedAt = new Date().toISOString();
      }
    }

    mockMediaFolders.delete(folderId);
    logger.info({ folderId, userId }, 'Deleted media folder and unlinked children to root');
    return { deleted: true, id: folderId };
  }

  // ============================================================================
  // PRESIGN UPLOAD (DIRECT OR MULTIPART) WITH DEDUPLICATION
  // ============================================================================
  async presign(
    userId: string,
    input: PresignUploadInput
  ): Promise<{
    mediaId: string;
    fileKey: string;
    uploadType: 'direct' | 'multipart';
    url?: string;
    uploadId?: string;
    parts?: Array<{ partNumber: number; url: string }>;
    expiresInSeconds: number;
    isDuplicate?: boolean;
    existingAsset?: MediaAsset;
  }> {
    validateFilenameSecurity(input.fileName);
    const category = input.category || inferCategoryFromMime(input.mimeType, input.fileName);

    // 1. Content Type Validation
    const allowedList = ALLOWED_MIME_TYPES[category];
    if (allowedList && !allowedList.includes(input.mimeType.toLowerCase())) {
      throw new ValidationError(
        `MIME type "${input.mimeType}" is not permitted for category "${category}". Allowed: ${allowedList.join(', ')}`
      );
    }

    // 2. File Size Validation
    const maxSize = MEDIA_SIZE_LIMITS[category];
    if (input.fileSizeBytes > maxSize) {
      const maxMb = Math.round(maxSize / (1024 * 1024));
      throw new ValidationError(
        `File size ${input.fileSizeBytes} bytes exceeds the maximum allowed limit of ${maxMb} MB for ${category} assets.`
      );
    }

    // 2b. Folder validation
    if (input.folderId) {
      const folder = mockMediaFolders.get(input.folderId);
      if (!folder || folder.userId !== userId) {
        throw new NotFoundError(`Target folder not found: ${input.folderId}`);
      }
    }

    // 3. Deduplication Check (Checksum SHA-256)
    if (input.checksumSha256) {
      const existing = Array.from(mockMediaAssets.values()).find(
        (a) =>
          a.userId === userId &&
          a.status === 'READY' &&
          a.checksumSha256?.toLowerCase() === input.checksumSha256!.toLowerCase() &&
          a.fileSizeBytes === input.fileSizeBytes
      );

      if (existing) {
        logger.info(
          { mediaId: existing.id, checksum: input.checksumSha256 },
          'Deduplication match: Returning existing READY media asset'
        );
        const downloadUrl = await storageService.getDownloadPresignedUrl(existing.fileKey);
        return {
          mediaId: existing.id,
          fileKey: existing.fileKey,
          uploadType: 'direct',
          url: downloadUrl,
          expiresInSeconds: 3600,
          isDuplicate: true,
          existingAsset: existing,
        };
      }
    }

    const safeName = path.basename(input.fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
    const mediaId = uuidv4();
    const fileKey = `users/${userId}/media/${category}/${mediaId}_${safeName}`;
    const now = new Date().toISOString();

    const isMultipart =
      input.uploadType === 'multipart' ||
      (input.uploadType === 'auto' && input.fileSizeBytes >= 50 * 1024 * 1024);

    let uploadId: string | undefined;
    let singlePresignedUrl: string | undefined;
    let partsResult: Array<{ partNumber: number; url: string }> | undefined;
    const expiresIn = 3600;

    if (isMultipart) {
      const init = await storageService.initiateMultipartUpload(fileKey, input.mimeType);
      uploadId = init.uploadId;
      const partSize = 10 * 1024 * 1024;
      const count = input.partCount || Math.max(1, Math.ceil(input.fileSizeBytes / partSize));
      partsResult = [];
      for (let i = 1; i <= count; i++) {
        const partUrl = await storageService.getMultipartPartPresignedUrl(fileKey, uploadId, i, expiresIn);
        partsResult.push({ partNumber: i, url: partUrl });
      }
    } else {
      const presigned = await storageService.getUploadPresignedUrl(
        fileKey,
        input.mimeType,
        input.checksumSha256,
        expiresIn
      );
      singlePresignedUrl = presigned.url;
    }

    const asset: MediaAsset = {
      id: mediaId,
      userId,
      projectId: input.projectId,
      folderId: input.folderId || null,
      name: input.fileName,
      originalFilename: input.fileName,
      category,
      fileKey,
      mimeType: input.mimeType,
      fileSizeBytes: input.fileSizeBytes,
      checksumSha256: input.checksumSha256,
      uploadId,
      uploadType: isMultipart ? 'multipart' : 'direct',
      status: 'UPLOADING',
      isFavorite: false,
      retentionDays: 90,
      createdAt: now,
      updatedAt: now,
    };

    mockMediaAssets.set(mediaId, asset);

    try {
      if (await db.isHealthy()) {
        const storageObjId = uuidv4();
        await db.query(
          `INSERT INTO storage_objects (id, bucket, key, driver, size_bytes, mime_type, checksum_sha256, status)
           VALUES ($1, 'techxayan-media', $2, 's3', $3, $4, $5, 'pending_upload');`,
          [storageObjId, fileKey, input.fileSizeBytes, input.mimeType, input.checksumSha256 || null]
        );
        await db.query(
          `INSERT INTO media_assets (id, user_id, project_id, storage_object_id, name, original_filename, mime_type, file_size_bytes, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'uploading');`,
          [asset.id, userId, asset.projectId || null, storageObjId, asset.name, asset.originalFilename, asset.mimeType, asset.fileSizeBytes]
        );
      }
    } catch {
      // fallback
    }

    return {
      mediaId,
      fileKey,
      uploadType: isMultipart ? 'multipart' : 'direct',
      url: singlePresignedUrl,
      uploadId,
      parts: partsResult,
      expiresInSeconds: expiresIn,
    };
  }

  // ============================================================================
  // DIRECT UPLOAD (SMALL ASSETS: LUTS, FONTS, STICKERS)
  // ============================================================================
  async directUpload(userId: string, input: DirectUploadInput): Promise<MediaAsset> {
    validateFilenameSecurity(input.fileName);
    const category = input.category || inferCategoryFromMime(input.mimeType, input.fileName);

    const allowedList = ALLOWED_MIME_TYPES[category];
    if (allowedList && !allowedList.includes(input.mimeType.toLowerCase())) {
      throw new ValidationError(`MIME type "${input.mimeType}" is not allowed for category "${category}".`);
    }

    const buffer = Buffer.from(input.fileBase64, 'base64');
    const maxSize = MEDIA_SIZE_LIMITS[category];
    if (buffer.length > maxSize) {
      throw new ValidationError(`File size exceeds category limit.`);
    }

    if (input.folderId) {
      const folder = mockMediaFolders.get(input.folderId);
      if (!folder || folder.userId !== userId) {
        throw new NotFoundError(`Target folder not found: ${input.folderId}`);
      }
    }

    const checksumSha256 = crypto.createHash('sha256').update(buffer).digest('hex');

    // Deduplication check
    const existing = Array.from(mockMediaAssets.values()).find(
      (a) =>
        a.userId === userId &&
        a.status === 'READY' &&
        a.checksumSha256?.toLowerCase() === checksumSha256.toLowerCase() &&
        a.fileSizeBytes === buffer.length
    );
    if (existing) {
      existing.downloadUrl = await storageService.getDownloadPresignedUrl(existing.fileKey);
      return { ...existing, isDuplicate: true };
    }

    const scan = await this.executeSecurityScan('', input.mimeType, category, buffer);
    if (!scan.passed) {
      throw new ValidationError(`Security scan rejected upload: ${scan.reason}`);
    }

    const mediaId = uuidv4();
    const safeName = path.basename(input.fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileKey = `users/${userId}/media/${category}/${mediaId}_${safeName}`;
    const now = new Date().toISOString();

    await storageService.putObject(fileKey, buffer, input.mimeType, checksumSha256);
    const downloadUrl = await storageService.getDownloadPresignedUrl(fileKey);

    const asset: MediaAsset = {
      id: mediaId,
      userId,
      projectId: input.projectId,
      folderId: input.folderId || null,
      name: input.fileName,
      originalFilename: input.fileName,
      category,
      fileKey,
      mimeType: input.mimeType,
      fileSizeBytes: buffer.length,
      checksumSha256,
      uploadType: 'direct',
      status: 'READY',
      isFavorite: false,
      retentionDays: 365,
      downloadUrl,
      variants: {
        original: {
          fileKey,
          url: downloadUrl,
          sizeBytes: buffer.length,
          mimeType: input.mimeType,
        },
      },
      createdAt: now,
      updatedAt: now,
    };

    mockMediaAssets.set(mediaId, asset);
    return asset;
  }

  // ============================================================================
  // REGISTER PRE-EXISTING / PRE-UPLOADED MEDIA
  // ============================================================================
  async registerMedia(userId: string, input: RegisterMediaInput): Promise<MediaAsset> {
    validateFilenameSecurity(input.fileName);
    const category = input.category || inferCategoryFromMime(input.mimeType, input.fileName);

    const allowedList = ALLOWED_MIME_TYPES[category];
    if (allowedList && !allowedList.includes(input.mimeType.toLowerCase())) {
      throw new ValidationError(
        `MIME type "${input.mimeType}" is not permitted for category "${category}". Allowed: ${allowedList.join(', ')}`
      );
    }

    const maxSize = MEDIA_SIZE_LIMITS[category];
    if (input.fileSizeBytes > maxSize) {
      const maxMb = Math.round(maxSize / (1024 * 1024));
      throw new ValidationError(`File size ${input.fileSizeBytes} bytes exceeds limit of ${maxMb} MB.`);
    }

    if (input.folderId) {
      const folder = mockMediaFolders.get(input.folderId);
      if (!folder || folder.userId !== userId) {
        throw new NotFoundError(`Target folder not found: ${input.folderId}`);
      }
    }

    // Deduplication check
    if (input.checksumSha256) {
      const existing = Array.from(mockMediaAssets.values()).find(
        (a) =>
          a.userId === userId &&
          a.status === 'READY' &&
          a.checksumSha256?.toLowerCase() === input.checksumSha256!.toLowerCase() &&
          a.fileSizeBytes === input.fileSizeBytes
      );
      if (existing) {
        existing.downloadUrl = await storageService.getDownloadPresignedUrl(existing.fileKey);
        return {
          ...existing,
          isDuplicate: true,
        };
      }
    }

    const mediaId = uuidv4();
    const safeName = path.basename(input.fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileKey = input.fileKey || `users/${userId}/media/${category}/${mediaId}_${safeName}`;
    const now = new Date().toISOString();

    const width = input.width;
    const height = input.height;
    const orientation: MediaOrientation | undefined =
      width && height
        ? width > height
          ? 'landscape'
          : height > width
          ? 'portrait'
          : 'square'
        : undefined;

    const downloadUrl = await storageService.getDownloadPresignedUrl(fileKey);

    const asset: MediaAsset = {
      id: mediaId,
      userId,
      projectId: input.projectId,
      folderId: input.folderId || null,
      name: input.fileName,
      originalFilename: input.fileName,
      category,
      fileKey,
      mimeType: input.mimeType,
      fileSizeBytes: input.fileSizeBytes,
      durationSeconds: input.durationSeconds,
      width,
      height,
      framerate: input.framerate,
      codec: input.codec,
      bitrateKbps: input.bitrateKbps,
      audioChannels: input.audioChannels,
      audioSampleRate: input.audioSampleRate,
      rotation: input.rotation || 0,
      orientation,
      checksumSha256: input.checksumSha256,
      uploadType: 'direct',
      status: 'READY',
      isFavorite: false,
      retentionDays: 365,
      downloadUrl,
      variants: {
        original: {
          fileKey,
          url: downloadUrl,
          sizeBytes: input.fileSizeBytes,
          mimeType: input.mimeType,
        },
      },
      createdAt: now,
      updatedAt: now,
    };

    mockMediaAssets.set(mediaId, asset);
    return asset;
  }

  // ============================================================================
  // COMPLETE UPLOAD & TRIGGER MEDIA PROCESSING JOB
  // ============================================================================
  async complete(userId: string, input: CompleteUploadInput): Promise<MediaAsset> {
    const asset = mockMediaAssets.get(input.mediaId);
    if (!asset) {
      throw new NotFoundError(`Media asset not found: ${input.mediaId}`);
    }

    if (asset.userId !== userId) {
      throw new ForbiddenError('You do not have permission to access this media asset');
    }

    // 0. Idempotency: If already in PROCESSING or READY, return existing state
    if (asset.status === 'READY' || (asset.status === 'PROCESSING' && asset.processingJobId)) {
      logger.info({ mediaId: asset.id, status: asset.status }, 'Idempotent complete: asset already processing or ready');
      return asset;
    }

    const now = new Date().toISOString();

    // 1. Complete multipart if applicable
    if (asset.uploadType === 'multipart' && (input.uploadId || asset.uploadId)) {
      const uploadId = input.uploadId || asset.uploadId!;
      const parts: MultipartPartInfo[] = input.parts || [];
      await storageService.completeMultipartUpload(asset.fileKey, uploadId, parts);
    }

    // 2. Checksum & Magic Bytes validation on stored object (if physical bytes exist)
    const expectedChecksum = input.checksumSha256 || asset.checksumSha256;
    let storedBuffer: Buffer | null = null;
    try {
      storedBuffer = await storageService.getObject(asset.fileKey);
    } catch {
      // no physical object stored yet
    }

    if (storedBuffer && storedBuffer.length > 0) {
      if (expectedChecksum) {
        const checkResult = mediaValidationService.validateChecksum(storedBuffer, expectedChecksum);
        if (!checkResult.valid) {
          asset.status = 'FAILED';
          asset.scanResult = { status: 'failed', details: checkResult.reason, scannedAt: now };
          asset.updatedAt = now;
          await storageService.deleteObject(asset.fileKey);
          throw new ValidationError(checkResult.reason || 'Checksum mismatch');
        }
      }

      const magicResult = mediaValidationService.validateMagicBytes(storedBuffer, asset.category, asset.mimeType);
      if (!magicResult.valid) {
        asset.status = 'FAILED';
        asset.scanResult = { status: 'failed', details: magicResult.reason, scannedAt: now };
        asset.updatedAt = now;
        await storageService.deleteObject(asset.fileKey);
        throw new ValidationError(`Security scan rejected upload: ${magicResult.reason}`);
      }
    } else if (input.checksumSha256 && asset.checksumSha256 && input.checksumSha256 !== asset.checksumSha256) {
      asset.status = 'FAILED';
      asset.scanResult = { status: 'failed', details: 'Checksum SHA-256 mismatch detected', scannedAt: now };
      asset.updatedAt = now;
      throw new ValidationError('Integrity error: Provided checksum does not match expected checksum.');
    }

    // 3. Security Scanning Hook
    const scan = await this.executeSecurityScan(asset.fileKey, asset.mimeType, asset.category, storedBuffer || undefined);
    if (!scan.passed) {
      asset.status = 'FAILED';
      asset.scanResult = { status: 'failed', details: scan.reason, scannedAt: now };
      asset.updatedAt = now;
      await storageService.deleteObject(asset.fileKey);
      throw new ValidationError(`Security scan rejected upload: ${scan.reason}`);
    }

    // 4. Set status to UPLOADED then PROCESSING & Enqueue Asynchronous Media Processing Pipeline Job
    asset.status = 'PROCESSING';
    asset.updatedAt = now;
    asset.scanResult = { status: 'passed', scannedAt: now };
    if (expectedChecksum) asset.checksumSha256 = expectedChecksum;
    if (input.durationSeconds) asset.durationSeconds = input.durationSeconds;
    if (input.width) asset.width = input.width;
    if (input.height) asset.height = input.height;

    asset.downloadUrl = await storageService.getDownloadPresignedUrl(asset.fileKey);

    const job = await jobQueue.add<MediaProcessingJobPayload>(
      'media_processing',
      {
        jobId: uuidv4(),
        mediaId: asset.id,
        userId,
        projectId: asset.projectId,
        fileKey: asset.fileKey,
        mimeType: asset.mimeType,
        category: asset.category,
        fileName: asset.name,
        fileSizeBytes: asset.fileSizeBytes,
        initialOverrides: {
          durationSeconds: input.durationSeconds,
          width: input.width,
          height: input.height,
        },
      },
      { maxAttempts: 3, backoffMs: 50 }
    );

    asset.processingJobId = job.id;
    mockMediaAssets.set(asset.id, asset);

    try {
      if (await db.isHealthy()) {
        await db.query(
          `UPDATE media_assets
           SET status = 'processing', duration_seconds = $1, width = $2, height = $3, updated_at = CURRENT_TIMESTAMP
           WHERE id = $4 AND user_id = $5;`,
          [asset.durationSeconds || null, asset.width || null, asset.height || null, asset.id, userId]
        );
      }
    } catch {
      // fallback
    }

    return asset;
  }

  // ============================================================================
  // MEDIA ASSET MUTATIONS (RENAME, MOVE, FAVORITE, ARCHIVE, RESTORE)
  // ============================================================================
  async rename(userId: string, mediaId: string, name: string): Promise<MediaAsset> {
    const asset = await this.getById(userId, mediaId);
    validateFilenameSecurity(name);
    asset.name = name.trim();
    asset.updatedAt = new Date().toISOString();
    mockMediaAssets.set(mediaId, asset);
    return asset;
  }

  async move(userId: string, mediaId: string, folderId: string | null | undefined): Promise<MediaAsset> {
    const asset = await this.getById(userId, mediaId);
    if (folderId) {
      const folder = mockMediaFolders.get(folderId);
      if (!folder || folder.userId !== userId) {
        throw new NotFoundError(`Target folder not found: ${folderId}`);
      }
    }
    asset.folderId = folderId || null;
    asset.updatedAt = new Date().toISOString();
    mockMediaAssets.set(mediaId, asset);
    return asset;
  }

  async setFavorite(userId: string, mediaId: string, isFavorite = true): Promise<MediaAsset> {
    const asset = await this.getById(userId, mediaId);
    asset.isFavorite = isFavorite;
    asset.updatedAt = new Date().toISOString();
    mockMediaAssets.set(mediaId, asset);
    return asset;
  }

  async archive(userId: string, mediaId: string): Promise<MediaAsset> {
    const asset = await this.getById(userId, mediaId);
    asset.status = 'ARCHIVED';
    asset.updatedAt = new Date().toISOString();
    mockMediaAssets.set(mediaId, asset);
    return asset;
  }

  async restore(userId: string, mediaId: string): Promise<MediaAsset> {
    const asset = mockMediaAssets.get(mediaId);
    if (!asset || asset.userId !== userId) {
      throw new NotFoundError(`Media asset not found: ${mediaId}`);
    }
    asset.status = 'READY';
    asset.deletedAt = null;
    asset.updatedAt = new Date().toISOString();
    mockMediaAssets.set(mediaId, asset);
    return asset;
  }

  // ============================================================================
  // GET MEDIA BY ID
  // ============================================================================
  async getById(userIdOrId: string, idOrUserId?: string): Promise<MediaAsset> {
    let id: string;
    let userId: string;

    if (idOrUserId) {
      if (mockMediaAssets.has(userIdOrId)) {
        id = userIdOrId;
        userId = idOrUserId;
      } else {
        userId = userIdOrId;
        id = idOrUserId;
      }
    } else {
      id = userIdOrId;
      userId = '';
    }

    const asset = mockMediaAssets.get(id);
    if (!asset || asset.status === 'DELETED') {
      throw new NotFoundError(`Media asset not found: ${id}`);
    }

    if (userId && asset.userId !== userId) {
      throw new ForbiddenError('You do not have permission to access this media asset');
    }

    asset.downloadUrl = await storageService.getDownloadPresignedUrl(asset.fileKey);
    return asset;
  }

  // ============================================================================
  // DELETE MEDIA (SOFT DELETE & PERMANENT PURGE)
  // ============================================================================
  async delete(
    userIdOrId: string,
    idOrUserId?: string,
    permanent = false
  ): Promise<{ deleted: boolean; id: string }> {
    let id: string;
    let userId: string;

    if (idOrUserId) {
      if (mockMediaAssets.has(userIdOrId)) {
        id = userIdOrId;
        userId = idOrUserId;
      } else {
        userId = userIdOrId;
        id = idOrUserId;
      }
    } else {
      id = userIdOrId;
      userId = '';
    }

    const asset = mockMediaAssets.get(id);
    if (!asset || asset.status === 'DELETED') {
      throw new NotFoundError(`Media asset not found: ${id}`);
    }

    if (userId && asset.userId !== userId) {
      throw new ForbiddenError('You do not have permission to modify this media asset');
    }

    const now = new Date().toISOString();
    if (permanent) {
      try {
        await storageService.deleteObject(asset.fileKey);
        await storageService.deleteObject(`users/${asset.userId}/media/thumbnails/${asset.id}_cover.jpg`);
        await storageService.deleteObject(`users/${asset.userId}/media/waveforms/${asset.id}_waveform.json`);
        await storageService.deleteObject(`users/${asset.userId}/media/proxies/${asset.id}_720p_proxy.mp4`);
      } catch {
        // ignore
      }
      mockMediaAssets.delete(id);
    } else {
      asset.status = 'DELETED';
      asset.deletedAt = now;
      asset.updatedAt = now;
      mockMediaAssets.set(id, asset);
    }

    try {
      if (await db.isHealthy()) {
        await db.query(
          `UPDATE media_assets SET status = 'deleted', deleted_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2;`,
          [id, asset.userId]
        );
      }
    } catch {
      // fallback
    }

    return { deleted: true, id };
  }

  // ============================================================================
  // CANCEL UPLOAD & CLEANUP PARTIAL OBJECTS
  // ============================================================================
  async cancel(id: string, userId: string): Promise<{ cancelled: boolean; id: string }> {
    const asset = mockMediaAssets.get(id);
    if (!asset) {
      throw new NotFoundError(`Media asset not found: ${id}`);
    }

    if (asset.userId !== userId) {
      throw new ForbiddenError('You do not have permission to modify this media asset');
    }

    if (asset.uploadType === 'multipart' && asset.uploadId) {
      try {
        await storageService.abortMultipartUpload(asset.fileKey, asset.uploadId);
      } catch {}
    }

    try {
      await storageService.deleteObject(asset.fileKey);
    } catch {}

    if (asset.processingJobId) {
      await jobQueue.cancelJob(asset.processingJobId);
    }
    mediaProcessorService.cancelProcessing(asset.id);

    asset.status = 'FAILED';
    asset.updatedAt = new Date().toISOString();
    mockMediaAssets.set(id, asset);

    return { cancelled: true, id };
  }

  // ============================================================================
  // RETRY MEDIA
  // ============================================================================
  async retry(id: string, userId: string): Promise<MediaAsset> {
    const asset = mockMediaAssets.get(id);
    if (!asset) {
      throw new NotFoundError(`Media asset not found: ${id}`);
    }

    if (asset.userId !== userId) {
      throw new ForbiddenError('You do not have permission to modify this media asset');
    }

    let hasStorageObject = false;
    try {
      const head = await storageService.headObject(asset.fileKey);
      hasStorageObject = !!head && head.contentLength > 0;
    } catch {
      hasStorageObject = false;
    }

    const now = new Date().toISOString();
    if (hasStorageObject) {
      asset.status = 'PROCESSING';
      asset.updatedAt = now;

      const job = await jobQueue.add<MediaProcessingJobPayload>(
        'media_processing',
        {
          jobId: uuidv4(),
          mediaId: asset.id,
          userId,
          projectId: asset.projectId,
          fileKey: asset.fileKey,
          mimeType: asset.mimeType,
          category: asset.category,
          fileName: asset.name,
          fileSizeBytes: asset.fileSizeBytes,
        },
        { maxAttempts: 3, backoffMs: 50 }
      );
      asset.processingJobId = job.id;
    } else {
      asset.status = 'UPLOADING';
      asset.updatedAt = now;
    }

    mockMediaAssets.set(id, asset);
    return asset;
  }

  // ============================================================================
  // GET MEDIA PROCESSING JOB STATUS & TELEMETRY
  // ============================================================================
  async getProcessingJob(id: string, userId: string): Promise<Record<string, any>> {
    const asset = await this.getById(id, userId);
    let jobData: any = null;

    if (asset.processingJobId) {
      jobData = await jobQueue.getJob(asset.processingJobId);
    }

    return {
      mediaId: asset.id,
      name: asset.name,
      status: asset.status,
      processingJobId: asset.processingJobId,
      job: jobData
        ? {
            id: jobData.id,
            status: asset.status === 'READY' ? 'completed' : jobData.status,
            progress: asset.status === 'READY' ? 100 : jobData.progress,
            currentStep: jobData.currentStep,
            attempts: jobData.attempts,
            maxAttempts: jobData.maxAttempts,
            isDeadLetter: jobData.isDeadLetter,
            error: jobData.error,
            startedAt: jobData.startedAt,
            completedAt: jobData.completedAt,
          }
        : null,
      telemetry: asset.metadata,
      thumbnails: asset.thumbnailStrip,
      coverThumbnailUrl: asset.thumbnailUrl,
      waveform: asset.waveform,
      proxy: asset.proxy,
      searchMetadata: asset.searchMetadata,
    };
  }

  // ============================================================================
  // CANCEL ASYNCHRONOUS PROCESSING
  // ============================================================================
  async cancelProcessing(id: string, userId: string): Promise<Record<string, any>> {
    const asset = await this.getById(id, userId);
    let cancelledJob = false;

    if (asset.processingJobId) {
      cancelledJob = await jobQueue.cancelJob(asset.processingJobId);
    }

    asset.status = 'FAILED';
    asset.updatedAt = new Date().toISOString();
    mockMediaAssets.set(asset.id, asset);

    try {
      if (await db.isHealthy()) {
        await db.query(
          `UPDATE media_assets SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = $1;`,
          [asset.id]
        );
      }
    } catch {
      // fallback
    }

    return {
      mediaId: asset.id,
      status: asset.status,
      jobCancelled: cancelledJob,
    };
  }

  // ============================================================================
  // LIST MEDIA (SEARCH, FILTERING, FOLDERS, FAVORITES, SORTING, PAGINATION)
  // ============================================================================
  async list(
    userId: string,
    query: Partial<ListMediaQuery> = {}
  ): Promise<{ media: MediaAsset[]; total: number; page: number; limit: number; totalPages: number }> {
    let list = Array.from(mockMediaAssets.values()).filter((a) => a.userId === userId);

    if (query.status && query.status !== 'all') {
      list = list.filter((a) => a.status === query.status);
    } else if (!query.status) {
      list = list.filter((a) => a.status !== 'DELETED');
    }

    const targetCategory = query.type || query.category;
    if (targetCategory && targetCategory !== 'all') {
      list = list.filter((a) => a.category.toLowerCase() === targetCategory.toLowerCase());
    }

    if (query.projectId) {
      list = list.filter((a) => a.projectId === query.projectId);
    }

    if (query.folderId) {
      if (query.folderId === 'root') {
        list = list.filter((a) => !a.folderId);
      } else {
        list = list.filter((a) => a.folderId === query.folderId);
      }
    }

    if (query.favorite !== undefined) {
      list = list.filter((a) => Boolean(a.isFavorite) === query.favorite);
    }

    const searchTerm = query.search || query.q;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      list = list.filter(
        (a) => a.name.toLowerCase().includes(q) || a.originalFilename?.toLowerCase().includes(q)
      );
    }

    const sortBy = query.sortBy || (query.recent ? 'createdAt' : 'createdAt');
    const sortOrder = query.sortOrder || 'desc';

    list.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'name') {
        cmp = a.name.localeCompare(b.name);
      } else if (sortBy === 'fileSizeBytes') {
        cmp = a.fileSizeBytes - b.fileSizeBytes;
      } else if (sortBy === 'durationSeconds') {
        cmp = (a.durationSeconds || 0) - (b.durationSeconds || 0);
      } else if (sortBy === 'updatedAt') {
        cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      } else {
        cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });

    const total = list.length;
    const limit = query.limit || 20;
    const offset = query.offset || 0;
    const paginated = list.slice(offset, offset + limit);

    for (const item of paginated) {
      if (item.status === 'READY') {
        item.downloadUrl = await storageService.getDownloadPresignedUrl(item.fileKey);
      }
    }

    const page = Math.floor(offset / limit) + 1;
    const totalPages = Math.ceil(total / limit) || 1;

    return { media: paginated, total, page, limit, totalPages };
  }

  // ============================================================================
  // BACKWARDS COMPATIBILITY METHODS
  // ============================================================================
  async getUploadUrl(userId: string, input: RequestUploadUrlInput): Promise<PresignedUrlResult> {
    const res = await this.presign(userId, {
      fileName: input.fileName,
      mimeType: input.mimeType,
      fileSizeBytes: input.fileSizeBytes,
      projectId: input.projectId,
      uploadType: 'direct',
    });
    return {
      url: res.url!,
      fileKey: res.fileKey,
      expiresInSeconds: res.expiresInSeconds,
    };
  }

  async confirmUpload(userId: string, input: ConfirmUploadInput): Promise<MediaAsset> {
    let asset = Array.from(mockMediaAssets.values()).find((a) => a.fileKey === input.fileKey);
    if (!asset) {
      const presignRes = await this.presign(userId, {
        fileName: input.fileName,
        mimeType: input.mimeType,
        fileSizeBytes: input.fileSizeBytes,
        projectId: input.projectId,
        uploadType: 'direct',
      });
      asset = mockMediaAssets.get(presignRes.mediaId)!;
    }

    return this.complete(userId, {
      mediaId: asset.id,
      durationSeconds: input.durationSeconds,
      width: input.width,
      height: input.height,
    });
  }

  async listAssets(userId: string, projectId?: string): Promise<MediaAsset[]> {
    const res = await this.list(userId, {
      category: 'all',
      status: 'all',
      projectId,
      limit: 100,
      offset: 0,
    });
    return res.media;
  }

  // ============================================================================
  // CREATE GENERATED ASSET (AI GENERATION OUTPUT PIPELINE)
  // ============================================================================
  async createGeneratedAsset(input: {
    userId: string;
    projectId?: string;
    name: string;
    category: MediaCategory;
    mimeType: string;
    buffer: Buffer;
    durationSeconds?: number;
    width?: number;
    height?: number;
    metadata?: Record<string, any>;
  }): Promise<MediaAsset> {
    const assetId = uuidv4();
    const sanitizedName = input.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileKey = `generated/${input.userId}/${assetId}/${sanitizedName}`;
    const checksumSha256 = crypto.createHash('sha256').update(input.buffer).digest('hex');

    await storageService.putObject(fileKey, input.buffer, input.mimeType, checksumSha256);
    const downloadUrl = await storageService.getDownloadPresignedUrl(fileKey);

    const now = new Date().toISOString();
    const asset: MediaAsset = {
      id: assetId,
      userId: input.userId,
      projectId: input.projectId,
      name: input.name,
      originalFilename: input.name,
      category: input.category,
      fileKey,
      mimeType: input.mimeType,
      fileSizeBytes: input.buffer.length,
      durationSeconds: input.durationSeconds,
      width: input.width,
      height: input.height,
      checksumSha256,
      uploadType: 'direct',
      status: 'READY',
      isFavorite: false,
      retentionDays: 365,
      downloadUrl,
      variants: {
        original: {
          fileKey,
          url: downloadUrl,
          sizeBytes: input.buffer.length,
          mimeType: input.mimeType,
        },
      },
      metadata: {
        ...(input.metadata || {}),
        generated: true,
        generatedAt: now,
      },
      createdAt: now,
      updatedAt: now,
    };

    mockMediaAssets.set(assetId, asset);

    try {
      if (await db.isHealthy()) {
        await db.query(
          `INSERT INTO media_assets (
            id, user_id, project_id, name, original_filename, category, file_key,
            mime_type, file_size_bytes, duration_seconds, width, height,
            checksum_sha256, upload_type, status, retention_days, metadata, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19);`,
          [
            asset.id,
            asset.userId,
            asset.projectId || null,
            asset.name,
            asset.originalFilename,
            asset.category,
            asset.fileKey,
            asset.mimeType,
            asset.fileSizeBytes,
            asset.durationSeconds || null,
            asset.width || null,
            asset.height || null,
            asset.checksumSha256 || null,
            asset.uploadType,
            asset.status,
            asset.retentionDays,
            JSON.stringify(asset.metadata),
            asset.createdAt,
            asset.updatedAt,
          ]
        );
      }
    } catch (err) {
      logger.warn({ err, assetId }, 'Failed to persist generated media asset to database, cached in-memory');
    }

    logger.info({ assetId, category: input.category, name: input.name }, 'Created generated media asset');
    return asset;
  }
}

export const mediaService = new MediaService();
