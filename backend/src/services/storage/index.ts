import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  HeadObjectCommand,
  HeadBucketCommand,
  CopyObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  ListMultipartUploadsCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';
import { env } from '../../config/env.js';
import { logger } from '../../core/logger.js';

export interface PresignedUrlResult {
  url: string;
  fileKey: string;
  expiresInSeconds: number;
}

export interface MultipartPartInfo {
  partNumber: number;
  eTag: string;
}

export interface ObjectMetadataResult {
  contentLength: number;
  contentType?: string;
  eTag?: string;
  lastModified?: Date;
}

export interface StorageHealthResult {
  healthy: boolean;
  driver: 's3' | 'mock';
  bucket: string;
  latencyMs: number;
  error?: string;
}

export interface FinalizeUploadResult {
  finalKey: string;
  contentLength: number;
  contentType?: string;
  eTag?: string;
}

export interface StorageCleanupResult {
  deletedCount: number;
  errors: string[];
}

export const ALLOWED_STORAGE_MIME_TYPES = new Set([
  // Video
  'video/mp4',
  'video/quicktime',
  'video/x-matroska',
  'video/webm',
  'video/x-msvideo',
  'video/mpeg',
  // Audio
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/aac',
  'audio/ogg',
  'audio/flac',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  // Images
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  // Project data & subtitles
  'application/json',
  'application/octet-stream',
  'text/plain',
  'text/vtt',
  'application/x-subrip',
]);

export interface IStorageService {
  getUploadPresignedUrl(
    key: string,
    contentType: string,
    checksumSha256?: string,
    expiresIn?: number
  ): Promise<PresignedUrlResult>;
  getDownloadPresignedUrl(key: string, expiresIn?: number, filename?: string): Promise<string>;
  downloadByPresignedUrl(url: string): Promise<Buffer>;
  initiateMultipartUpload(key: string, contentType: string): Promise<{ uploadId: string; fileKey: string }>;
  getMultipartPartPresignedUrl(
    key: string,
    uploadId: string,
    partNumber: number,
    expiresIn?: number
  ): Promise<string>;
  uploadPart(
    key: string,
    uploadId: string,
    partNumber: number,
    buffer: Buffer
  ): Promise<string>;
  completeMultipartUpload(
    key: string,
    uploadId: string,
    parts: MultipartPartInfo[]
  ): Promise<{ location?: string; eTag?: string }>;
  abortMultipartUpload(key: string, uploadId: string): Promise<void>;
  putObject(
    key: string,
    buffer: Buffer,
    contentType: string,
    checksumSha256?: string
  ): Promise<{ eTag?: string }>;
  getObject(key: string): Promise<Buffer>;
  deleteObject(key: string): Promise<void>;
  headObject(key: string): Promise<ObjectMetadataResult | null>;
  validateContentType(contentType: string): boolean;
  validateObjectSize(sizeInBytes: number): boolean;
  getTempKey(userId: string, filename: string): string;
  getFinalKey(userId: string, assetType: string, filename: string): string;
  finalizeUpload(
    tempKey: string,
    finalKey: string,
    expectedContentType?: string
  ): Promise<FinalizeUploadResult>;
  cleanupTempObjects(olderThanHours?: number): Promise<StorageCleanupResult>;
  abortExpiredMultipartUploads(olderThanHours?: number): Promise<{ abortedCount: number; errors: string[] }>;
  isHealthy(): Promise<boolean>;
  getHealthDetails(): Promise<StorageHealthResult>;
}

export class S3StorageService implements IStorageService {
  private client: S3Client;
  private bucket: string;

  constructor() {
    this.bucket = env.STORAGE_BUCKET;
    this.client = new S3Client({
      region: env.STORAGE_REGION,
      endpoint: env.STORAGE_ENDPOINT,
      forcePathStyle: env.STORAGE_FORCE_PATH_STYLE,
      credentials: {
        accessKeyId: env.STORAGE_ACCESS_KEY,
        secretAccessKey: env.STORAGE_SECRET_KEY,
      },
    });
  }

  validateContentType(contentType: string): boolean {
    const baseType = contentType.split(';')[0].trim().toLowerCase();
    return ALLOWED_STORAGE_MIME_TYPES.has(baseType);
  }

  validateObjectSize(sizeInBytes: number): boolean {
    return sizeInBytes > 0 && sizeInBytes <= env.STORAGE_MAX_UPLOAD_SIZE_BYTES;
  }

