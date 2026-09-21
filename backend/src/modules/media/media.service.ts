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
  codec?: string;
  container?: string;
  bitrateKbps?: number;
  audioCodec?: string;
  audioChannels?: number;
  audioSampleRate?: number;
  rotation?: number;
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
    const checkResult = mediaValidationService.validateChecksum(buffer, input.checksumSha256);
    if (!checkResult.valid) {
      throw new ValidationError(checkResult.reason || 'Checksum SHA-256 verification failed');
    }
    const computedChecksum = checkResult.computedSha256;

    // 2b. Magic Bytes binary validation
    const magicCheck = mediaValidationService.validateMagicBytes(buffer, category, input.mimeType);
    if (!magicCheck.valid) {
      throw new ValidationError(`Security scan rejected upload: ${magicCheck.reason}`);
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

    // 4. Set status to PROCESSING & Enqueue Asynchronous Media Processing Pipeline Job
    asset.status = 'PROCESSING';
    asset.updatedAt = now;
    asset.scanResult = { status: 'passed', scannedAt: now };
    if (expectedChecksum) asset.checksumSha256 = expectedChecksum;
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

    // Delete object and generated artifacts from storage provider
    try {
      await storageService.deleteObject(asset.fileKey);
      await storageService.deleteObject(`users/${userId}/media/thumbnails/${asset.id}_cover.jpg`);
      await storageService.deleteObject(`users/${userId}/media/waveforms/${asset.id}_waveform.json`);
      await storageService.deleteObject(`users/${userId}/media/proxies/${asset.id}_720p_proxy.mp4`);
    } catch {
      // ignore
    }

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

    // Abort active multipart session
    if (asset.uploadType === 'multipart' && asset.uploadId) {
      try {
        await storageService.abortMultipartUpload(asset.fileKey, asset.uploadId);
      } catch {
        // ignore
      }
    }

    // Cleanup partial or orphaned object from storage
    try {
      await storageService.deleteObject(asset.fileKey);
    } catch {
      // ignore
    }

    // Cancel active queue job and active worker child processes
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

    // 1. Upload binary to object storage
    await storageService.putObject(fileKey, input.buffer, input.mimeType, checksumSha256);

    // 2. Generate download presigned URL
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
      retentionDays: 365,
      downloadUrl,
      metadata: {
        ...(input.metadata || {}),
        generated: true,
        generatedAt: now,
      },
      createdAt: now,
      updatedAt: now,
    };

    mockMediaAssets.set(assetId, asset);

    // Persist to Postgres if healthy
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

