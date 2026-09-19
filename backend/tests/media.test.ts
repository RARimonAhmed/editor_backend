import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

describe('Media Assets & Storage Module', () => {
  let app: FastifyInstance;
  let authToken: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    // Register a test user
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `media_${Date.now()}@techxayan.com`,
        password: 'Password123!',
        displayName: 'Media Tester',
      },
    });

    const body = JSON.parse(regRes.body);
    authToken = body.data.tokens.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /api/v1/media/upload-url generates presigned direct S3 upload URL', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/media/upload-url',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: {
        fileName: 'raw_footage_4k.mp4',
        mimeType: 'video/mp4',
        fileSizeBytes: 524288000, // 500 MB
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.url).toBeDefined();
    expect(body.data.fileKey).toContain('raw_footage_4k.mp4');
  });

  it('POST /api/v1/media/confirm indexes asset into catalog', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/media/confirm',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: {
        fileKey: 'users/123/assets/sample.mp4',
        fileName: 'sample.mp4',
        mimeType: 'video/mp4',
        fileSizeBytes: 10485760,
        durationSeconds: 15.5,
        width: 1920,
        height: 1080,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('sample.mp4');
    expect(body.data.downloadUrl).toBeDefined();
  });
});