  getTempKey(userId: string, filename: string): string {
    const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const nonce = crypto.randomBytes(8).toString('hex');
    const prefix = env.STORAGE_TEMP_PREFIX.endsWith('/') ? env.STORAGE_TEMP_PREFIX : `${env.STORAGE_TEMP_PREFIX}/`;
    return `${prefix}${userId}/${Date.now()}_${nonce}_${sanitized}`;
  }

  getFinalKey(userId: string, assetType: string, filename: string): string {
    const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const nonce = crypto.randomBytes(6).toString('hex');
    const prefix = env.STORAGE_FINAL_PREFIX.endsWith('/') ? env.STORAGE_FINAL_PREFIX : `${env.STORAGE_FINAL_PREFIX}/`;
    return `${prefix}${userId}/${assetType}/${Date.now()}_${nonce}_${sanitized}`;
  }

  async getUploadPresignedUrl(
    key: string,
    contentType: string,
    checksumSha256?: string,
    expiresIn = 3600
  ): Promise<PresignedUrlResult> {
    if (!this.validateContentType(contentType)) {
      throw new Error(`Invalid storage Content-Type: ${contentType}. File type not permitted.`);
    }

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
      ChecksumSHA256: checksumSha256,
    });

    const url = await getSignedUrl(this.client, command, { expiresIn });
    return {
      url,
      fileKey: key,
      expiresInSeconds: expiresIn,
    };
  }

  async getDownloadPresignedUrl(key: string, expiresIn = 3600, filename?: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentDisposition: filename ? `attachment; filename="${filename}"` : undefined,
    });

    return getSignedUrl(this.client, command, { expiresIn });
  }

  async downloadByPresignedUrl(url: string): Promise<Buffer> {
    try {
      const parsed = new URL(url);
      const amzDate = parsed.searchParams.get('X-Amz-Date');
      const amzExpires = parsed.searchParams.get('X-Amz-Expires');
      if (amzDate && amzExpires) {
        const year = parseInt(amzDate.substring(0, 4), 10);
        const month = parseInt(amzDate.substring(4, 6), 10) - 1;
        const day = parseInt(amzDate.substring(6, 8), 10);
        const hour = parseInt(amzDate.substring(9, 11), 10);
        const min = parseInt(amzDate.substring(11, 13), 10);
        const sec = parseInt(amzDate.substring(13, 15), 10);
        const issueTime = Date.UTC(year, month, day, hour, min, sec);
        const expiresMs = parseInt(amzExpires, 10) * 1000;
        if (Date.now() > issueTime + expiresMs) {
          throw new Error('Presigned download URL has expired');
        }
      }
      const res = await fetch(url);
      if (!res.ok) {
        if (res.status === 403 || res.status === 410) {
          throw new Error('Presigned download URL has expired or is invalid');
        }
        throw new Error(`Failed to download from storage: HTTP ${res.status}`);
      }
      const arrayBuf = await res.arrayBuffer();
      return Buffer.from(arrayBuf);
    } catch (err: any) {
      throw new Error(`Storage download error: ${err.message}`);
    }
  }

  async initiateMultipartUpload(key: string, contentType: string): Promise<{ uploadId: string; fileKey: string }> {
    if (!this.validateContentType(contentType)) {
      throw new Error(`Invalid storage Content-Type: ${contentType}. File type not permitted.`);
    }

    const command = new CreateMultipartUploadCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });

    const res = await this.client.send(command);
    if (!res.UploadId) {
      throw new Error(`Failed to initiate multipart upload for ${key}`);
    }

    return {
      uploadId: res.UploadId,
      fileKey: key,
    };
  }

  async getMultipartPartPresignedUrl(
    key: string,
    uploadId: string,
    partNumber: number,
    expiresIn = 3600
  ): Promise<string> {
    const command = new UploadPartCommand({
      Bucket: this.bucket,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
    });

    return getSignedUrl(this.client, command, { expiresIn });
  }

  async uploadPart(
    key: string,
    uploadId: string,
    partNumber: number,
    buffer: Buffer
  ): Promise<string> {
    const command = new UploadPartCommand({
      Bucket: this.bucket,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
      Body: buffer,
    });

    const res = await this.client.send(command);
    return res.ETag || '';
  }

  async completeMultipartUpload(
    key: string,
    uploadId: string,
    parts: MultipartPartInfo[]
  ): Promise<{ location?: string; eTag?: string }> {
    const sortedParts = [...parts].sort((a, b) => a.partNumber - b.partNumber);
    const command = new CompleteMultipartUploadCommand({
      Bucket: this.bucket,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: sortedParts.map((p) => ({
          PartNumber: p.partNumber,
          ETag: p.eTag,
        })),
      },
    });

    const res = await this.client.send(command);
    return {
      location: res.Location,
      eTag: res.ETag,
    };
  }

  async abortMultipartUpload(key: string, uploadId: string): Promise<void> {
    const command = new AbortMultipartUploadCommand({
      Bucket: this.bucket,
      Key: key,
      UploadId: uploadId,
    });
    await this.client.send(command);
  }

  async putObject(
    key: string,
    buffer: Buffer,
    contentType: string,
    checksumSha256?: string
  ): Promise<{ eTag?: string }> {
    if (!this.validateContentType(contentType)) {
      throw new Error(`Invalid storage Content-Type: ${contentType}. File type not permitted.`);
    }
    if (!this.validateObjectSize(buffer.length)) {
      throw new Error(`Buffer size (${buffer.length} bytes) exceeds maximum permitted limit (${env.STORAGE_MAX_UPLOAD_SIZE_BYTES} bytes).`);
    }

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ChecksumSHA256: checksumSha256,
    });

    const res = await this.client.send(command);
    return { eTag: res.ETag };
  }

  async getObject(key: string): Promise<Buffer> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    const res = await this.client.send(command);
    if (!res.Body) {
      throw new Error(`Object ${key} has no body in S3 storage`);
    }
    const bytes = await res.Body.transformToByteArray();
    return Buffer.from(bytes);
  }

  async deleteObject(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    await this.client.send(command);
  }

  async headObject(key: string): Promise<ObjectMetadataResult | null> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });
      const res = await this.client.send(command);
      return {
        contentLength: res.ContentLength || 0,
        contentType: res.ContentType,
        eTag: res.ETag,
        lastModified: res.LastModified,
      };
    } catch {
      return null;
    }
  }

  async finalizeUpload(
    tempKey: string,
    finalKey: string,
    expectedContentType?: string
  ): Promise<FinalizeUploadResult> {
    const head = await this.headObject(tempKey);
    if (!head) {
      throw new Error(`Cannot finalize upload: source object does not exist at ${tempKey}`);
    }

    if (!this.validateObjectSize(head.contentLength)) {
      throw new Error(`Cannot finalize upload: file size ${head.contentLength} bytes exceeds limit ${env.STORAGE_MAX_UPLOAD_SIZE_BYTES} bytes`);
    }

    const contentType = expectedContentType || head.contentType || 'application/octet-stream';
    if (!this.validateContentType(contentType)) {
      throw new Error(`Cannot finalize upload: invalid content type ${contentType}`);
    }

    // Atomic S3 copy from temp to final
    const copyCommand = new CopyObjectCommand({
      Bucket: this.bucket,
      CopySource: `${this.bucket}/${tempKey}`,
      Key: finalKey,
      ContentType: contentType,
      MetadataDirective: 'COPY',
    });
    const copyRes = await this.client.send(copyCommand);

    // Remove staging temp object
    await this.deleteObject(tempKey);

    logger.info({ tempKey, finalKey, size: head.contentLength }, 'Finalized upload from temp to final destination');

    return {
      finalKey,
      contentLength: head.contentLength,
      contentType,
      eTag: copyRes.CopyObjectResult?.ETag || head.eTag,
    };
  }

  async cleanupTempObjects(olderThanHours = 24): Promise<StorageCleanupResult> {
    const errors: string[] = [];
    let deletedCount = 0;
    const thresholdMs = Date.now() - olderThanHours * 60 * 60 * 1000;
    const prefix = env.STORAGE_TEMP_PREFIX.endsWith('/') ? env.STORAGE_TEMP_PREFIX : `${env.STORAGE_TEMP_PREFIX}/`;

    try {
      let continuationToken: string | undefined = undefined;
      do {
        const listCmd = new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        });
        const listRes: any = await this.client.send(listCmd);

        const expiredKeys = (listRes.Contents || [])
          .filter((item: any) => item.Key && item.LastModified && item.LastModified.getTime() < thresholdMs)
          .map((item: any) => ({ Key: item.Key! }));

        if (expiredKeys.length > 0) {
          const deleteCmd = new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: { Objects: expiredKeys, Quiet: true },
          });
          const delRes: any = await this.client.send(deleteCmd);
          deletedCount += expiredKeys.length - (delRes.Errors?.length || 0);

          if (delRes.Errors && delRes.Errors.length > 0) {
            for (const err of delRes.Errors) {
              errors.push(`Failed to delete ${err.Key}: ${err.Message}`);
            }
          }
        }

        continuationToken = listRes.NextContinuationToken;
      } while (continuationToken);

      logger.info({ deletedCount, olderThanHours }, 'Completed temp objects cleanup');
    } catch (err: any) {
      errors.push(`Temp cleanup error: ${err.message}`);
      logger.error({ err }, 'Error during storage temp objects cleanup');
    }

    return { deletedCount, errors };
  }

  async abortExpiredMultipartUploads(olderThanHours = 24): Promise<{ abortedCount: number; errors: string[] }> {
    const errors: string[] = [];
    let abortedCount = 0;
    const thresholdMs = Date.now() - olderThanHours * 60 * 60 * 1000;

    try {
      const listCmd = new ListMultipartUploadsCommand({
        Bucket: this.bucket,
      });
      const listRes: any = await this.client.send(listCmd);

      const staleUploads = (listRes.Uploads || []).filter(
        (u: any) => u.Key && u.UploadId && u.Initiated && u.Initiated.getTime() < thresholdMs
      );

      for (const upload of staleUploads) {
        try {
          await this.abortMultipartUpload(upload.Key!, upload.UploadId!);
          abortedCount++;
        } catch (abortErr: any) {
          errors.push(`Failed aborting ${upload.Key} (${upload.UploadId}): ${abortErr.message}`);
        }
      }

      logger.info({ abortedCount, olderThanHours }, 'Completed stale multipart uploads cleanup');
    } catch (err: any) {
      errors.push(`Multipart cleanup error: ${err.message}`);
      logger.error({ err }, 'Error during multipart cleanup');
    }

    return { abortedCount, errors };
  }

  async isHealthy(): Promise<boolean> {
    const details = await this.getHealthDetails();
    return details.healthy;
  }

  async getHealthDetails(): Promise<StorageHealthResult> {
    const start = Date.now();
    try {
      const command = new HeadBucketCommand({
        Bucket: this.bucket,
      });
      await this.client.send(command);
      return {
        healthy: true,
        driver: 's3',
        bucket: this.bucket,
        latencyMs: Date.now() - start,
      };
    } catch (err: any) {
      logger.warn({ err: err.message, bucket: this.bucket }, 'S3 storage health check failed');
      return {
        healthy: false,
        driver: 's3',
        bucket: this.bucket,
        latencyMs: Date.now() - start,
        error: err.message,
      };
    }
  }
}

