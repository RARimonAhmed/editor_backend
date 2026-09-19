import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { storageService, PresignedUrlResult } from '../../services/storage/index.js';
import { db } from '../../database/client.js';
import { RequestUploadUrlInput, ConfirmUploadInput } from './media.schemas.js';

export interface MediaAsset {
  id: string;
  userId: string;
  projectId?: string;
  name: string;
  fileKey: string;
  mimeType: string;
  fileSizeBytes: number;
  durationSeconds?: number;
  width?: number;
  height?: number;
  status: 'uploading' | 'processing' | 'ready' | 'failed';
  downloadUrl?: string;
  createdAt: string;
}

const mockMediaAssets = new Map<string, MediaAsset>();

export class MediaService {
  async getUploadUrl(userId: string, input: RequestUploadUrlInput): Promise<PresignedUrlResult> {
    const safeName = path.basename(input.fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
    const uniqueKey = `users/${userId}/assets/${uuidv4()}_${safeName}`;

    const presigned = await storageService.getUploadPresignedUrl(uniqueKey, input.mimeType);
    return presigned;
  }

  async confirmUpload(userId: string, input: ConfirmUploadInput): Promise<MediaAsset> {
    const id = uuidv4();
    const downloadUrl = await storageService.getDownloadPresignedUrl(input.fileKey);

    const asset: MediaAsset = {
      id,
      userId,
      projectId: input.projectId,
      name: input.fileName,
      fileKey: input.fileKey,
      mimeType: input.mimeType,
      fileSizeBytes: input.fileSizeBytes,
      durationSeconds: input.durationSeconds,
      width: input.width,
      height: input.height,
      status: 'ready',
      downloadUrl,
      createdAt: new Date().toISOString(),
    };

    mockMediaAssets.set(id, asset);

    try {
      if (await db.isHealthy()) {
        await db.query(
          `INSERT INTO media_assets (id, user_id, project_id, name, file_key, mime_type, file_size_bytes, duration_seconds, width, height, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11);`,
          [
            asset.id,
            asset.userId,
            asset.projectId || null,
            asset.name,
            asset.fileKey,
            asset.mimeType,
            asset.fileSizeBytes,
            asset.durationSeconds || null,
            asset.width || null,
            asset.height || null,
            asset.status,
          ]
        );
      }
    } catch {
      // fallback
    }

    return asset;
  }

  async listAssets(userId: string, projectId?: string): Promise<MediaAsset[]> {
    let assets = Array.from(mockMediaAssets.values()).filter((a) => a.userId === userId);
    if (projectId) {
      assets = assets.filter((a) => a.projectId === projectId);
    }
    return assets;
  }
}

export const mediaService = new MediaService();
