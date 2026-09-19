import { v4 as uuidv4 } from 'uuid';
import { db } from '../../database/client.js';
import { storageService } from '../../services/storage/index.js';
import { jobQueue, Job } from '../../services/queue/index.js';
import { mediaProgressHub } from './media-progress.ws.js';
import { mockMediaAssets, MediaAsset } from './media.service.js';
import { logger } from '../../core/logger.js';

export interface MediaProcessingJobPayload {
  jobId: string;
  mediaId: string;
  userId: string;
  projectId?: string;
  fileKey: string;
  mimeType: string;
  category: string;
  fileName: string;
  fileSizeBytes: number;
  initialOverrides?: {
    durationSeconds?: number;
    width?: number;
    height?: number;
    framerate?: number;
  };
}

export interface ProbedMediaTelemetry {
  duration: number;
  resolution: {
    width: number;
    height: number;
    aspectRatio: string;
  };
  fps: number;
  codec: string;
  audioCodec?: string;
  channels?: number;
  sampleRate?: number;
  rotation: number;
  bitrateKbps: number;
  colorInformation?: {
    colorSpace?: string;
    colorPrimaries?: string;
    colorTransfer?: string;
    bitDepth?: number;
  };
  rawExif?: Record<string, any>;
}

export interface GeneratedThumbnails {
  primaryThumbnailUrl: string;
  primaryStorageKey: string;
  width: number;
  height: number;
  strip: Array<{
    timeOffsetSeconds: number;
    thumbnailUrl: string;
    storageKey: string;
    width: number;
    height: number;
  }>;
}

export interface GeneratedWaveform {
  peaks: number[];
  channels: number;
  samplesPerPixel: number;
  storageKey?: string;
  waveformUrl?: string;
}

export interface GeneratedProxy {
  proxyUrl: string;
  storageKey: string;
  resolution: '360p' | '720p' | '1080p';
  codec: string;
  fileSizeBytes: number;
}

export interface SearchIndexMetadata {
  keywords: string[];
  resolutionTag: string;
  framerateTag: string;
  durationBucket: string;
  aspectRatio: string;
  hasAudio: boolean;
  indexedAt: string;
}

export interface PipelineExecutionResult {
  telemetry: ProbedMediaTelemetry;
  thumbnails?: GeneratedThumbnails;
  waveform?: GeneratedWaveform;
  proxy?: GeneratedProxy;
  searchIndex: SearchIndexMetadata;
  completedAt: string;
}

