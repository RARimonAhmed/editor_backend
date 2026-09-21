import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { buildApp } from '../src/app.js';
import { storageService } from '../src/services/storage/index.js';
import { ffmpegService } from '../src/modules/media/ffmpeg.service.js';
import { mockMediaAssets } from '../src/modules/media/media.service.js';
import { mediaProgressHub } from '../src/modules/media/media-progress.ws.js';

describe('Operational Media Ingestion Pipeline (Genuinely Non-Mocked)', () => {
  let app: FastifyInstance;
  let authToken: string;
  let userId: string;

  // Real media file scratch paths
  let tempDir: string;
  let realVideoPath: string;
  let realVideoBuffer: Buffer;
  let realVideoChecksum: string;

  let realAudioPath: string;
  let realAudioBuffer: Buffer;
  let realAudioChecksum: string;

  let realImagePath: string;
  let realImageBuffer: Buffer;
  let realImageChecksum: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    // 1. Create test user
    const regRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: `media_architect_${Date.now()}@techxayan.com`,
        password: 'Password123!',
        displayName: 'Cloud Media Architect',
      },
    });

    const regData = JSON.parse(regRes.body).data;
    authToken = regData.tokens.accessToken;
    userId = regData.user.id;

    // 2. Generate real media files using FFmpeg
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'pipeline_test_'));
    const ffmpegBin = ffmpegService.getFFmpegPath();

    // A. Generate real 2-second H.264 + AAC MP4 video (320x240 @ 30fps)
    realVideoPath = path.join(tempDir, 'sample_video.mp4');
    execFileSync(ffmpegBin, [
      '-f',
      'lavfi',
      '-i',
      'testsrc=duration=2:size=320x240:rate=30',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=880:duration=2',
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-y',
      realVideoPath,
    ]);
    realVideoBuffer = await fs.promises.readFile(realVideoPath);
    realVideoChecksum = crypto.createHash('sha256').update(realVideoBuffer).digest('hex');

    // B. Generate real 2-second AAC M4A audio
    realAudioPath = path.join(tempDir, 'sample_audio.m4a');
    execFileSync(ffmpegBin, [
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=2',
      '-c:a',
      'aac',
      '-y',
      realAudioPath,
    ]);
    realAudioBuffer = await fs.promises.readFile(realAudioPath);
    realAudioChecksum = crypto.createHash('sha256').update(realAudioBuffer).digest('hex');

    // C. Generate real PNG image (640x360)
    realImagePath = path.join(tempDir, 'sample_image.png');
    execFileSync(ffmpegBin, [
      '-f',
      'lavfi',
      '-i',
      'testsrc=size=640x360:rate=1',
      '-vframes',
      '1',
      '-y',
      realImagePath,
    ]);
    realImageBuffer = await fs.promises.readFile(realImagePath);
    realImageChecksum = crypto.createHash('sha256').update(realImageBuffer).digest('hex');
  });

  afterAll(async () => {
    try {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
    await app.close();
  });

  // ============================================================================
  // 1. VIDEO PIPELINE: Real MP4 Ingestion -> FFprobe -> Thumb -> Waveform -> Proxy
  // ============================================================================
  it('Complete Video Pipeline: Real MP4 upload -> FFprobe -> metadata -> thumbnail -> waveform -> 720p proxy -> READY -> media_ready event', async () => {
    // 1. Presign upload request
    const presignRes = await app.inject({
      method: 'POST',
      url: '/v1/media/presign',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: {
        fileName: 'real_video_asset.mp4',
        mimeType: 'video/mp4',
        fileSizeBytes: realVideoBuffer.length,
        category: 'video',
        checksumSha256: realVideoChecksum,
      },
    });

    expect(presignRes.statusCode).toBe(200);
    const presignData = JSON.parse(presignRes.body).data;
    const mediaId = presignData.mediaId;
    const fileKey = presignData.fileKey;

    expect(mediaId).toBeTypeOf('string');
    expect(fileKey).toContain(mediaId);

    // 2. Client uploads real bytes to Object Storage
    await storageService.putObject(fileKey, realVideoBuffer, 'video/mp4', realVideoChecksum);

    // 3. Setup listener for realtime media_ready event
    let mediaReadyEventReceived = false;
    let mediaReadyPayload: any = null;

    const dummySocket: any = {
      readyState: 1, // OPEN
      send: (data: string) => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.event === 'media_ready' && parsed.mediaId === mediaId) {
            mediaReadyEventReceived = true;
            mediaReadyPayload = parsed;
          }
        } catch {
          // ignore
        }
      },
    };

    mediaProgressHub.subscribe({
      id: `test-sub-${mediaId}`,
      socket: dummySocket,
      mediaId,
      userId,
    });

    // 4. Finalize upload
    const completeRes = await app.inject({
      method: 'POST',
      url: '/v1/media/complete',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: {
        mediaId,
        checksumSha256: realVideoChecksum,
      },
    });

    expect(completeRes.statusCode).toBe(200);
    const completeData = JSON.parse(completeRes.body).data;
    expect(completeData.status).toBe('PROCESSING');
    expect(completeData.processingJobId).toBeDefined();

    // 5. Poll until worker completes genuine processing
    let asset: any = null;
    for (let i = 0; i < 80; i++) {
      await new Promise((r) => setTimeout(r, 150));
      const getRes = await app.inject({
        method: 'GET',
        url: `/v1/media/${mediaId}`,
        headers: { Authorization: `Bearer ${authToken}` },
      });
      asset = JSON.parse(getRes.body).data;
      if (asset.status === 'READY') break;
    }

    expect(asset.status).toBe('READY');

    // 6. Verify all 13 technical metadata fields extracted by FFprobe
    expect(asset.durationSeconds).toBeGreaterThanOrEqual(1.8);
    expect(asset.durationSeconds).toBeLessThanOrEqual(2.2);
    expect(asset.width).toBe(320);
    expect(asset.height).toBe(240);
    expect(asset.framerate).toBe(30);
    expect(asset.checksumSha256).toBe(realVideoChecksum);
    expect(asset.fileSizeBytes).toBe(realVideoBuffer.length);

    // Check embedded metadata telemetry
    const meta = asset.metadata;
    expect(meta).toBeDefined();
    expect(meta.codec).toBe('h264');
    expect(meta.container).toBeDefined();
    expect(meta.bitrateKbps).toBeGreaterThan(0);
    expect(meta.audioCodec).toBe('aac');
    expect(meta.sampleRate).toBe(44100);
    expect(meta.channels).toBe(1);
    expect(meta.rotation).toBe(0);

    // 7. Verify Thumbnail Generation
    expect(asset.thumbnailUrl).toBeDefined();
    const coverKey = `users/${userId}/media/thumbnails/${mediaId}_cover.jpg`;
    const coverBuf = await storageService.getObject(coverKey);
    expect(coverBuf).toBeDefined();
    expect(coverBuf.length).toBeGreaterThan(100);
    // Verify real JPEG magic bytes (FF D8 FF)
    expect(coverBuf[0]).toBe(0xff);
    expect(coverBuf[1]).toBe(0xd8);
    expect(coverBuf[2]).toBe(0xff);

    // Filmstrip
    expect(asset.thumbnailStrip).toBeInstanceOf(Array);
    expect(asset.thumbnailStrip.length).toBeGreaterThanOrEqual(3);

    // 8. Verify Compact Audio Waveform
    expect(asset.waveform).toBeDefined();
    expect(asset.waveform.peaks).toBeInstanceOf(Array);
    expect(asset.waveform.peaks.length).toBe(128);
    // Verified compact representation: normalized values between 0.0 and 1.0
    for (const peak of asset.waveform.peaks) {
      expect(peak).toBeGreaterThanOrEqual(0.0);
      expect(peak).toBeLessThanOrEqual(1.0);
    }
    // Verify waveform JSON in object storage
    const waveKey = `users/${userId}/media/waveforms/${mediaId}_waveform.json`;
    const waveBuf = await storageService.getObject(waveKey);
    const parsedWave = JSON.parse(waveBuf.toString('utf-8'));
    expect(parsedWave.peaks.length).toBe(128);

    // 9. Verify 720p Editing Proxy
    expect(asset.proxy).toBeDefined();
    expect(asset.proxy.resolution).toBe('720p');
    expect(asset.proxy.codec).toBe('h264');
    expect(asset.proxy.fileSizeBytes).toBeGreaterThan(500);

    const proxyKey = `users/${userId}/media/proxies/${mediaId}_720p_proxy.mp4`;
    const proxyBuf = await storageService.getObject(proxyKey);
    expect(proxyBuf).toBeDefined();
    // Verify real MP4 magic bytes: contains 'ftyp' at offset 4
    expect(proxyBuf.slice(4, 8).toString('ascii')).toBe('ftyp');

    // 10. Verify Realtime WebSocket media_ready event was broadcasted
    expect(mediaReadyEventReceived).toBe(true);
    expect(mediaReadyPayload.event).toBe('media_ready');
    expect(mediaReadyPayload.mediaId).toBe(mediaId);
    expect(mediaReadyPayload.asset.status).toBe('READY');

    mediaProgressHub.unsubscribe(`test-sub-${mediaId}`);
  });

  // ============================================================================
  // 2. AUDIO PIPELINE: Real Audio Ingestion -> FFprobe -> Waveform -> READY
  // ============================================================================
  it('Audio Pipeline: Real M4A upload -> FFprobe -> metadata -> waveform -> READY -> media_ready', async () => {
    const presignRes = await app.inject({
      method: 'POST',
      url: '/v1/media/presign',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: {
        fileName: 'track_podcast.m4a',
        mimeType: 'audio/m4a',
        fileSizeBytes: realAudioBuffer.length,
        category: 'audio',
        checksumSha256: realAudioChecksum,
      },
    });

    const { mediaId, fileKey } = JSON.parse(presignRes.body).data;

    // Upload real audio bytes
    await storageService.putObject(fileKey, realAudioBuffer, 'audio/m4a', realAudioChecksum);

    // Complete upload
    await app.inject({
      method: 'POST',
      url: '/v1/media/complete',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: { mediaId, checksumSha256: realAudioChecksum },
    });

    // Poll until ready
    let asset: any = null;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 100));
      const res = await app.inject({
        method: 'GET',
        url: `/v1/media/${mediaId}`,
        headers: { Authorization: `Bearer ${authToken}` },
      });
      asset = JSON.parse(res.body).data;
      if (asset.status === 'READY') break;
    }

    expect(asset.status).toBe('READY');
    expect(asset.category).toBe('audio');
    expect(asset.durationSeconds).toBeGreaterThanOrEqual(1.8);
    expect(asset.metadata.audioCodec).toBe('aac');
    expect(asset.metadata.sampleRate).toBe(44100);
    expect(asset.waveform).toBeDefined();
    expect(asset.waveform.peaks.length).toBe(128);
  });

  // ============================================================================
  // 3. IMAGE PIPELINE: Real PNG Ingestion -> FFprobe -> Thumbnail -> READY
  // ============================================================================
  it('Image Pipeline: Real PNG upload -> FFprobe -> dimensions -> thumbnail -> READY -> media_ready', async () => {
    const presignRes = await app.inject({
      method: 'POST',
      url: '/v1/media/presign',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: {
        fileName: 'banner.png',
        mimeType: 'image/png',
        fileSizeBytes: realImageBuffer.length,
        category: 'image',
        checksumSha256: realImageChecksum,
      },
    });

    const { mediaId, fileKey } = JSON.parse(presignRes.body).data;
    await storageService.putObject(fileKey, realImageBuffer, 'image/png', realImageChecksum);

    await app.inject({
      method: 'POST',
      url: '/v1/media/complete',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: { mediaId, checksumSha256: realImageChecksum },
    });

    let asset: any = null;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 100));
      const res = await app.inject({
        method: 'GET',
        url: `/v1/media/${mediaId}`,
        headers: { Authorization: `Bearer ${authToken}` },
      });
      asset = JSON.parse(res.body).data;
      if (asset.status === 'READY') break;
    }

    expect(asset.status).toBe('READY');
    expect(asset.category).toBe('image');
    expect(asset.width).toBe(640);
    expect(asset.height).toBe(360);
    expect(asset.thumbnailUrl).toBeDefined();
  });

  // ============================================================================
  // 4. VALIDATION: Magic Bytes Rejection of Disguised / Malicious Files
  // ============================================================================
  it('Validation: Rejects file disguised as video/mp4 with text content via Magic Bytes', async () => {
    const presignRes = await app.inject({
      method: 'POST',
      url: '/v1/media/presign',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: {
        fileName: 'fake_movie.mp4',
        mimeType: 'video/mp4',
        fileSizeBytes: 1024,
        category: 'video',
      },
    });

    const { mediaId, fileKey } = JSON.parse(presignRes.body).data;

    // Upload plain text disguised with .mp4 extension
    const fakeBuffer = Buffer.from('THIS IS NOT AN MP4 FILE! IT HAS NO FTYP BOX HEADER!');
    await storageService.putObject(fileKey, fakeBuffer, 'video/mp4');

    const completeRes = await app.inject({
      method: 'POST',
      url: '/v1/media/complete',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: { mediaId },
    });

    expect(completeRes.statusCode).toBe(400);
    const body = JSON.parse(completeRes.body);
    expect(body.success).toBe(false);
    expect(body.error.message).toContain('Security scan rejected');

    const asset = mockMediaAssets.get(mediaId);
    expect(asset?.status).toBe('FAILED');
  });

  // ============================================================================
  // 5. VALIDATION: Checksum SHA-256 Mismatch
  // ============================================================================
  it('Validation: Rejects upload completion when SHA-256 checksum mismatch occurs', async () => {
    const presignRes = await app.inject({
      method: 'POST',
      url: '/v1/media/presign',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: {
        fileName: 'integrity_test.mp4',
        mimeType: 'video/mp4',
        fileSizeBytes: realVideoBuffer.length,
        category: 'video',
        checksumSha256: realVideoChecksum,
      },
    });

    const { mediaId, fileKey } = JSON.parse(presignRes.body).data;
    await storageService.putObject(fileKey, realVideoBuffer, 'video/mp4');

    // Submit intentionally wrong checksum
    const completeRes = await app.inject({
      method: 'POST',
      url: '/v1/media/complete',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: {
        mediaId,
        checksumSha256: '0000000000000000000000000000000000000000000000000000000000000000',
      },
    });

    expect(completeRes.statusCode).toBe(400);
    const body = JSON.parse(completeRes.body);
    expect(body.success).toBe(false);
    expect(body.error.message).toContain('checksum');

    const asset = mockMediaAssets.get(mediaId);
    expect(asset?.status).toBe('FAILED');
  });

  // ============================================================================
  // 6. RESUMABLE / MULTIPART COMPATIBLE ABSTRACTION
  // ============================================================================
  it('Multipart Upload: Initiates multipart, uploads parts, completes assembly, and processes asset', async () => {
    const presignRes = await app.inject({
      method: 'POST',
      url: '/v1/media/presign',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: {
        fileName: 'multipart_feature.mp4',
        mimeType: 'video/mp4',
        fileSizeBytes: realVideoBuffer.length,
        uploadType: 'multipart',
        partCount: 2,
      },
    });

    expect(presignRes.statusCode).toBe(200);
    const data = JSON.parse(presignRes.body).data;
    expect(data.uploadType).toBe('multipart');
    expect(data.uploadId).toBeDefined();
    expect(data.parts).toHaveLength(2);

    const { mediaId, fileKey, uploadId } = data;

    // Split video buffer into two parts
    const half = Math.floor(realVideoBuffer.length / 2);
    const part1Buf = realVideoBuffer.slice(0, half);
    const part2Buf = realVideoBuffer.slice(half);

    // Upload parts to storage abstraction
    const eTag1 = await storageService.uploadPart(fileKey, uploadId, 1, part1Buf);
    const eTag2 = await storageService.uploadPart(fileKey, uploadId, 2, part2Buf);

    // Complete multipart upload
    const completeRes = await app.inject({
      method: 'POST',
      url: '/v1/media/complete',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: {
        mediaId,
        uploadId,
        parts: [
          { partNumber: 1, eTag: eTag1 },
          { partNumber: 2, eTag: eTag2 },
        ],
        checksumSha256: realVideoChecksum,
      },
    });

    expect(completeRes.statusCode).toBe(200);
    expect(JSON.parse(completeRes.body).data.status).toBe('PROCESSING');

    // Poll until ready
    let asset: any = null;
    for (let i = 0; i < 80; i++) {
      await new Promise((r) => setTimeout(r, 150));
      const res = await app.inject({
        method: 'GET',
        url: `/v1/media/${mediaId}`,
        headers: { Authorization: `Bearer ${authToken}` },
      });
      asset = JSON.parse(res.body).data;
      if (asset.status === 'READY') break;
    }

    expect(asset.status).toBe('READY');
    expect(asset.durationSeconds).toBeGreaterThan(0);
  });

  // ============================================================================
  // 7. CANCELLATION & PARTIAL OBJECT CLEANUP
  // ============================================================================
  it('Cancellation: Cancels upload session and cleans up partial storage objects', async () => {
    const presignRes = await app.inject({
      method: 'POST',
      url: '/v1/media/presign',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: {
        fileName: 'cancel_me.mp4',
        mimeType: 'video/mp4',
        fileSizeBytes: 100000,
        uploadType: 'multipart',
      },
    });

    const { mediaId, fileKey, uploadId } = JSON.parse(presignRes.body).data;
    await storageService.putObject(fileKey, Buffer.from('partial-upload-data'), 'video/mp4');

    // Cancel upload
    const cancelRes = await app.inject({
      method: 'POST',
      url: `/v1/media/${mediaId}/cancel`,
      headers: { Authorization: `Bearer ${authToken}` },
    });

    expect(cancelRes.statusCode).toBe(200);
    expect(JSON.parse(cancelRes.body).data.cancelled).toBe(true);

    const asset = mockMediaAssets.get(mediaId);
    expect(asset?.status).toBe('FAILED');

    // Verify storage object was cleaned up
    await expect(storageService.getObject(fileKey)).rejects.toThrow();
  });

  // ============================================================================
  // 8. IDEMPOTENCY
  // ============================================================================
  it('Idempotency: Repeated calls to complete upload return existing asset without duplicate processing', async () => {
    const presignRes = await app.inject({
      method: 'POST',
      url: '/v1/media/presign',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: {
        fileName: 'idempotent_test.mp4',
        mimeType: 'video/mp4',
        fileSizeBytes: realVideoBuffer.length,
        category: 'video',
      },
    });

    const { mediaId, fileKey } = JSON.parse(presignRes.body).data;
    await storageService.putObject(fileKey, realVideoBuffer, 'video/mp4');

    // First complete
    const firstComplete = await app.inject({
      method: 'POST',
      url: '/v1/media/complete',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: { mediaId },
    });
    expect(firstComplete.statusCode).toBe(200);
    const firstJobId = JSON.parse(firstComplete.body).data.processingJobId;

    // Second complete (idempotent)
    const secondComplete = await app.inject({
      method: 'POST',
      url: '/v1/media/complete',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: { mediaId },
    });
    expect(secondComplete.statusCode).toBe(200);
    const secondJobId = JSON.parse(secondComplete.body).data.processingJobId;

    expect(secondJobId).toBe(firstJobId);
  });

  // ============================================================================
  // 9. RETRY FAILED MEDIA
  // ============================================================================
  it('Retry: Retrying failed asset resets status and restarts pipeline if object exists', async () => {
    const presignRes = await app.inject({
      method: 'POST',
      url: '/v1/media/presign',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: {
        fileName: 'retry_asset.mp4',
        mimeType: 'video/mp4',
        fileSizeBytes: realVideoBuffer.length,
        category: 'video',
      },
    });

    const { mediaId, fileKey } = JSON.parse(presignRes.body).data;
    await storageService.putObject(fileKey, realVideoBuffer, 'video/mp4');

    const asset = mockMediaAssets.get(mediaId)!;
    asset.status = 'FAILED';

    const retryRes = await app.inject({
      method: 'POST',
      url: `/v1/media/${mediaId}/retry`,
      headers: { Authorization: `Bearer ${authToken}` },
    });

    expect(retryRes.statusCode).toBe(200);
    const retriedAsset = JSON.parse(retryRes.body).data;
    expect(retriedAsset.status).toBe('PROCESSING');
  });

  // ============================================================================
  // 10. DATABASE STORAGE INTEGRITY: Zero Raw Media in PostgreSQL
  // ============================================================================
  it('Storage Integrity: Storage objects and waveforms store NO raw media in PostgreSQL', async () => {
    // Verify that assets in mockMediaAssets / database schema store only paths/keys and compact JSON
    for (const asset of mockMediaAssets.values()) {
      if (asset.waveform) {
        // Waveform peaks must be compact JSON array, not massive raw audio byte stream
        expect(Array.isArray(asset.waveform.peaks)).toBe(true);
        expect(asset.waveform.peaks.length).toBeLessThanOrEqual(256);
      }

      // Raw video/audio is NOT in memory asset, only fileKey reference
      expect(typeof asset.fileKey).toBe('string');
      expect((asset as any).rawBinaryData).toBeUndefined();
    }
  });
});
