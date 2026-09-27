import { v4 as uuidv4 } from 'uuid';
import { db } from '../../database/client.js';
import { storageService } from '../../services/storage/index.js';
import { env } from '../../config/env.js';
import { logger } from '../../core/logger.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../../core/errors.js';
import {
  CreativeAsset,
  CreateAssetInput,
  UpdateAssetInput,
  ListAssetsQuery,
  AssetStatus,
  AssetVersionRecord,
  CreativeAssetType,
  MotionGraphicsFormat,
} from './asset.types.js';
import { assetValidatorService } from './asset-validator.service.js';

export const mockCreativeAssets = new Map<string, CreativeAsset>();

export class AssetService {
  /**
   * Resolve CDN URL for an asset
   */
  public async getCdnUrl(
    storageKey: string,
    options?: { signed?: boolean; expiresIn?: number; filename?: string }
  ): Promise<string> {
    if (options?.signed) {
      return storageService.getDownloadPresignedUrl(
        storageKey,
        options.expiresIn || 3600,
        options.filename
      );
    }
    const prefix = env.STORAGE_PUBLIC_URL_PREFIX.replace(/\/+$/, '');
    return `${prefix}/${storageKey}`;
  }

  /**
   * Upload & Ingest Creative / Motion Graphics Asset
   * Pipeline: Upload -> Validate -> Metadata -> Thumbnail -> Preview -> Version -> Publish
   */
  public async ingestAsset(
    userId: string,
    input: {
      type: CreativeAssetType;
      category: string;
      name: string;
      tags?: string[];
      buffer: Buffer;
      mimeType: string;
      format?: string;
      filename: string;
      licenseMetadata?: any;
      compatibility?: any;
      aspectRatios?: string[];
      supportedPlatforms?: string[];
      status?: AssetStatus;
      isFeatured?: boolean;
    }
  ): Promise<CreativeAsset> {
    const { type, category, name, buffer, mimeType, filename } = input;
    const format = (input.format || filename.split('.').pop() || '').toLowerCase();

    logger.info({ userId, type, category, filename, size: buffer.length }, 'Ingesting creative asset into library');

    // 1. Validate based on asset type & format
    let metadata: Record<string, any> = {
      filename,
      mimeType,
      format,
      fileSizeBytes: buffer.length,
    };

    if (type === 'motion_graphics' || type === 'sticker' || type === 'overlay') {
      if (format === 'svg' || mimeType.includes('svg')) {
        const res = assetValidatorService.validateSvg(buffer);
        metadata = {
          ...metadata,
          format: 'svg',
          dimensions: res.dimensions,
          width: res.dimensions?.width,
          height: res.dimensions?.height,
          vector: true,
        };
      } else if (format === 'json' || mimeType.includes('json')) {
        const res = assetValidatorService.validateLottie(buffer);
        metadata = {
          ...metadata,
          format: 'lottie',
          dimensions: res.dimensions,
          width: res.dimensions?.width,
          height: res.dimensions?.height,
          durationSeconds: res.durationSeconds,
          fps: res.fps,
          layerCount: res.layerCount,
          animation: true,
        };
      } else if (['png', 'webp', 'jpeg', 'jpg'].includes(format)) {
        const res = assetValidatorService.validateRaster(buffer, format as any);
        metadata = {
          ...metadata,
          dimensions: res.dimensions,
          width: res.dimensions?.width,
          height: res.dimensions?.height,
        };
      } else {
        throw new ValidationError(`Unsupported motion graphics format: ${format}`);
      }
    } else if (type === 'lut') {
      const res = assetValidatorService.validateLut(buffer);
      metadata = { ...metadata, lutSize: res.size };
    } else if (type === 'font') {
      const res = assetValidatorService.validateFont(buffer, format);
      metadata = { ...metadata, fontFormat: res.format };
    }

    const checksumSha256 = assetValidatorService.calculateSha256(buffer);
    metadata.checksumSha256 = checksumSha256;

    // 2. Upload to StorageService
    const assetId = uuidv4();
    const finalKey = `assets/${type}/${category}/${assetId}_v1_${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    await storageService.putObject(finalKey, buffer, mimeType, checksumSha256);

    // 3. Thumbnail & Preview generation / assignment
    const cdnUrl = await this.getCdnUrl(finalKey);
    const thumbnail = {
      storageKey: finalKey,
      url: cdnUrl,
      width: metadata.dimensions?.width || 800,
      height: metadata.dimensions?.height || 600,
    };
    const preview = {
      storageKey: finalKey,
      url: cdnUrl,
      durationSeconds: metadata.durationSeconds || 0,
      mimeType,
    };

    // 4. Initial version record
    const versionRecord: AssetVersionRecord = {
      version: 1,
      storageKey: finalKey,
      fileSizeBytes: buffer.length,
      checksumSha256,
      changeLog: 'Initial release',
      createdAt: new Date().toISOString(),
      metadata,
    };

    const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${assetId.slice(0, 8)}`;
    const now = new Date().toISOString();

    const asset: CreativeAsset = {
      id: assetId,
      version: 1,
      type,
      category,
      name,
      slug,
      tags: input.tags || [],
      thumbnail,
      preview,
      storageKey: finalKey,
      cdnUrl,
      licenseMetadata: {
        type: input.licenseMetadata?.type || 'commercial',
        commercialUse: input.licenseMetadata?.commercialUse !== false,
        attributionRequired: input.licenseMetadata?.attributionRequired || false,
        licenseUrl: input.licenseMetadata?.licenseUrl,
        authorName: input.licenseMetadata?.authorName,
      },
      compatibility: {
        minEditorVersion: input.compatibility?.minEditorVersion || '1.0.0',
        maxEditorVersion: input.compatibility?.maxEditorVersion,
        minRendererVersion: input.compatibility?.minRendererVersion || '1.0.0',
        requiredFeatures: input.compatibility?.requiredFeatures || [],
      },
      aspectRatios: input.aspectRatios || ['all'],
      supportedPlatforms: input.supportedPlatforms || ['all'],
      status: input.status || 'published',
      isFeatured: input.isFeatured || false,
      createdBy: userId,
      metadata,
      versionHistory: [versionRecord],
      createdAt: now,
      updatedAt: now,
    };

    mockCreativeAssets.set(assetId, asset);

    // Persist to DB if healthy
    try {
      if (await db.isHealthy()) {
        await db.query(
          `INSERT INTO creative_assets (
            id, version, type, category, name, slug, tags, thumbnail, preview,
            storage_key, cdn_url, license_metadata, compatibility, aspect_ratios,
            supported_platforms, status, is_featured, created_by, metadata, version_history,
            created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22);`,
          [
            asset.id,
            asset.version,
            asset.type,
            asset.category,
            asset.name,
            asset.slug,
            asset.tags,
            JSON.stringify(asset.thumbnail),
            JSON.stringify(asset.preview),
            asset.storageKey,
            asset.cdnUrl,
            JSON.stringify(asset.licenseMetadata),
            JSON.stringify(asset.compatibility),
            asset.aspectRatios,
            asset.supportedPlatforms,
            asset.status,
            asset.isFeatured,
            asset.createdBy,
            JSON.stringify(asset.metadata),
            JSON.stringify(asset.versionHistory),
            asset.createdAt,
            asset.updatedAt,
          ]
        );
      }
    } catch (err: any) {
      logger.warn({ err: err.message, assetId }, 'DB insert failed for creative asset, saved in cache');
    }

    return asset;
  }