export class MediaProcessorService {
  /**
   * Main Pipeline Coordinator executing all 7 sequential processing stages
   */
  async processMediaJob(job: Job<MediaProcessingJobPayload>): Promise<PipelineExecutionResult> {
    const payload = job.data;
    const { jobId, mediaId, userId, projectId, fileKey, mimeType, category, fileName, fileSizeBytes, initialOverrides } = payload;

    logger.info({ jobId, mediaId, category, fileName }, '▶ Starting asynchronous media processing pipeline');

    // --------------------------------------------------------------------------
    // STAGE 1: PROBE (15%)
    // --------------------------------------------------------------------------
    await this.reportProgress(jobId, mediaId, 15, 'probe', 'Probing media stream technical telemetry...', projectId);
    const telemetry = await this.probeMedia(fileKey, mimeType, category, fileSizeBytes, initialOverrides);
    logger.info({ jobId, mediaId, codec: telemetry.codec, resolution: telemetry.resolution, duration: telemetry.duration }, 'Step 1 complete: Probed media');

    // --------------------------------------------------------------------------
    // STAGE 2: METADATA PERSISTENCE (30%)
    // --------------------------------------------------------------------------
    await this.reportProgress(jobId, mediaId, 30, 'metadata', 'Persisting technical metadata telemetry into catalog...', projectId);
    await this.saveMetadata(mediaId, telemetry);
    logger.info({ jobId, mediaId }, 'Step 2 complete: Metadata cataloged');

    // --------------------------------------------------------------------------
    // STAGE 3: THUMBNAIL & STRIP GENERATION (50%)
    // --------------------------------------------------------------------------
    await this.reportProgress(jobId, mediaId, 50, 'thumbnail', 'Generating cover thumbnail and timeline filmstrip...', projectId);
    const thumbnails = await this.generateThumbnails(userId, mediaId, category, telemetry);
    logger.info({ jobId, mediaId, stripFrames: thumbnails?.strip.length }, 'Step 3 complete: Thumbnails generated');

    // --------------------------------------------------------------------------
    // STAGE 4: AUDIO WAVEFORM EXTRACTION (70%)
    // --------------------------------------------------------------------------
    let waveform: GeneratedWaveform | undefined;
    if (category === 'audio' || (category === 'video' && telemetry.audioCodec)) {
      await this.reportProgress(jobId, mediaId, 70, 'waveform', 'Extracting timeline audio peaks and waveform...', projectId);
      waveform = await this.generateWaveform(userId, mediaId, telemetry);
      logger.info({ jobId, mediaId, peakSamples: waveform.peaks.length }, 'Step 4 complete: Waveform extracted');
    } else {
      await this.reportProgress(jobId, mediaId, 70, 'waveform', 'Skipping waveform (non-audio asset)', projectId);
    }

    // --------------------------------------------------------------------------
    // STAGE 5: PROXY MEDIA GENERATION (85%)
    // --------------------------------------------------------------------------
    let proxy: GeneratedProxy | undefined;
    if (category === 'video') {
      await this.reportProgress(jobId, mediaId, 85, 'proxy', 'Rendering lightweight 720p H.264 timeline edit proxy...', projectId);
      proxy = await this.generateProxy(userId, mediaId, telemetry);
      logger.info({ jobId, mediaId, proxyRes: proxy.resolution }, 'Step 5 complete: Proxy media generated');
    } else {
      await this.reportProgress(jobId, mediaId, 85, 'proxy', 'Skipping proxy (non-video asset)', projectId);
    }

    // --------------------------------------------------------------------------
    // STAGE 6: SEARCH INDEX METADATA (95%)
    // --------------------------------------------------------------------------
    await this.reportProgress(jobId, mediaId, 95, 'search_index', 'Building search index and catalog taxonomy...', projectId);
    const searchIndex = await this.buildSearchIndex(fileName, category, telemetry);
    logger.info({ jobId, mediaId, keywordCount: searchIndex.keywords.length }, 'Step 6 complete: Search index ready');

    // --------------------------------------------------------------------------
    // STAGE 7: TRANSITION TO READY (100%)
    // --------------------------------------------------------------------------
    const now = new Date().toISOString();
    const result: PipelineExecutionResult = {
      telemetry,
      thumbnails,
      waveform,
      proxy,
      searchIndex,
      completedAt: now,
    };

    await this.finalizeMediaAsset(mediaId, result);

    mediaProgressHub.broadcastCompleted({
      jobId,
      mediaId,
      result: result as unknown as Record<string, any>,
      projectId,
    });

    logger.info({ jobId, mediaId }, '✅ Asynchronous media processing pipeline completed successfully -> Status: READY');
    return result;
  }

  // ============================================================================
  // STAGE 1: PROBE MEDIA
  // ============================================================================
  async probeMedia(
    fileKey: string,
    mimeType: string,
    category: string,
    fileSizeBytes: number,
    overrides?: { durationSeconds?: number; width?: number; height?: number; framerate?: number }
  ): Promise<ProbedMediaTelemetry> {
    const isVideo = category === 'video' || mimeType.startsWith('video/');
    const isAudio = category === 'audio' || mimeType.startsWith('audio/');
    const isImage = category === 'image' || mimeType.startsWith('image/');

    if (isVideo) {
      const width = overrides?.width || 1920;
      const height = overrides?.height || 1080;
      const fps = overrides?.framerate || 29.97;
      const duration = overrides?.durationSeconds || (fileSizeBytes > 50000000 ? 125.4 : 32.5);
      const aspect = `${width}:${height}` === '1920:1080' ? '16:9' : `${width}:${height}` === '3840:2160' ? '16:9' : 'Custom';
      const bitrate = Math.round((fileSizeBytes * 8) / (duration * 1000)) || 15000;

      return {
        duration,
        resolution: { width, height, aspectRatio: aspect },
        fps,
        codec: 'h264',
        audioCodec: 'aac',
        channels: 2,
        sampleRate: 48000,
        rotation: 0,
        bitrateKbps: bitrate,
        colorInformation: {
          colorSpace: 'bt709',
          colorPrimaries: 'bt709',
          colorTransfer: 'iec61966-2-1',
          bitDepth: 8,
        },
        rawExif: {
          make: 'TechXayan Studio',
          encoder: 'Lavf60.3.100',
        },
      };
    }

    if (isAudio) {
      const duration = overrides?.durationSeconds || 184.2;
      const bitrate = Math.round((fileSizeBytes * 8) / (duration * 1000)) || 320;
      return {
        duration,
        resolution: { width: 0, height: 0, aspectRatio: 'N/A' },
        fps: 0,
        codec: 'aac',
        audioCodec: 'aac',
        channels: 2,
        sampleRate: 44100,
        rotation: 0,
        bitrateKbps: bitrate,
        rawExif: { audioBitrate: `${bitrate}k` },
      };
    }

    if (isImage) {
      const width = overrides?.width || 1920;
      const height = overrides?.height || 1080;
      return {
        duration: 0,
        resolution: { width, height, aspectRatio: '16:9' },
        fps: 0,
        codec: mimeType.split('/')[1] || 'png',
        rotation: 0,
        bitrateKbps: 0,
        colorInformation: {
          colorSpace: 'srgb',
          bitDepth: 8,
        },
      };
    }

    // Default creative asset (font, LUT, sticker)
    return {
      duration: 0,
      resolution: { width: 0, height: 0, aspectRatio: 'N/A' },
      fps: 0,
      codec: category,
      rotation: 0,
      bitrateKbps: 0,
    };
  }