export class MockStorageService implements IStorageService {
  private mockObjects = new Map<string, { buffer: Buffer; contentType: string; checksum?: string; eTag: string; lastModified: Date }>();
  private activeUploads = new Map<
    string,
    { key: string; contentType: string; initiated: Date; parts: Map<number, { buffer: Buffer; eTag: string }> }
  >();

  validateContentType(contentType: string): boolean {
    const baseType = contentType.split(';')[0].trim().toLowerCase();
    return ALLOWED_STORAGE_MIME_TYPES.has(baseType);
  }

  validateObjectSize(sizeInBytes: number): boolean {
    return sizeInBytes > 0 && sizeInBytes <= env.STORAGE_MAX_UPLOAD_SIZE_BYTES;
  }

  getTempKey(userId: string, filename: string): string {
    const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const nonce = crypto.randomBytes(8).toString('hex');
    const prefix = env.STORAGE_TEMP_PREFIX.endsWith('/') ? env.STORAGE_TEMP_PREFIX : `${env.STORAGE_TEMP_PREFIX}/`;
    return `${prefix}${userId}/${Date.now()}_${nonce}_${sanitized}`;
  }

  getFinalKey(userId: string, assetType: string, filename: string): string {
    const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const nonce = crypto.randomBytes(6).toString('hex');
    const prefix = env.STORAGE_FINAL_PREFIX.endsWith('/') ? env.STORAGE_FINAL_PREFIX : `${env.STORAGE_FINAL_PREFIX}/`;
    return `${prefix}${userId}/${assetType}/${Date.now()}_${nonce}_${sanitized}`;
  }