  /**
   * Add a new version to an existing creative asset
   */
  public async addVersion(
    assetId: string,
    userId: string,
    buffer: Buffer,
    changeLog: string,
    filename: string,
    mimeType: string
  ): Promise<CreativeAsset> {
    const asset = await this.getAssetById(assetId);
    const newVersionNumber = asset.version + 1;
    const checksumSha256 = assetValidatorService.calculateSha256(buffer);

    const newKey = `assets/${asset.type}/${asset.category}/${assetId}_v${newVersionNumber}_${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    await storageService.putObject(newKey, buffer, mimeType, checksumSha256);

    const cdnUrl = await this.getCdnUrl(newKey);
    const now = new Date().toISOString();

    const versionRecord: AssetVersionRecord = {
      version: newVersionNumber,
      storageKey: newKey,
      fileSizeBytes: buffer.length,
      checksumSha256,
      changeLog: changeLog || `Version ${newVersionNumber}`,
      createdAt: now,
      metadata: { filename, mimeType },
    };

    asset.version = newVersionNumber;
    asset.storageKey = newKey;
    asset.cdnUrl = cdnUrl;
    asset.thumbnail.storageKey = newKey;
    asset.thumbnail.url = cdnUrl;
    asset.preview.storageKey = newKey;
    asset.preview.url = cdnUrl;
    asset.versionHistory.push(versionRecord);
    asset.updatedAt = now;

    mockCreativeAssets.set(assetId, asset);

    try {
      if (await db.isHealthy()) {
        await db.query(
          `UPDATE creative_assets
           SET version = $1, storage_key = $2, cdn_url = $3, thumbnail = $4,
               preview = $5, version_history = $6, updated_at = CURRENT_TIMESTAMP
           WHERE id = $7;`,
          [
            asset.version,
            asset.storageKey,
            asset.cdnUrl,
            JSON.stringify(asset.thumbnail),
            JSON.stringify(asset.preview),
            JSON.stringify(asset.versionHistory),
            asset.id,
          ]
        );
      }
    } catch {}

    logger.info({ assetId, version: newVersionNumber }, 'Added new version to creative asset');
    return asset;
  }

  /**
   * Get Asset by ID
   */
  public async getAssetById(id: string): Promise<CreativeAsset> {
    let asset = mockCreativeAssets.get(id);
    if (!asset) {
      try {
        if (await db.isHealthy()) {
          const res = await db.query('SELECT * FROM creative_assets WHERE id = $1 LIMIT 1;', [id]);
          if (res.rows.length > 0) {
            const r = res.rows[0];
            asset = {
              id: r.id,
              version: r.version,
              type: r.type,
              category: r.category,
              name: r.name,
              slug: r.slug,
              tags: r.tags || [],
              thumbnail: typeof r.thumbnail === 'string' ? JSON.parse(r.thumbnail) : r.thumbnail,
              preview: typeof r.preview === 'string' ? JSON.parse(r.preview) : r.preview,
              storageKey: r.storage_key,
              cdnUrl: r.cdn_url,
              licenseMetadata: typeof r.license_metadata === 'string' ? JSON.parse(r.license_metadata) : r.license_metadata,
              compatibility: typeof r.compatibility === 'string' ? JSON.parse(r.compatibility) : r.compatibility,
              aspectRatios: r.aspect_ratios || [],
              supportedPlatforms: r.supported_platforms || [],
              status: r.status,
              isFeatured: r.is_featured,
              createdBy: r.created_by,
              metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata,
              versionHistory: typeof r.version_history === 'string' ? JSON.parse(r.version_history) : r.version_history,
              createdAt: r.created_at?.toISOString?.() || String(r.created_at),
              updatedAt: r.updated_at?.toISOString?.() || String(r.updated_at),
            };
            mockCreativeAssets.set(id, asset);
          }
        }
      } catch {}
    }

    if (!asset || asset.status === 'archived') {
      throw new NotFoundError(`Creative asset not found: ${id}`);
    }

    return asset;
  }

  /**
   * List Assets with Filtering, Search, and Pagination
   */
  public async listAssets(query: ListAssetsQuery): Promise<{ items: CreativeAsset[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const offset = (page - 1) * limit;

    let items = Array.from(mockCreativeAssets.values());

    // Filter by type
    if (query.type) {
      items = items.filter((a) => a.type === query.type);
    }

    // Filter by category
    if (query.category && query.category !== 'all') {
      items = items.filter((a) => a.category.toLowerCase() === query.category!.toLowerCase());
    }

    // Filter by status (default published)
    const targetStatus = query.status || 'published';
    items = items.filter((a) => a.status === targetStatus);

    // Search query
    if (query.search) {
      const q = query.search.toLowerCase();
      items = items.filter(
        (a) => a.name.toLowerCase().includes(q) || a.tags.some((t) => t.toLowerCase().includes(q))
      );
    }

    // Filter by tags
    if (query.tags && query.tags.length > 0) {
      items = items.filter((a) => query.tags!.some((t) => a.tags.includes(t)));
    }

    // Filter by platform compatibility
    if (query.platform) {
      items = items.filter(
        (a) =>
          a.supportedPlatforms.includes('all') ||
          a.supportedPlatforms.map((p) => p.toLowerCase()).includes(query.platform!.toLowerCase())
      );
    }

    // Filter by aspect ratio
    if (query.aspectRatio) {
      items = items.filter(
        (a) => a.aspectRatios.includes('all') || a.aspectRatios.includes(query.aspectRatio!)
      );
    }

    // Filter by featured
    if (query.isFeatured !== undefined) {
      items = items.filter((a) => a.isFeatured === query.isFeatured);
    }

    // Sort
    if (query.sort === 'name') {
      items.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    const total = items.length;
    const paginated = items.slice(offset, offset + limit);

    return { items: paginated, total, page, limit };
  }

  /**
   * Admin: Update Asset Status (publish, disable, archive)
   */
  public async updateAssetStatus(id: string, status: AssetStatus): Promise<CreativeAsset> {
    const asset = await this.getAssetById(id);
    asset.status = status;
    asset.updatedAt = new Date().toISOString();
    mockCreativeAssets.set(id, asset);

    try {
      if (await db.isHealthy()) {
        await db.query('UPDATE creative_assets SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2;', [
          status,
          id,
        ]);
      }
    } catch {}

    logger.info({ id, status }, 'Admin updated asset status');
    return asset;
  }

  /**
   * Admin: Update Asset Metadata / Category / Featured / Tags
   */
  public async updateAsset(id: string, input: UpdateAssetInput): Promise<CreativeAsset> {
    const asset = await this.getAssetById(id);

    if (input.name) asset.name = input.name;
    if (input.category) asset.category = input.category;
    if (input.tags) asset.tags = input.tags;
    if (input.status) asset.status = input.status;
    if (input.isFeatured !== undefined) asset.isFeatured = input.isFeatured;
    if (input.aspectRatios) asset.aspectRatios = input.aspectRatios;
    if (input.supportedPlatforms) asset.supportedPlatforms = input.supportedPlatforms;
    if (input.licenseMetadata) asset.licenseMetadata = { ...asset.licenseMetadata, ...input.licenseMetadata };
    if (input.compatibility) asset.compatibility = { ...asset.compatibility, ...input.compatibility };
    if (input.metadata) asset.metadata = { ...asset.metadata, ...input.metadata };

    asset.updatedAt = new Date().toISOString();
    mockCreativeAssets.set(id, asset);

    try {
      if (await db.isHealthy()) {
        await db.query(
          `UPDATE creative_assets
           SET name = $1, category = $2, tags = $3, status = $4, is_featured = $5,
               license_metadata = $6, compatibility = $7, metadata = $8, updated_at = CURRENT_TIMESTAMP
           WHERE id = $9;`,
          [
            asset.name,
            asset.category,
            asset.tags,
            asset.status,
            asset.isFeatured,
            JSON.stringify(asset.licenseMetadata),
            JSON.stringify(asset.compatibility),
            JSON.stringify(asset.metadata),
            id,
          ]
        );
      }
    } catch {}

    return asset;
  }

  /**
   * Admin: Remove (Archive) Asset
   */
  public async removeAsset(id: string): Promise<boolean> {
    const asset = await this.getAssetById(id);
    asset.status = 'archived';
    asset.updatedAt = new Date().toISOString();
    mockCreativeAssets.set(id, asset);

    try {
      if (await db.isHealthy()) {
        await db.query('UPDATE creative_assets SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2;', [
          'archived',
          id,
        ]);
      }
    } catch {}

    logger.info({ id }, 'Admin removed/archived asset');
    return true;
  }
}

export const assetService = new AssetService();