  // ============================================================================
  // STAGE 2: PERSIST METADATA
  // ============================================================================
  async saveMetadata(mediaId: string, telemetry: ProbedMediaTelemetry) {
    const asset = mockMediaAssets.get(mediaId);
    if (asset) {
      asset.durationSeconds = telemetry.duration;
      asset.width = telemetry.resolution.width;
      asset.height = telemetry.resolution.height;
      asset.framerate = telemetry.fps;
      asset.audioChannels = telemetry.channels;
      asset.audioSampleRate = telemetry.sampleRate;
      asset.metadata = {
        codec: telemetry.codec,
        audioCodec: telemetry.audioCodec,
        bitrateKbps: telemetry.bitrateKbps,
        rotation: telemetry.rotation,
        colorInformation: telemetry.colorInformation,
        rawExif: telemetry.rawExif,
      };
    }

    try {
      if (await db.isHealthy()) {
        await db.query(
          `UPDATE media_assets 
           SET duration_seconds = $1, width = $2, height = $3, framerate = $4, audio_channels = $5, audio_sample_rate = $6, updated_at = CURRENT_TIMESTAMP
           WHERE id = $7;`,
          [
            telemetry.duration,
            telemetry.resolution.width,
            telemetry.resolution.height,
            telemetry.fps,
            telemetry.channels || null,
            telemetry.sampleRate || null,
            mediaId,
          ]
        );

        await db.query(
          `INSERT INTO media_metadata (asset_id, codec_long_name, pixel_format, bit_depth, color_primaries, metadata_raw)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (asset_id) DO UPDATE
           SET codec_long_name = EXCLUDED.codec_long_name,
               pixel_format = EXCLUDED.pixel_format,
               bit_depth = EXCLUDED.bit_depth,
               color_primaries = EXCLUDED.color_primaries,
               metadata_raw = EXCLUDED.metadata_raw,
               updated_at = CURRENT_TIMESTAMP;`,
          [
            mediaId,
            telemetry.codec,
            'yuv420p',
            telemetry.colorInformation?.bitDepth || 8,
            telemetry.colorInformation?.colorPrimaries || 'bt709',
            JSON.stringify(telemetry),
          ]
        );
      }
    } catch {
      // fallback to in-memory
    }
  }

  // ============================================================================
  // STAGE 3: GENERATE THUMBNAIL & FILMSTRIP STRIP
  // ============================================================================
  async generateThumbnails(
    userId: string,
    mediaId: string,
    category: string,
    telemetry: ProbedMediaTelemetry
  ): Promise<GeneratedThumbnails | undefined> {
    if (category !== 'video' && category !== 'image') {
      return undefined;
    }

    const primaryKey = `users/${userId}/media/thumbnails/${mediaId}_cover.jpg`;
    // Generate simulated image buffer
    const mockThumbBuffer = Buffer.from(`THUMBNAIL_${mediaId}_${Date.now()}`);
    await storageService.putObject(primaryKey, mockThumbBuffer, 'image/jpeg');
    const primaryUrl = await storageService.getDownloadPresignedUrl(primaryKey);

    const strip: GeneratedThumbnails['strip'] = [];
    const duration = telemetry.duration || 10;
    const stripFramesCount = 5;

    for (let i = 0; i < stripFramesCount; i++) {
      const timeOffset = Math.round(((duration / stripFramesCount) * i) * 10) / 10;
      const stripKey = `users/${userId}/media/thumbnails/strip/${mediaId}_${i}.jpg`;
      await storageService.putObject(stripKey, Buffer.from(`STRIP_${mediaId}_FRAME_${i}`), 'image/jpeg');
      const stripUrl = await storageService.getDownloadPresignedUrl(stripKey);

      strip.push({
        timeOffsetSeconds: timeOffset,
        thumbnailUrl: stripUrl,
        storageKey: stripKey,
        width: 320,
        height: 180,
      });
    }

    try {
      if (await db.isHealthy()) {
        const thumbStorageObjId = uuidv4();
        await db.query(
          `INSERT INTO storage_objects (id, bucket, key, driver, size_bytes, mime_type, status)
           VALUES ($1, 'techxayan-media', $2, 's3', $3, 'image/jpeg', 'uploaded')
           ON CONFLICT DO NOTHING;`,
          [thumbStorageObjId, primaryKey, mockThumbBuffer.length]
        );

        await db.query(
          `INSERT INTO media_thumbnails (asset_id, storage_object_id, time_offset_seconds, width, height, is_primary)
           VALUES ($1, $2, 0.0, 1280, 720, TRUE);`,
          [mediaId, thumbStorageObjId]
        );
      }
    } catch {
      // fallback
    }

    return {
      primaryThumbnailUrl: primaryUrl,
      primaryStorageKey: primaryKey,
      width: 1280,
      height: 720,
      strip,
    };
  }

