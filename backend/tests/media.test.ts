import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { buildApp } from '../src/app.js';

describe('Production Media Storage & Object Lifecycle Module', () => {
  let app: FastifyInstance;
  let authToken: string;
  let directMediaId: string;
  let singlePartMediaId: string;
  let multipartMediaId: string;
  let multipartUploadId: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    // Register a test user
    const regRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: `media_director_${Date.now()}@techxayan.com`,
        password: 'Password123!',
        displayName: 'TechXayan Lead Editor',
      },
    });

    const body = JSON.parse(regRes.body);
    authToken = body.data.tokens.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  // 1. DIRECT UPLOAD (SMALL ASSETS: LUT, FONT, STICKER)
  it('POST /v1/media/upload directly uploads small creative asset (LUT)', async () => {
    const lutContent = 'TITLE "Teal_And_Orange_3D_LUT"\nLUT_3D_SIZE 2\n0.0 0.0 0.0\n1.0 1.0 1.0';
    const base64Data = Buffer.from(lutContent).toString('base64');
    const checksum = crypto.createHash('sha256').update(Buffer.from(lutContent)).digest('hex');

    const res = await app.inject({
      method: 'POST',
      url: '/v1/media/upload',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: {
        fileName: 'Teal_Orange.cube',
        mimeType: 'application/x-lut',
        fileBase64: base64Data,
        category: 'lut',
        checksumSha256: checksum,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('Teal_Orange.cube');
    expect(body.data.category).toBe('lut');
    expect(body.data.status).toBe('READY');
    expect(body.data.checksumSha256).toBe(checksum);
    expect(body.data.downloadUrl).toBeDefined();

    directMediaId = body.data.id;
  });

  // 2. PRESIGN SINGLE-PART UPLOAD (IMAGE)
  it('POST /v1/media/presign generates direct PUT presigned URL for image', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/media/presign',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: {
        fileName: 'storyboard_frame_01.png',
        mimeType: 'image/png',
        fileSizeBytes: 5242880, // 5 MB
        category: 'image',
        uploadType: 'direct',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.uploadType).toBe('direct');
    expect(body.data.url).toBeDefined();
    expect(body.data.fileKey).toContain('image');
    expect(body.data.mediaId).toBeDefined();

    singlePartMediaId = body.data.mediaId;

    // Verify asset is in UPLOADING state
    const checkRes = await app.inject({
      method: 'GET',
      url: `/v1/media/${singlePartMediaId}`,
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(checkRes.statusCode).toBe(200);
    expect(JSON.parse(checkRes.body).data.status).toBe('UPLOADING');
  });

  // 3. PRESIGN MULTIPART UPLOAD (LARGE 4K/8K VIDEO)
  it('POST /v1/media/presign initiates multipart upload for video > 50MB', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/media/presign',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: {
        fileName: 'FX3_Cinematic_4K_Scene1.mp4',
        mimeType: 'video/mp4',
        fileSizeBytes: 209715200, // 200 MB
        category: 'video',
        uploadType: 'auto', // Auto determines multipart because > 50MB
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.uploadType).toBe('multipart');
    expect(body.data.uploadId).toBeDefined();
    expect(body.data.parts).toBeDefined();
    expect(body.data.parts.length).toBeGreaterThan(1);
    expect(body.data.parts[0].url).toBeDefined();

    multipartMediaId = body.data.mediaId;
    multipartUploadId = body.data.uploadId;
  });

  // 4. COMPLETE MULTIPART UPLOAD & SECURITY SCAN
  it('POST /v1/media/complete finalizes multipart upload and transitions to READY', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/media/complete',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: {
        mediaId: multipartMediaId,
        uploadId: multipartUploadId,
        parts: [
          { partNumber: 1, eTag: '"part-1-etag"' },
          { partNumber: 2, eTag: '"part-2-etag"' },
        ],
        width: 3840,
        height: 2160,
        durationSeconds: 125.4,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(multipartMediaId);
    expect(body.data.status).toBe('READY');
    expect(body.data.width).toBe(3840);
    expect(body.data.height).toBe(2160);
    expect(body.data.durationSeconds).toBe(125.4);
    expect(body.data.scanResult.status).toBe('passed');
    expect(body.data.downloadUrl).toBeDefined();
  });

  // 5. SECURITY SCAN HOOK DETECTION OF MALICIOUS SCRIPTS
  it('Rejects malicious SVG scripts during security scan', async () => {
    const maliciousSvg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert("hacked")</script></svg>';
    const base64Data = Buffer.from(maliciousSvg).toString('base64');

    const res = await app.inject({
      method: 'POST',
      url: '/v1/media/upload',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: {
        fileName: 'exploit_vector.svg',
        mimeType: 'image/svg+xml',
        fileBase64: base64Data,
        category: 'image',
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.error.message).toMatch(/Security scan failed|Malicious JavaScript/i);
  });

  // 6. CONTENT TYPE VALIDATION
  it('Rejects unapproved MIME types for given category', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/media/presign',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: {
        fileName: 'malware.exe',
        mimeType: 'application/x-msdownload',
        fileSizeBytes: 1048576,
        category: 'video',
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.error.message).toMatch(/not permitted/i);
  });

  // 7. FILE SIZE QUOTA VALIDATION
  it('Rejects files exceeding category size limits', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/media/presign',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: {
        fileName: 'huge_font.ttf',
        mimeType: 'font/ttf',
        fileSizeBytes: 60 * 1024 * 1024, // 60 MB (exceeds 50MB limit)
        category: 'font',
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.error.message).toMatch(/exceeds the maximum allowed limit/i);
  });

  // 8. CANCEL IN-PROGRESS UPLOAD
  it('POST /v1/media/:id/cancel aborts upload and marks asset FAILED', async () => {
    // Initiate upload
    const initRes = await app.inject({
      method: 'POST',
      url: '/v1/media/presign',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: {
        fileName: 'cancelled_upload.mp4',
        mimeType: 'video/mp4',
        fileSizeBytes: 60000000,
        category: 'video',
      },
    });
    const mediaId = JSON.parse(initRes.body).data.mediaId;

    // Cancel
    const cancelRes = await app.inject({
      method: 'POST',
      url: `/v1/media/${mediaId}/cancel`,
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(cancelRes.statusCode).toBe(200);
    expect(JSON.parse(cancelRes.body).data.cancelled).toBe(true);

    // Verify status is now FAILED
    const checkRes = await app.inject({
      method: 'GET',
      url: `/v1/media/${mediaId}`,
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(JSON.parse(checkRes.body).data.status).toBe('FAILED');
  });

  // 9. LIST MEDIA ASSETS WITH CATEGORY & STATUS FILTERING
  it('GET /v1/media lists and filters media assets', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/media?category=lut&status=READY',
      headers: { Authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    expect(body.data[0].category).toBe('lut');
  });

  // 10. DELETE MEDIA (SOFT-DELETE & STORAGE CLEANUP)
  it('DELETE /v1/media/:id marks DELETED and excludes from active queries', async () => {
    const delRes = await app.inject({
      method: 'DELETE',
      url: `/v1/media/${directMediaId}`,
      headers: { Authorization: `Bearer ${authToken}` },
    });

    expect(delRes.statusCode).toBe(200);
    expect(JSON.parse(delRes.body).data.deleted).toBe(true);

    // Subsequent GET returns 404
    const getRes = await app.inject({
      method: 'GET',
      url: `/v1/media/${directMediaId}`,
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(getRes.statusCode).toBe(404);
  });

  // 11. BACKWARDS COMPATIBILITY
  it('Maintains legacy POST /api/v1/media/upload-url and confirm endpoints', async () => {
    const presignRes = await app.inject({
      method: 'POST',
      url: '/v1/media/upload-url',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: {
        fileName: 'legacy_clip.mp4',
        mimeType: 'video/mp4',
        fileSizeBytes: 10485760,
      },
    });
    expect(presignRes.statusCode).toBe(200);
    const fileKey = JSON.parse(presignRes.body).data.fileKey;

    const confirmRes = await app.inject({
      method: 'POST',
      url: '/v1/media/confirm',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: {
        fileKey,
        fileName: 'legacy_clip.mp4',
        mimeType: 'video/mp4',
        fileSizeBytes: 10485760,
      },
    });
    expect(confirmRes.statusCode).toBe(201);
    expect(JSON.parse(confirmRes.body).data.status).toBe('READY');
  });
});