  async getUploadPresignedUrl(
    key: string,
    contentType: string,
    _checksumSha256?: string,
    expiresIn = 3600
  ): Promise<PresignedUrlResult> {
    if (!this.validateContentType(contentType)) {
      throw new Error(`Invalid storage Content-Type: ${contentType}. File type not permitted.`);
    }
    logger.debug({ key }, 'Generating mock upload presigned URL');
    return {
      url: `https://storage.mock.local/${env.STORAGE_BUCKET}/${key}?signed_upload=true&exp=${expiresIn}`,
      fileKey: key,
      expiresInSeconds: expiresIn,
    };
  }

  async getDownloadPresignedUrl(key: string, expiresIn = 3600, filename?: string): Promise<string> {
    const query = filename ? `&filename=${encodeURIComponent(filename)}` : '';
    const expiresAt = Date.now() + expiresIn * 1000;
    return `https://storage.mock.local/${env.STORAGE_BUCKET}/${key}?signed_download=true&expiresAt=${expiresAt}&exp=${expiresIn}${query}`;
  }

  async downloadByPresignedUrl(url: string): Promise<Buffer> {
    const parsed = new URL(url);
    if (!parsed.searchParams.get('signed_download')) {
      throw new Error('Invalid download signature or unauthorized storage access');
    }
    const expiresAt = parsed.searchParams.get('expiresAt');
    if (expiresAt && Date.now() > Number(expiresAt)) {
      throw new Error('Presigned download URL has expired');
    }
    const pathParts = parsed.pathname.split('/').filter(Boolean);
    const key = pathParts.slice(1).join('/');
    return this.getObject(key);
  }