  // ============================================================================
  // STAGE 4: GENERATE WAVEFORM
  // ============================================================================
  async generateWaveform(
    userId: string,
    mediaId: string,
    telemetry: ProbedMediaTelemetry
  ): Promise<GeneratedWaveform> {
    // Generate 128 normalized amplitude peak samples (0.00 to 1.00)
    const samplesCount = 128;
    const peaks: number[] = [];
    for (let i = 0; i < samplesCount; i++) {
      // Synthetic audio wave envelope: mix of sine harmonic peaks and dynamic spikes
      const envelope = Math.sin((i / samplesCount) * Math.PI);
      const noise = (Math.sin(i * 13.5) + 1) / 2;
      const peak = Math.min(1.0, Math.max(0.02, Math.round((envelope * 0.7 + noise * 0.3) * 100) / 100));
      peaks.push(peak);
    }

    const waveformKey = `users/${userId}/media/waveforms/${mediaId}_waveform.json`;
    const waveformJson = JSON.stringify({
      peaks,
      channels: telemetry.channels || 2,
      sampleRate: telemetry.sampleRate || 44100,
      samplesPerPixel: 256,
    });

    await storageService.putObject(waveformKey, Buffer.from(waveformJson), 'application/json');
    const waveformUrl = await storageService.getDownloadPresignedUrl(waveformKey);

    try {
      if (await db.isHealthy()) {
        await db.query(
          `INSERT INTO media_waveforms (asset_id, peaks_data, channels, samples_per_pixel)
           VALUES ($1, $2, $3, 256)
           ON CONFLICT (asset_id) DO UPDATE
           SET peaks_data = EXCLUDED.peaks_data,
               channels = EXCLUDED.channels;`,
          [mediaId, JSON.stringify(peaks), telemetry.channels || 2]
        );
      }
    } catch {
      // fallback
    }

    return {
      peaks,
      channels: telemetry.channels || 2,
      samplesPerPixel: 256,
      storageKey: waveformKey,
      waveformUrl,
    };
  }

  // ============================================================================
  // STAGE 5: GENERATE PROXY MEDIA
  // ============================================================================
  async generateProxy(
    userId: string,
    mediaId: string,
    telemetry: ProbedMediaTelemetry
  ): Promise<GeneratedProxy> {
    const proxyKey = `users/${userId}/media/proxies/${mediaId}_720p_proxy.mp4`;
    const mockProxyBuffer = Buffer.from(`PROXY_VIDEO_STREAM_${mediaId}_720P`);
    await storageService.putObject(proxyKey, mockProxyBuffer, 'video/mp4');
    const proxyUrl = await storageService.getDownloadPresignedUrl(proxyKey);

    try {
      if (await db.isHealthy()) {
        const proxyStorageObjId = uuidv4();
        await db.query(
          `INSERT INTO storage_objects (id, bucket, key, driver, size_bytes, mime_type, status)
           VALUES ($1, 'techxayan-media', $2, 's3', $3, 'video/mp4', 'uploaded')
           ON CONFLICT DO NOTHING;`,
          [proxyStorageObjId, proxyKey, mockProxyBuffer.length]
        );

        await db.query(
          `INSERT INTO media_proxies (asset_id, storage_object_id, resolution, codec, status)
           VALUES ($1, $2, '720p', 'h264', 'ready')
           ON CONFLICT (asset_id, resolution) DO UPDATE
           SET status = 'ready', updated_at = CURRENT_TIMESTAMP;`,
          [mediaId, proxyStorageObjId]
        );

        await db.query(
          `INSERT INTO media_variants (asset_id, storage_object_id, variant_type, resolution, bitrate_kbps, codec, file_size_bytes)
           VALUES ($1, $2, 'proxy_low', '720p', 2500, 'h264', $3)
           ON CONFLICT (asset_id, variant_type, resolution) DO NOTHING;`,
          [mediaId, proxyStorageObjId, mockProxyBuffer.length]
        );
      }
    } catch {
      // fallback
    }

    return {
      proxyUrl,
      storageKey: proxyKey,
      resolution: '720p',
      codec: 'h264',
      fileSizeBytes: mockProxyBuffer.length,
    };
  }

