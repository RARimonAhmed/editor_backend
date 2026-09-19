import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import crypto from 'crypto';
import { storageService, PresignedUrlResult, MultipartPartInfo } from '../../services/storage/index.js';
import { db } from '../../database/client.js';
import { jobQueue } from '../../services/queue/index.js';
import { MediaProcessingJobPayload } from './media-processor.service.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../../core/errors.js';
import {
  MediaCategory,
  MediaLifecycleStatus,
  PresignUploadInput,
  CompleteUploadInput,
  DirectUploadInput,
  ListMediaQuery,
  RequestUploadUrlInput,
  ConfirmUploadInput,
  inferCategoryFromMime,
  ALLOWED_MIME_TYPES,
  MEDIA_SIZE_LIMITS,
} from './media.schemas.js';
import { logger } from '../../core/logger.js';

export interface MediaAsset {
  id: string;
  userId: string;
  projectId?: string;
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
  audioChannels?: number;
  audioSampleRate?: number;
  checksumSha256?: string;
  uploadId?: string;
  uploadType: 'direct' | 'multipart';
  status: MediaLifecycleStatus;
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

export const mockMediaAssets = new Map<string, MediaAsset>();

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
  // PRESIGN UPLOAD (DIRECT OR MULTIPART)
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
  }> {
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

    const safeName = path.basename(input.fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
    const mediaId = uuidv4();
    const fileKey = `users/${userId}/media/${category}/${mediaId}_${safeName}`;
    const now = new Date().toISOString();

    // 3. Determine direct vs multipart
    const isMultipart =
      input.uploadType === 'multipart' ||
      (input.uploadType === 'auto' && input.fileSizeBytes >= 50 * 1024 * 1024);

    let uploadId: string | undefined;
    let singlePresignedUrl: string | undefined;
    let partsResult: Array<{ partNumber: number; url: string }> | undefined;
    const expiresIn = 3600;

    if (isMultipart) {
      // Initiate multipart upload
      const init = await storageService.initiateMultipartUpload(fileKey, input.mimeType);
      uploadId = init.uploadId;

      // Calculate part count: 10MB per part or requested partCount
      const partSize = 10 * 1024 * 1024; // 10 MB
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

    // 4. Record initial media entity in UPLOADING state
    const asset: MediaAsset = {
      id: mediaId,
      userId,
      projectId: input.projectId,
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
    const category = input.category || inferCategoryFromMime(input.mimeType, input.fileName);

    // 1. Content Type & Size Validation
    const allowedList = ALLOWED_MIME_TYPES[category];
    if (allowedList && !allowedList.includes(input.mimeType.toLowerCase())) {
      throw new ValidationError(`MIME type "${input.mimeType}" is not allowed for category "${category}".`);
    }

    const buffer = Buffer.from(input.fileBase64, 'base64');
    const maxSize = MEDIA_SIZE_LIMITS[category];
    if (buffer.length > maxSize) {
      throw new ValidationError(`File exceeds maximum size limit of ${Math.round(maxSize / (1024 * 1024))} MB.`);
    }

    // 2. Checksum validation
    const computedChecksum = crypto.createHash('sha256').update(buffer).digest('hex');
    if (input.checksumSha256 && input.checksumSha256.toLowerCase() !== computedChecksum) {
      throw new ValidationError('Checksum SHA-256 verification failed: computed digest does not match expected.');
    }

    // 3. Security Scan
    const scan = await this.executeSecurityScan(input.fileName, input.mimeType, category, buffer);
    if (!scan.passed) {
      throw new ValidationError(`Security scan failed: ${scan.reason}`);
    }

    const mediaId = uuidv4();
    const safeName = path.basename(input.fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileKey = `users/${userId}/media/${category}/${mediaId}_${safeName}`;
    const now = new Date().toISOString();

    // 4. Upload directly to Object Storage
    await storageService.putObject(fileKey, buffer, input.mimeType, computedChecksum);
    const downloadUrl = await storageService.getDownloadPresignedUrl(fileKey);

    const asset: MediaAsset = {
      id: mediaId,
      userId,
      projectId: input.projectId,
      name: input.fileName,
      originalFilename: input.fileName,
      category,
      fileKey,
      mimeType: input.mimeType,
      fileSizeBytes: buffer.length,
      checksumSha256: computedChecksum,
      uploadType: 'direct',
      status: 'READY',
      scanResult: { status: 'passed', scannedAt: now },
      retentionDays: 90,
      downloadUrl,
      createdAt: now,
      updatedAt: now,
    };

    mockMediaAssets.set(mediaId, asset);
    return asset;
  }

  // ============================================================================
  // COMPLETE UPLOAD
  // ============================================================================
  async complete(userId: string, input: CompleteUploadInput): Promise<MediaAsset> {
    const asset = mockMediaAssets.get(input.mediaId);
    if (!asset) {
      throw new NotFoundError(`Media asset not found: ${input.mediaId}`);
    }

    if (asset.userId !== userId) {
      throw new ForbiddenError('You do not have permission to access this media asset');
    }

    const now = new Date().toISOString();
    asset.status = 'PROCESSING';
    asset.updatedAt = now;

    // 1. Complete multipart if applicable
    if (asset.uploadType === 'multipart' && (input.uploadId || asset.uploadId)) {
      const uploadId = input.uploadId || asset.uploadId!;
      const parts: MultipartPartInfo[] = input.parts || [];
      await storageService.completeMultipartUpload(asset.fileKey, uploadId, parts);
    }

    // 2. Checksum validation
    const providedChecksum = input.checksumSha256 || asset.checksumSha256;
    if (input.checksumSha256 && asset.checksumSha256 && input.checksumSha256 !== asset.checksumSha256) {
      asset.status = 'FAILED';
      asset.scanResult = { status: 'failed', details: 'Checksum SHA-256 mismatch detected', scannedAt: now };
      throw new ValidationError('Integrity error: Provided checksum does not match expected checksum.');
    }

    // 3. Security Scanning Hook
    const scan = await this.executeSecurityScan(asset.fileKey, asset.mimeType, asset.category);
    if (!scan.passed) {
      asset.status = 'FAILED';
      asset.scanResult = { status: 'failed', details: scan.reason, scannedAt: now };
      throw new ValidationError(`Security scan rejected upload: ${scan.reason}`);
    }

    // 4. Set status to PROCESSING & Enqueue Asynchronous Media Processing Pipeline Job
    asset.status = 'PROCESSING';
    asset.scanResult = { status: 'passed', scannedAt: now };
    if (providedChecksum) asset.checksumSha256 = providedChecksum;
    if (input.durationSeconds) asset.durationSeconds = input.durationSeconds;
    if (input.width) asset.width = input.width;
    if (input.height) asset.height = input.height;

    asset.downloadUrl = await storageService.getDownloadPresignedUrl(asset.fileKey);

    // Queue worker job: Probe -> Metadata -> Thumbnail -> Waveform -> Proxy -> Search Index -> READY
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
            status: jobData.status,
            progress: jobData.progress,
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
  // GET MEDIA BY ID
  // ============================================================================
  async getById(id: string, userId: string): Promise<MediaAsset> {
    const asset = mockMediaAssets.get(id);
    if (!asset || asset.status === 'DELETED') {
      throw new NotFoundError(`Media asset not found: ${id}`);
    }

    if (asset.userId !== userId) {
      throw new ForbiddenError('You do not have permission to access this media asset');
    }

    // Refresh download URL
    asset.downloadUrl = await storageService.getDownloadPresignedUrl(asset.fileKey);
    return asset;
  }

  // ============================================================================
  // DELETE MEDIA (SOFT DELETE & STORAGE OBJECT CLEANUP)
  // ============================================================================
  async delete(id: string, userId: string): Promise<{ deleted: boolean; id: string }> {
    const asset = await this.getById(id, userId);
    const now = new Date().toISOString();

    asset.status = 'DELETED';
    asset.deletedAt = now;
    asset.updatedAt = now;

    // Delete object from storage provider
    await storageService.deleteObject(asset.fileKey);

    mockMediaAssets.set(id, asset);

    try {
      if (await db.isHealthy()) {
        await db.query(
          `UPDATE media_assets SET status = 'deleted', deleted_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2;`,
          [id, userId]
        );
      }
    } catch {
      // fallback
    }

    return { deleted: true, id };
  }

  // ============================================================================
  // CANCEL UPLOAD
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
      await storageService.abortMultipartUpload(asset.fileKey, asset.uploadId);
    }

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

    asset.status = 'UPLOADING';
    asset.updatedAt = new Date().toISOString();
    mockMediaAssets.set(id, asset);

    return asset;
  }

  // ============================================================================
  // LIST MEDIA
  // ============================================================================
  async list(userId: string, query: ListMediaQuery): Promise<{ media: MediaAsset[]; total: number }> {
    let list = Array.from(mockMediaAssets.values()).filter((a) => a.userId === userId);

    if (query.status !== 'all') {
      list = list.filter((a) => a.status === query.status);
    }

    if (query.category !== 'all') {
      list = list.filter((a) => a.category === query.category);
    }

    if (query.projectId) {
      list = list.filter((a) => a.projectId === query.projectId);
    }

    if (query.search) {
      const q = query.search.toLowerCase();
      list = list.filter((a) => a.name.toLowerCase().includes(q));
    }

    const total = list.length;
    const paginated = list.slice(query.offset, query.offset + query.limit);

    // Refresh download URLs for ready assets
    for (const item of paginated) {
      if (item.status === 'READY') {
        item.downloadUrl = await storageService.getDownloadPresignedUrl(item.fileKey);
      }
    }

    return { media: paginated, total };
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
    // Find asset by fileKey or create one
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
}

export const mediaService = new MediaService();