  async initiateMultipartUpload(key: string, contentType: string): Promise<{ uploadId: string; fileKey: string }> {
    if (!this.validateContentType(contentType)) {
      throw new Error(`Invalid storage Content-Type: ${contentType}. File type not permitted.`);
    }
    const uploadId = `mock-upload-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    this.activeUploads.set(uploadId, { key, contentType, initiated: new Date(), parts: new Map() });
    return { uploadId, fileKey: key };
  }

  async getMultipartPartPresignedUrl(
    key: string,
    uploadId: string,
    partNumber: number,
    expiresIn = 3600
  ): Promise<string> {
    return `https://storage.mock.local/${env.STORAGE_BUCKET}/${key}?uploadId=${uploadId}&partNumber=${partNumber}&exp=${expiresIn}`;
  }

  async uploadPart(
    key: string,
    uploadId: string,
    partNumber: number,
    buffer: Buffer
  ): Promise<string> {
    const upload = this.activeUploads.get(uploadId);
    if (!upload) {
      throw new Error(`Multipart upload session not found: ${uploadId}`);
    }
    const eTag = `"${crypto.createHash('md5').update(buffer).digest('hex')}"`;
    upload.parts.set(partNumber, { buffer, eTag });
    return eTag;
  }

  async completeMultipartUpload(
    key: string,
    uploadId: string,
    parts: MultipartPartInfo[]
  ): Promise<{ location?: string; eTag?: string }> {
    const upload = this.activeUploads.get(uploadId);
    const sortedParts = [...parts].sort((a, b) => a.partNumber - b.partNumber);
    let combinedBuffer = Buffer.alloc(0);
    if (upload && upload.parts.size > 0) {
      const buffers: Buffer[] = [];
      for (const p of sortedParts) {
        const stored = upload.parts.get(p.partNumber);
        if (stored) {
          buffers.push(stored.buffer);
        }
      }
      if (buffers.length > 0) {
        combinedBuffer = Buffer.concat(buffers);
      }
    }
    const hash = crypto.createHash('md5').update(combinedBuffer.length > 0 ? combinedBuffer : uploadId).digest('hex');
    const eTag = `"${hash}-${parts.length}"`;
    this.activeUploads.delete(uploadId);
    this.mockObjects.set(key, {
      buffer: combinedBuffer.length > 0 ? combinedBuffer : Buffer.from('mock-multipart-content'),
      contentType: upload?.contentType || 'video/mp4',
      eTag,
      lastModified: new Date(),
    });
    return {
      location: `https://storage.mock.local/${env.STORAGE_BUCKET}/${key}`,
      eTag,
    };
  }

  async abortMultipartUpload(_key: string, uploadId: string): Promise<void> {
    this.activeUploads.delete(uploadId);
  }

  async putObject(
    key: string,
    buffer: Buffer,
    contentType: string,
    checksumSha256?: string
  ): Promise<{ eTag?: string }> {
    if (!this.validateContentType(contentType)) {
      throw new Error(`Invalid storage Content-Type: ${contentType}. File type not permitted.`);
    }
    if (!this.validateObjectSize(buffer.length)) {
      throw new Error(`Buffer size exceeds maximum permitted limit (${env.STORAGE_MAX_UPLOAD_SIZE_BYTES} bytes).`);
    }
    const eTag = `"${crypto.createHash('md5').update(buffer).digest('hex')}"`;
    this.mockObjects.set(key, { buffer, contentType, checksum: checksumSha256, eTag, lastModified: new Date() });
    return { eTag };
  }