  // ============================================================================
  // STAGE 6: BUILD SEARCH INDEX
  // ============================================================================
  async buildSearchIndex(
    fileName: string,
    category: string,
    telemetry: ProbedMediaTelemetry
  ): Promise<SearchIndexMetadata> {
    const keywords = new Set<string>();

    // Add name tokens
    const tokens = fileName.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(Boolean);
    tokens.forEach((t) => keywords.add(t));

    // Category
    keywords.add(category);

    // Resolution tags
    let resolutionTag = 'SD';
    const w = telemetry.resolution.width;
    const h = telemetry.resolution.height;
    if (w >= 3840 || h >= 2160) {
      resolutionTag = '4K';
      keywords.add('4k');
      keywords.add('uhd');
    } else if (w >= 1920 || h >= 1080) {
      resolutionTag = '1080p';
      keywords.add('1080p');
      keywords.add('full-hd');
    } else if (w >= 1280 || h >= 720) {
      resolutionTag = '720p';
      keywords.add('720p');
      keywords.add('hd');
    }

    // Orientation
    if (w > h) keywords.add('landscape');
    else if (h > w) keywords.add('portrait');
    else keywords.add('square');

    // Codecs
    if (telemetry.codec) keywords.add(telemetry.codec.toLowerCase());
    if (telemetry.audioCodec) keywords.add(telemetry.audioCodec.toLowerCase());

    // Framerate
    const framerateTag = telemetry.fps >= 59 ? '60fps' : telemetry.fps >= 29 ? '30fps' : '24fps';
    keywords.add(framerateTag);

    // Duration bucket
    let durationBucket = 'short';
    if (telemetry.duration > 300) {
      durationBucket = 'long';
      keywords.add('long');
    } else if (telemetry.duration > 60) {
      durationBucket = 'medium';
      keywords.add('medium');
    } else {
      keywords.add('short');
    }

    const hasAudio = Boolean(telemetry.audioCodec && (telemetry.channels || 0) > 0);
    if (hasAudio) keywords.add('audio');

    return {
      keywords: Array.from(keywords),
      resolutionTag,
      framerateTag,
      durationBucket,
      aspectRatio: telemetry.resolution.aspectRatio,
      hasAudio,
      indexedAt: new Date().toISOString(),
    };
  }

  // ============================================================================
  // STAGE 7: FINALIZE ASSET STATE TO READY
  // ============================================================================
  async finalizeMediaAsset(mediaId: string, result: PipelineExecutionResult) {
    const asset = mockMediaAssets.get(mediaId);
    if (asset) {
      asset.status = 'READY';
      asset.durationSeconds = result.telemetry.duration;
      asset.width = result.telemetry.resolution.width;
      asset.height = result.telemetry.resolution.height;
      asset.framerate = result.telemetry.fps;
      asset.thumbnailUrl = result.thumbnails?.primaryThumbnailUrl;
      asset.thumbnailStrip = result.thumbnails?.strip;
      asset.waveform = result.waveform;
      asset.proxy = result.proxy;
      asset.searchMetadata = result.searchIndex;
      asset.updatedAt = result.completedAt;
    }

    try {
      if (await db.isHealthy()) {
        await db.query(
          `UPDATE media_assets SET status = 'ready', updated_at = CURRENT_TIMESTAMP WHERE id = $1;`,
          [mediaId]
        );
      }
    } catch {
      // fallback
    }
  }

  private async reportProgress(
    jobId: string,
    mediaId: string,
    progress: number,
    step: string,
    stepDescription: string,
    projectId?: string
  ) {
    await jobQueue.updateProgress(jobId, progress, step, { stepDescription });

    mediaProgressHub.broadcastProgress({
      jobId,
      mediaId,
      status: 'processing',
      step,
      progress,
      details: { stepDescription },
      projectId,
    });
  }
}

export const mediaProcessorService = new MediaProcessorService();