  async getObject(key: string): Promise<Buffer> {
    const obj = this.mockObjects.get(key);
    if (!obj) {
      throw new Error(`Object not found in storage: ${key}`);
    }
    return obj.buffer;
  }

  async deleteObject(key: string): Promise<void> {
    this.mockObjects.delete(key);
    logger.debug({ key }, 'Mock deleted object from storage');
  }

  async headObject(key: string): Promise<ObjectMetadataResult | null> {
    const obj = this.mockObjects.get(key);
    if (obj) {
      return {
        contentLength: obj.buffer.length,
        contentType: obj.contentType,
        eTag: obj.eTag,
        lastModified: obj.lastModified,
      };
    }
    return null;
  }

  async finalizeUpload(
    tempKey: string,
    finalKey: string,
    expectedContentType?: string
  ): Promise<FinalizeUploadResult> {
    const obj = this.mockObjects.get(tempKey);
    if (!obj) {
      throw new Error(`Cannot finalize upload: source object does not exist at ${tempKey}`);
    }
    const contentType = expectedContentType || obj.contentType;
    this.mockObjects.set(finalKey, {
      ...obj,
      contentType,
      lastModified: new Date(),
    });
    this.mockObjects.delete(tempKey);
    return {
      finalKey,
      contentLength: obj.buffer.length,
      contentType,
      eTag: obj.eTag,
    };
  }

  async cleanupTempObjects(olderThanHours = 24): Promise<StorageCleanupResult> {
    const threshold = Date.now() - olderThanHours * 60 * 60 * 1000;
    const prefix = env.STORAGE_TEMP_PREFIX;
    let deletedCount = 0;
    for (const [key, obj] of Array.from(this.mockObjects.entries())) {
      if (key.startsWith(prefix) && obj.lastModified.getTime() < threshold) {
        this.mockObjects.delete(key);
        deletedCount++;
      }
    }
    return { deletedCount, errors: [] };
  }

  async abortExpiredMultipartUploads(olderThanHours = 24): Promise<{ abortedCount: number; errors: string[] }> {
    const threshold = Date.now() - olderThanHours * 60 * 60 * 1000;
    let abortedCount = 0;
    for (const [uploadId, upload] of Array.from(this.activeUploads.entries())) {
      if (upload.initiated.getTime() < threshold) {
        this.activeUploads.delete(uploadId);
        abortedCount++;
      }
    }
    return { abortedCount, errors: [] };
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }

  async getHealthDetails(): Promise<StorageHealthResult> {
    return {
      healthy: true,
      driver: 'mock',
      bucket: env.STORAGE_BUCKET,
      latencyMs: 1,
    };
  }
}

export function createStorageService(): IStorageService {
  if (env.NODE_ENV === 'production') {
    if (env.STORAGE_DRIVER !== 's3') {
      const msg = `[StorageService FATAL] Production mode requires real object storage (STORAGE_DRIVER=s3). Mock storage is strictly prohibited in production.`;
      logger.fatal(msg);
      throw new Error(msg);
    }
    if (!env.STORAGE_BUCKET || !env.STORAGE_ACCESS_KEY || !env.STORAGE_SECRET_KEY) {
      const msg = `[StorageService FATAL] Missing required S3 storage credentials or bucket name in production.`;
      logger.fatal(msg);
      throw new Error(msg);
    }
    logger.info({ bucket: env.STORAGE_BUCKET, region: env.STORAGE_REGION }, 'Initialized Production S3 Storage Service');
    return new S3StorageService();
  }

  if (env.STORAGE_DRIVER === 's3' && env.NODE_ENV !== 'test') {
    logger.info('Initialized S3/MinIO Object Storage Service');
    return new S3StorageService();
  }

  if (env.ALLOW_DEV_FALLBACKS || env.NODE_ENV === 'test' || env.NODE_ENV === 'development') {
    logger.info('Initialized Mock Object Storage Service (Local / Dev / Test Mode)');
    return new MockStorageService();
  }

  throw new Error(`[StorageService FATAL] STORAGE_DRIVER '${env.STORAGE_DRIVER}' is invalid and ALLOW_DEV_FALLBACKS is disabled.`);
}

export const storageService = createStorageService();
